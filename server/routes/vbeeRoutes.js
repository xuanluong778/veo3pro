import { Router } from 'express';
import { createVbeeClient, waitForTtsAudio } from '../services/vbeeClient.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getProxyDispatcher, getProxyUrlFromReq } from '../services/proxyService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'vbee-preview-cache');
const TTS_CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'vbee-tts-cache');

function safeVoiceSlug(voiceCode) {
  return String(voiceCode || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function textHash(inputText) {
  return crypto.createHash('md5').update(String(inputText || ''), 'utf8').digest('hex').slice(0, 12);
}

async function ensurePreviewCacheDir() {
  await fs.mkdir(PREVIEW_CACHE_DIR, { recursive: true });
}

async function ensureTtsCacheDir() {
  await fs.mkdir(TTS_CACHE_DIR, { recursive: true });
}

function inferExt(audioUrl, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('wav')) return '.wav';
  if (ct.includes('mpeg') || ct.includes('mp3')) return '.mp3';
  if (ct.includes('ogg')) return '.ogg';
  const u = String(audioUrl || '').toLowerCase();
  if (u.endsWith('.wav')) return '.wav';
  if (u.endsWith('.ogg')) return '.ogg';
  return '.mp3';
}

function getVbeeConfig() {
  const appId = String(process.env.VBEE_APP_ID || '').trim();
  const token = String(process.env.VBEE_TOKEN || '').trim();
  const baseUrl = String(process.env.VBEE_API_BASE || '').trim() || undefined;
  const callbackUrl = String(process.env.VBEE_CALLBACK_URL || '').trim();
  return { appId, token, baseUrl, callbackUrl };
}

/**
 * Router backend — giữ token trong env, không gửi xuống trình duyệt.
 */
export function createVbeeRouter() {
  const r = Router();

  /** Kiểm tra cấu hình (không gọi Vbee). */
  r.get('/config-status', (_req, res) => {
    const { appId, token, callbackUrl } = getVbeeConfig();
    res.json({
      ok: Boolean(appId && token),
      hasAppId: Boolean(appId),
      hasToken: Boolean(token),
      hasCallbackUrl: Boolean(callbackUrl),
    });
  });

  /** GET /api/vbee/voices — danh sách voice_code hợp lệ từ Vbee */
  r.get('/voices', async (req, res) => {
    try {
      const { appId, token, baseUrl, callbackUrl } = getVbeeConfig();
      if (!appId || !token) {
        return res.status(503).json({ error: 'Chưa cấu hình VBEE_APP_ID / VBEE_TOKEN trong .env.' });
      }
      const client = createVbeeClient({ appId, token, baseUrl, proxyUrl: getProxyUrlFromReq(req) });
      const result = await client.listVoices();
      const voices = Array.isArray(result?.voices) ? result.voices : [];
      res.json({ ok: true, total: Number(result?.metadata?.total || voices.length || 0), voices });
    } catch (e) {
      console.error('[vbee voices]', e);
      res.status(500).json({ error: e.message || 'Không lấy được danh sách giọng Vbee.' });
    }
  });

  /**
   * GET /api/vbee/request/:requestId — trạng thái một request (audio_link khi SUCCESS).
   */
  r.get('/request/:requestId', async (req, res) => {
    try {
      const { appId, token, baseUrl, callbackUrl } = getVbeeConfig();
      if (!appId || !token) {
        return res.status(503).json({ error: 'Chưa cấu hình VBEE_APP_ID / VBEE_TOKEN trong .env.' });
      }
      const client = createVbeeClient({ appId, token, baseUrl, proxyUrl: getProxyUrlFromReq(req) });
      const result = await client.getRequest(req.params.requestId);
      res.json({ ok: true, result });
    } catch (e) {
      console.error('[vbee request]', e);
      res.status(500).json({ error: e.message || 'Lỗi gọi Vbee.' });
    }
  });

  /**
   * POST /api/vbee/tts — tạo TTS. Body gồm inputText, voiceCode, ...
   * Cần VBEE_CALLBACK_URL (URL công khai HTTPS nếu Vbee phải gọi về).
   * poll: true — chờ và trả về audio qua GET /tts/{id} (không cần webhook hoạt động).
   */
  r.post('/tts', async (req, res) => {
    try {
      const { appId, token, baseUrl, callbackUrl } = getVbeeConfig();
      if (!appId || !token) {
        return res.status(503).json({ error: 'Chưa cấu hình VBEE_APP_ID / VBEE_TOKEN trong .env.' });
      }

      const inputText =
        typeof req.body?.inputText === 'string'
          ? req.body.inputText
          : typeof req.body?.input_text === 'string'
            ? req.body.input_text
            : '';
      const voiceCode =
        typeof req.body?.voiceCode === 'string'
          ? req.body.voiceCode.trim()
          : typeof req.body?.voice_code === 'string'
            ? req.body.voice_code.trim()
            : '';

      if (!inputText.trim()) {
        return res.status(400).json({ error: 'Thiếu inputText (hoặc input_text).' });
      }
      if (!voiceCode) {
        return res.status(400).json({ error: 'Thiếu voiceCode (mã giọng Vbee).' });
      }

      const cb =
        typeof req.body?.callbackUrl === 'string' && req.body.callbackUrl.trim()
          ? req.body.callbackUrl.trim()
          : callbackUrl;
      if (!cb) {
        return res.status(400).json({
          error:
            'Thiếu callback URL. Thêm VBEE_CALLBACK_URL trong .env hoặc gửi callbackUrl trong body (bắt buộc theo tài liệu Vbee).',
        });
      }

      const audioType = typeof req.body?.audioType === 'string' ? req.body.audioType : req.body?.audio_type;
      const bitrate = req.body?.bitrate != null ? req.body.bitrate : undefined;
      const speedRate = req.body?.speedRate != null ? req.body.speedRate : req.body?.speed_rate;
      const sampleRate = req.body?.sampleRate != null ? req.body.sampleRate : req.body?.sample_rate;
      const emphasisIntensity =
        req.body?.emphasisIntensity != null ? req.body.emphasisIntensity : req.body?.emphasis_intensity;
      const poll = Boolean(req.body?.poll);

      const createBody = {
        response_type: 'indirect',
        callback_url: cb,
        input_text: inputText,
        voice_code: voiceCode,
      };
      if (audioType != null) createBody.audio_type = audioType;
      if (bitrate != null) createBody.bitrate = bitrate;
      if (speedRate != null) createBody.speed_rate = speedRate;
      if (sampleRate != null) createBody.sample_rate = sampleRate;
      if (emphasisIntensity != null) createBody.emphasis_intensity = emphasisIntensity;

      const client = createVbeeClient({ appId, token, baseUrl, proxyUrl: getProxyUrlFromReq(req) });
      const created = await client.createSpeech(createBody);

      const requestId = created?.request_id;
      if (!requestId) {
        return res.json({ ok: true, created, polled: null });
      }

      if (!poll) {
        return res.json({ ok: true, created, requestId });
      }

      const finalResult = await waitForTtsAudio(client, requestId, {
        maxWaitMs: Number(req.body?.pollMaxMs) > 0 ? Number(req.body.pollMaxMs) : undefined,
        intervalMs: Number(req.body?.pollIntervalMs) > 0 ? Number(req.body.pollIntervalMs) : undefined,
      });

      res.json({
        ok: true,
        created,
        requestId,
        result: finalResult,
        audioUrl: finalResult?.audio_link,
      });
    } catch (e) {
      console.error('[vbee tts]', e);
      res.status(500).json({ error: e.message || 'Lỗi gọi Vbee TTS.' });
    }
  });

  /**
   * POST /api/vbee/tts-cache
   * TTS có cache theo voice_code + text hash. Nếu đã có file thì trả ngay.
   * Nếu chưa có: gọi Vbee (poll) -> tải audio -> lưu file -> trả localUrl.
   */
  r.post('/tts-cache', async (req, res) => {
    try {
      const { appId, token, baseUrl, callbackUrl } = getVbeeConfig();
      if (!appId || !token) {
        return res.status(503).json({ error: 'Chưa cấu hình VBEE_APP_ID / VBEE_TOKEN trong .env.' });
      }

      const inputText =
        typeof req.body?.inputText === 'string'
          ? req.body.inputText
          : typeof req.body?.input_text === 'string'
            ? req.body.input_text
            : '';
      const voiceCode =
        typeof req.body?.voiceCode === 'string'
          ? req.body.voiceCode.trim()
          : typeof req.body?.voice_code === 'string'
            ? req.body.voice_code.trim()
            : '';

      if (!inputText.trim()) return res.status(400).json({ error: 'Thiếu inputText (hoặc input_text).' });
      if (!voiceCode) return res.status(400).json({ error: 'Thiếu voiceCode (mã giọng Vbee).' });

      const cb =
        typeof req.body?.callbackUrl === 'string' && req.body.callbackUrl.trim()
          ? req.body.callbackUrl.trim()
          : callbackUrl;
      if (!cb) {
        return res.status(400).json({
          error:
            'Thiếu callback URL. Thêm VBEE_CALLBACK_URL trong .env hoặc gửi callbackUrl trong body (bắt buộc theo tài liệu Vbee).',
        });
      }

      await ensureTtsCacheDir();
      const slug = safeVoiceSlug(voiceCode);
      const tHash = textHash(inputText.trim());
      if (!slug) return res.status(400).json({ error: 'voiceCode không hợp lệ.' });

      const existing = await fs.readdir(TTS_CACHE_DIR);
      const matched = existing.find((f) => f.startsWith(`${slug}__${tHash}.`));
      if (matched) {
        return res.json({
          ok: true,
          cached: true,
          localUrl: `/api/vbee/tts-cache-file/${encodeURIComponent(matched)}`,
        });
      }

      const audioType = typeof req.body?.audioType === 'string' ? req.body.audioType : req.body?.audio_type;
      const bitrate = req.body?.bitrate != null ? req.body.bitrate : undefined;
      const speedRate = req.body?.speedRate != null ? req.body.speedRate : req.body?.speed_rate;
      const sampleRate = req.body?.sampleRate != null ? req.body.sampleRate : req.body?.sample_rate;
      const emphasisIntensity =
        req.body?.emphasisIntensity != null ? req.body.emphasisIntensity : req.body?.emphasis_intensity;

      const proxyUrl = getProxyUrlFromReq(req);
      const dispatcher = getProxyDispatcher(proxyUrl);
      const client = createVbeeClient({ appId, token, baseUrl, proxyUrl });
      const createBody = {
        response_type: 'indirect',
        callback_url: cb,
        input_text: inputText,
        voice_code: voiceCode,
      };
      if (audioType != null) createBody.audio_type = audioType;
      if (bitrate != null) createBody.bitrate = bitrate;
      if (speedRate != null) createBody.speed_rate = speedRate;
      if (sampleRate != null) createBody.sample_rate = sampleRate;
      if (emphasisIntensity != null) createBody.emphasis_intensity = emphasisIntensity;

      const created = await client.createSpeech(createBody);
      const requestId = created?.request_id;
      if (!requestId) {
        return res.json({ ok: true, cached: false, created, requestId: null });
      }

      const finalResult = await waitForTtsAudio(client, requestId, {
        maxWaitMs: Number(req.body?.pollMaxMs) > 0 ? Number(req.body.pollMaxMs) : undefined,
        intervalMs: Number(req.body?.pollIntervalMs) > 0 ? Number(req.body.pollIntervalMs) : undefined,
      });

      const audioUrl = String(finalResult?.audio_link || '').trim();
      if (!audioUrl) {
        return res.json({ ok: true, cached: false, created, requestId, result: finalResult, audioUrl: '' });
      }

      const audioResp = await fetch(audioUrl, dispatcher ? { dispatcher } : undefined);
      if (!audioResp.ok) throw new Error(`Không tải được audio từ Vbee (${audioResp.status}).`);
      const contentType = audioResp.headers.get('content-type') || '';
      const ext = inferExt(audioUrl, contentType);
      const fileName = `${slug}__${tHash}${ext}`;
      const fullPath = path.join(TTS_CACHE_DIR, fileName);
      const buf = Buffer.from(await audioResp.arrayBuffer());
      await fs.writeFile(fullPath, buf);

      res.json({
        ok: true,
        cached: false,
        requestId,
        localUrl: `/api/vbee/tts-cache-file/${encodeURIComponent(fileName)}`,
      });
    } catch (e) {
      console.error('[vbee tts-cache]', e);
      res.status(500).json({ error: e.message || 'Lỗi gọi Vbee TTS (cache).' });
    }
  });

  /** GET /api/vbee/tts-cache-file/:fileName — trả file audio cache */
  r.get('/tts-cache-file/:fileName', async (req, res) => {
    try {
      const fileName = path.basename(String(req.params.fileName || ''));
      if (!fileName) return res.status(400).json({ error: 'Thiếu tên file.' });
      const fullPath = path.join(TTS_CACHE_DIR, fileName);
      const st = await fs.stat(fullPath).catch(() => null);
      if (!st || !st.isFile()) return res.status(404).json({ error: 'Không tìm thấy file cache.' });
      const ext = path.extname(fileName).toLowerCase();
      const mime = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg';
      res.setHeader('Content-Type', mime);
      res.sendFile(fullPath);
    } catch (e) {
      console.error('[vbee tts-cache-file]', e);
      res.status(500).json({ error: e.message || 'Không đọc được file cache.' });
    }
  });

  /**
   * POST /api/vbee/preview-cache
   * Tạo audio nghe thử theo voice_code và lưu cache file tại server.
   * Nếu đã có cache thì trả lại luôn, không gọi Vbee nữa.
   */
  r.post('/preview-cache', async (req, res) => {
    try {
      const { appId, token, baseUrl, callbackUrl } = getVbeeConfig();
      if (!appId || !token) {
        return res.status(503).json({ error: 'Chưa cấu hình VBEE_APP_ID / VBEE_TOKEN trong .env.' });
      }
      const voiceCode = typeof req.body?.voiceCode === 'string' ? req.body.voiceCode.trim() : '';
      const inputText = typeof req.body?.inputText === 'string' ? req.body.inputText.trim() : '';
      if (!voiceCode) return res.status(400).json({ error: 'Thiếu voiceCode.' });
      if (!inputText) return res.status(400).json({ error: 'Thiếu inputText.' });

      await ensurePreviewCacheDir();
      const slug = safeVoiceSlug(voiceCode);
      const tHash = textHash(inputText);
      if (!slug) return res.status(400).json({ error: 'voiceCode không hợp lệ.' });

      const existing = await fs.readdir(PREVIEW_CACHE_DIR);
      const matched = existing.find((f) => f.startsWith(`${slug}__${tHash}.`));
      if (matched) {
        return res.json({
          ok: true,
          cached: true,
          localUrl: `/api/vbee/preview-cache-file/${encodeURIComponent(matched)}`,
        });
      }

      const proxyUrl = getProxyUrlFromReq(req);
      const dispatcher = getProxyDispatcher(proxyUrl);
      const client = createVbeeClient({ appId, token, baseUrl, proxyUrl });
      const cacheFromAudioUrl = async (audioUrl) => {
        const audioResp = await fetch(audioUrl, dispatcher ? { dispatcher } : undefined);
        if (!audioResp.ok) throw new Error(`Không tải được audio từ Vbee (${audioResp.status}).`);
        const contentType = audioResp.headers.get('content-type') || '';
        const ext = inferExt(audioUrl, contentType);
        const fileName = `${slug}__${tHash}${ext}`;
        const fullPath = path.join(PREVIEW_CACHE_DIR, fileName);
        const buf = Buffer.from(await audioResp.arrayBuffer());
        await fs.writeFile(fullPath, buf);
        return fileName;
      };

      let resolvedVoiceCode = voiceCode;
      let demoUrl = '';
      try {
        const listed = await client.listVoices();
        const voices = Array.isArray(listed?.voices) ? listed.voices : [];
        const byCode = voices.find((v) => {
          const c = String(v?.code || v?.voice_code || '').trim();
          const cache = String(v?.caching_function || '').trim();
          return c === voiceCode || cache === voiceCode;
        });
        if (byCode) {
          resolvedVoiceCode = String(byCode?.code || byCode?.voice_code || voiceCode).trim();
          demoUrl = String(byCode?.demo || byCode?.sample?.audio_link || '').trim();
        }
        // Nếu không tìm thấy trong page hiện tại của /voices, vẫn cho fallback createSpeech bên dưới.
      } catch {
        // Nếu list voices bị lỗi, fallback dùng code client gửi lên.
      }

      // Ưu tiên tạo đúng câu preview ngắn người dùng yêu cầu.
      const cb =
        typeof req.body?.callbackUrl === 'string' && req.body.callbackUrl.trim()
          ? req.body.callbackUrl.trim()
          : callbackUrl;
      if (!cb) {
        return res.status(400).json({
          error: 'Thiếu callback URL. Thêm VBEE_CALLBACK_URL trong .env hoặc gửi callbackUrl trong body.',
        });
      }
      try {
        const created = await client.createSpeech({
          response_type: 'indirect',
          callback_url: cb,
          input_text: inputText,
          voice_code: resolvedVoiceCode,
        });
        const requestId = created?.request_id;
        if (!requestId) throw new Error('Không nhận được request_id từ Vbee.');
        const finalResult = await waitForTtsAudio(client, requestId, { maxWaitMs: 120_000, intervalMs: 1500 });
        const audioUrl = String(finalResult?.audio_link || '').trim();
        if (!audioUrl) throw new Error('Vbee chưa trả audio_link.');
        const fileName = await cacheFromAudioUrl(audioUrl);
        return res.json({
          ok: true,
          cached: false,
          source: 'tts',
          localUrl: `/api/vbee/preview-cache-file/${encodeURIComponent(fileName)}`,
        });
      } catch (ttsErr) {
        // Fallback cuối: nếu giọng này có demo/sample thì vẫn cho nghe để tránh "không nghe được".
        if (demoUrl) {
          const absoluteDemoUrl = demoUrl.startsWith('http') ? demoUrl : `https://vbee.vn${demoUrl}`;
          const fileName = await cacheFromAudioUrl(absoluteDemoUrl);
          return res.json({
            ok: true,
            cached: false,
            source: 'demo',
            localUrl: `/api/vbee/preview-cache-file/${encodeURIComponent(fileName)}`,
          });
        }
        throw ttsErr;
      }
    } catch (e) {
      console.error('[vbee preview-cache]', e);
      res.status(500).json({ error: e.message || 'Không thể tạo cache audio nghe thử.' });
    }
  });

  /** GET /api/vbee/preview-cache-file/:fileName — trả file audio cache */
  r.get('/preview-cache-file/:fileName', async (req, res) => {
    try {
      const fileName = path.basename(String(req.params.fileName || ''));
      if (!fileName) return res.status(400).json({ error: 'Thiếu tên file.' });
      const fullPath = path.join(PREVIEW_CACHE_DIR, fileName);
      const st = await fs.stat(fullPath).catch(() => null);
      if (!st || !st.isFile()) return res.status(404).json({ error: 'Không tìm thấy file cache.' });
      const ext = path.extname(fileName).toLowerCase();
      const mime = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg';
      res.setHeader('Content-Type', mime);
      res.sendFile(fullPath);
    } catch (e) {
      console.error('[vbee preview-cache-file]', e);
      res.status(500).json({ error: e.message || 'Không đọc được file cache.' });
    }
  });

  return r;
}
