import express, { Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadEnv } from './bootstrap/loadEnv.js';
import { assertJwtConfigured } from './services/authService.js';
import { buildVeoInstance, veoPredictLongRunning, veoGetOperation } from './services/veoService.js';
import { createFlowRouter } from './routes/flowRoutes.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createPromptRouter } from './routes/promptRoutes.js';
import { createPromptStudioDraftRouter } from './routes/promptStudioDraftRoutes.js';
import { createVideoAnalysisRouter } from './routes/videoAnalysisRoutes.js';
import { createYoutubeSeoRouter } from './routes/youtubeSeoRoutes.js';
import { createVbeeRouter } from './routes/vbeeRoutes.js';
import { createProductRouter } from './routes/productRoutes.js';
import { createUserKeysRouter } from './routes/userKeysRoutes.js';
import { createToolsRouter } from './routes/toolsRoutes.js';
import { createVideoCreateRouter } from './routes/videoCreateRoutes.js';
import { requireAuth } from './middleware/requireAuth.js';
import { recoverInterruptedJobsOnStartup } from './flow/jobRecovery.js';
import { attachFlowUserContext } from './middleware/flowUserContext.js';
import { isQueueModeEnabled } from './services/quotaService.js';
import {
  resolveGeminiApiKeyForUser,
  resolveGeminiApiKeyFromUserRow,
  resolveOpenAiStackFromProfiles,
  resolveOpenAiStackFromUserRow,
  geminiRestKeyCandidatesFromRequest,
  geminiRestCandidatesDetailedFromRequest,
  isGeminiQuotaLikeErrorMessage,
} from './services/apiKeyResolution.js';
import { verifyAuthToken, AUTH_COOKIE_NAME } from './services/authService.js';
import { findUserById } from './services/userStore.js';
import { getUserVideoPreferences } from './services/videoPreferenceService.js';
import { getEffectiveProxyUrlFromReq, getProxyDispatcher } from './services/proxyService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build Express app (shared by `server/index.js` and Vercel `api/server.js`).
 * @returns {Promise<import('express').Express>}
 */
export async function createApp() {
  loadEnv();

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const j = String(process.env.JWT_SECRET || '').trim();
    if (j.length < 16) {
      process.env.JWT_SECRET = 'veo3pro-dev-only-jwt-secret-min-16-chars';
      console.warn(
        '[auth] JWT_SECRET missing or < 16 chars — using local dev default. Set JWT_SECRET in .env before production.',
      );
    }
  }

  try {
    assertJwtConfigured();
  } catch (e) {
    console.error('[auth]', e.message);
    if (process.env.VERCEL) throw e;
    process.exit(1);
  }

  recoverInterruptedJobsOnStartup().catch(() => {});

  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '80mb' }));
  app.use(attachFlowUserContext);

  /**
   * OpenAI/Grok stack: profile (theo slug client) → user row → .env.
   * Gemini: getApiKey — cùng thứ tự; .env chỉ sau khi hết key profile + tài khoản (xem apiKeyResolution.js).
   */
  function getResolvedOpenAiStack(req) {
    if (req._veo3proOpenAiStack) return req._veo3proOpenAiStack;
    const hdrKey = req?.headers?.['x-user-openai-api-key'];
    if (typeof hdrKey === 'string' && hdrKey.trim()) {
      const hdrBase = req?.headers?.['x-user-openai-base-url'];
      const baseUrl = typeof hdrBase === 'string' && hdrBase.trim() ? hdrBase.trim() : '';
      req._veo3proOpenAiStack = { apiKey: hdrKey.trim(), baseUrl };
      return req._veo3proOpenAiStack;
    }
    const uid = req?.user?.id;
    const slug =
      typeof req?.headers?.['x-veo3pro-profile-slug'] === 'string' ? req.headers['x-veo3pro-profile-slug'].trim() : '';
    try {
      if (uid) {
        const fromProfiles = resolveOpenAiStackFromProfiles(uid, slug);
        if (fromProfiles?.apiKey) {
          req._veo3proOpenAiStack = fromProfiles;
          return req._veo3proOpenAiStack;
        }
        const fromUser = resolveOpenAiStackFromUserRow(uid);
        if (fromUser?.apiKey) {
          req._veo3proOpenAiStack = fromUser;
          return req._veo3proOpenAiStack;
        }
      }
    } catch {
      /* ignore */
    }
    const k = String(process.env.OPENAI_API_KEY || '').trim();
    if (!k) {
      throw new Error(
        uid
          ? 'Chưa có OpenAI/Grok API: thêm key trong Cài đặt → Kết nối API hoặc OPENAI_API_KEY trong .env.'
          : 'Chưa cấu hình OPENAI_API_KEY trong .env.',
      );
    }
    const env = String(process.env.OPENAI_BASE_URL || '').trim();
    req._veo3proOpenAiStack = { apiKey: k, baseUrl: env };
    return req._veo3proOpenAiStack;
  }

  function getApiKey(req) {
    const hdr = req?.headers?.['x-user-gemini-api-key'];
    if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();
    const uid = req?.user?.id;
    const slug =
      typeof req?.headers?.['x-veo3pro-profile-slug'] === 'string' ? req.headers['x-veo3pro-profile-slug'].trim() : '';
    try {
      if (uid) {
        const k = resolveGeminiApiKeyForUser(uid, slug);
        if (k) return k;
        const ku = resolveGeminiApiKeyFromUserRow(uid);
        if (ku) return ku;
      }
    } catch {
      /* ignore */
    }
    const k = process.env.GEMINI_API_KEY;
    if (!k) {
      throw new Error(
        uid
          ? 'Chưa có Gemini API: thêm key trong Cài đặt → Kết nối API (profile/tài khoản) hoặc GEMINI_API_KEY trong .env làm dự phòng.'
          : 'Chưa cấu hình GEMINI_API_KEY (file .env trong thư mục gốc).',
      );
    }
    return k;
  }

  function getOpenAiKey(req) {
    return getResolvedOpenAiStack(req).apiKey;
  }

  function getOpenAiBaseUrl(req) {
    return getResolvedOpenAiStack(req).baseUrl || '';
  }

  if (process.env.REDIS_URL && isQueueModeEnabled() && process.env.FLOW_RUN_WORKERS !== 'false') {
    const { registerFlowWorkers } = await import('./queue/registerWorkers.js');
    registerFlowWorkers({ getApiKey });
  }

  app.use('/api/auth', createAuthRouter());

  app.use('/api/user-keys', requireAuth, createUserKeysRouter());

  app.use('/api/tools', requireAuth, createToolsRouter());

  app.use('/api/video', requireAuth, createVideoCreateRouter({ getApiKey }));

  app.use('/api/prompt', requireAuth, createPromptRouter({ getApiKey, getOpenAiKey, getOpenAiBaseUrl }));

  app.use('/api/prompt-studio-draft', requireAuth, createPromptStudioDraftRouter());

  app.use('/api/video-analysis', requireAuth, createVideoAnalysisRouter({ getApiKey }));

  app.use('/api/youtube-seo', requireAuth, createYoutubeSeoRouter({ getApiKey, getOpenAiKey, getOpenAiBaseUrl }));

  app.use('/api/vbee', requireAuth, createVbeeRouter());

  app.use('/api/product', requireAuth, createProductRouter());

  app.use('/api/flow', requireAuth, createFlowRouter({ getApiKey }));

  /** Nhớ API key đã khởi chạy Veo để /status & /download dùng đúng key (đặc biệt sau khi fallback sang key khác). */
  const VEO_OP_CACHE_MS = 6 * 60 * 60 * 1000;
  const VEO_OP_CACHE_MAX = 6000;
  /** @type {Map<string, { userId: string, apiKey: string }>} */
  const veoOperationApiKeyByName = new Map();

  function normalizeGoogleOperationName(operationName) {
    let s = String(operationName || '').trim();
    if (!s) return s;
    try {
      s = decodeURIComponent(s);
    } catch {
      /* giữ */
    }
    return s;
  }

  function rememberVeoOperationApiKey(operationName, userId, apiKey, usedSource) {
    const op = normalizeGoogleOperationName(operationName);
    if (!op || !userId || !apiKey) return;
    if (veoOperationApiKeyByName.size >= VEO_OP_CACHE_MAX) {
      const first = veoOperationApiKeyByName.keys().next().value;
      if (first != null) veoOperationApiKeyByName.delete(first);
    }
    veoOperationApiKeyByName.set(op, { userId, apiKey, usedSource: usedSource || null });
    setTimeout(() => {
      veoOperationApiKeyByName.delete(op);
    }, VEO_OP_CACHE_MS);
  }

  function resolveVeoStoredOperationMeta(req, operationName) {
    const uid = req?.user?.id;
    if (!uid || !operationName) return null;
    const op = normalizeGoogleOperationName(operationName);
    const hit = veoOperationApiKeyByName.get(op);
    if (hit && hit.userId === uid && hit.apiKey) return hit;
    return null;
  }

  const veoRouter = Router();

  /** Gemini Veo `parameters.durationSeconds` phải là số (number), gửi string sẽ 500. */
  function normalizeDurationSeconds(raw) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    return Number.isFinite(n) ? n : undefined;
  }

  veoRouter.post('/start', async (req, res) => {
    try {
      const uid = req?.user?.id;
      const detailed = geminiRestCandidatesDetailedFromRequest(req);
      const preferredSlug =
        typeof req?.headers?.['x-veo3pro-profile-slug'] === 'string' ? req.headers['x-veo3pro-profile-slug'].trim() : '';
      const candidateSources = detailed
        .map((x) => ({
          source: x?.source || null,
          meta: x?.meta || null,
        }))
        .filter((x) => x.source);
      const proxyUrl = getEffectiveProxyUrlFromReq(req);
      const keyEntries = detailed
        .map((x) => ({ apiKey: String(x.apiKey || '').trim(), source: x?.source || null }))
        .filter((x) => x.apiKey);
      if (!keyEntries.length) {
        return res.status(503).json({
          error:
            'Không có Gemini API key: cấu hình trong Cài đặt → Kết nối API hoặc GEMINI_API_KEY trong .env.',
          code: 'NO_GEMINI_KEY',
          debug: { preferredSlug, candidateSources },
        });
      }

      const attemptTrace = [];
      const {
        model = 'veo-3.1-generate-preview',
        aspectRatio,
        resolution,
        durationSeconds: durationSecondsRaw,
        personGeneration,
        ...rest
      } = req.body;

      const instance = buildVeoInstance(rest);
      const parameters = {};
      if (aspectRatio) parameters.aspectRatio = aspectRatio;
      if (resolution) parameters.resolution = resolution;
      const useRefs = Boolean(instance?.referenceImages?.length);
      const useStartImage = Boolean(instance?.image);

      /**
       * Veo có thêm constraints theo độ phân giải và khi dùng reference images.
       * Theo tài liệu: với reference images / 1080p / 4k thường cần durationSeconds = 8 (giây).
       */
      let durationSeconds = normalizeDurationSeconds(durationSecondsRaw);
      if (durationSeconds === undefined && (useRefs || useStartImage || resolution === '1080p' || resolution === '4k')) {
        durationSeconds = 8;
      }
      if (durationSeconds !== undefined) {
        parameters.durationSeconds = durationSeconds;
      }

      /** Khi có ảnh đầu/cuối hoặc reference images, Veo giới hạn personGeneration khác text-only. */
      if (personGeneration) {
        parameters.personGeneration = personGeneration;
      } else if (
        typeof rest?.mode === 'string' &&
        (rest.mode === 'image' || rest.mode === 'ingredients')
      ) {
        parameters.personGeneration = 'allow_adult';
      }

      let lastErr = '';
      for (let i = 0; i < keyEntries.length; i++) {
        const { apiKey, source: src } = keyEntries[i];
        try {
          const operationName = await veoPredictLongRunning(apiKey, model, instance, parameters, { proxyUrl });
          const usedSource = src;
          if (uid) rememberVeoOperationApiKey(operationName, uid, apiKey, usedSource);
          return res.json({ operationName, usedSource, attemptTrace, debug: { preferredSlug, candidateSources } });
        } catch (e) {
          const msg = e?.message || '';
          lastErr = msg;
          if (src?.type) {
            attemptTrace.push({
              source: src,
              ok: false,
              quotaLike: isGeminiQuotaLikeErrorMessage(msg),
              message: String(msg).slice(0, 220),
            });
          }
          if (isGeminiQuotaLikeErrorMessage(msg) && i < keyEntries.length - 1) {
            console.warn('[veo/start] quota/rate-limit, thử key khác', {
              index: i + 1,
              total: keyEntries.length,
            });
            continue;
          }
          if (isGeminiQuotaLikeErrorMessage(msg)) {
            console.error('[veo/start] hết key sau khi thử fallback', { total: keyEntries.length });
            return res.status(429).json({
              error:
                'Đã hết quota / giới hạn tốc độ Gemini (Veo) với tất cả key đã thử (Chrome profile → tài khoản → .env). Nếu credit gắn theo IP (proxy nhà cung cấp), kiểm tra proxy trong Cài đặt trùng IP trình duyệt. Kiểm tra billing tại Google AI Studio, chọn profile/key khác hoặc chờ reset quota.',
              code: 'GEMINI_QUOTA_EXHAUSTED',
              detail: String(msg).slice(0, 800),
              attemptTrace,
            });
          }
          console.error(e);
          return res.status(500).json({ error: msg });
        }
      }

      return res.status(500).json({ error: lastErr || 'Không khởi tạo được Veo.' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  veoRouter.get('/status', async (req, res) => {
    try {
      let operationName = req.query.operation;
      if (!operationName || typeof operationName !== 'string') {
        return res.status(400).json({ error: 'Thiếu query operation.' });
      }
      try {
        operationName = decodeURIComponent(operationName);
      } catch {
        /* giữ nguyên */
      }
      const meta = resolveVeoStoredOperationMeta(req, operationName);
      const apiKey = meta?.apiKey || getApiKey(req);
      const proxyUrl = getEffectiveProxyUrlFromReq(req);
      const data = await veoGetOperation(apiKey, operationName, { proxyUrl });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  veoRouter.post('/download', async (req, res) => {
    try {
      const { uri, operation } = req.body || {};
      const meta =
        typeof operation === 'string' && operation.trim() ? resolveVeoStoredOperationMeta(req, operation) : null;
      const apiKey = meta?.apiKey || getApiKey(req);
      if (!uri || typeof uri !== 'string') {
        return res.status(400).json({ error: 'Thiếu uri video.' });
      }
      const dispatcher = getProxyDispatcher(getEffectiveProxyUrlFromReq(req));
      const r = await fetch(uri, {
        headers: { 'x-goog-api-key': apiKey },
        redirect: 'follow',
        ...(dispatcher ? { dispatcher } : {}),
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(r.status).json({ error: t.slice(0, 2000) });
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="veo3pro-output.mp4"');
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.use('/api/veo', requireAuth, veoRouter);

  app.get('/api/health', async (req, res) => {
    const headerGemini =
      typeof req.headers?.['x-user-gemini-api-key'] === 'string' && String(req.headers['x-user-gemini-api-key']).trim();
    const envGemini = Boolean(process.env.GEMINI_API_KEY);

    let uid = null;
    try {
      const token = req.cookies?.[AUTH_COOKIE_NAME];
      if (typeof token === 'string' && token.trim()) {
        const payload = verifyAuthToken(token.trim());
        const user = await findUserById(payload.sub);
        if (user?.id) uid = user.id;
      }
    } catch {
      /* chưa đăng nhập hoặc token hết hạn */
    }

    const slug =
      typeof req.headers?.['x-veo3pro-profile-slug'] === 'string'
        ? String(req.headers['x-veo3pro-profile-slug']).trim()
        : '';

    let geminiFromProfileOrAccount = false;
    if (uid && !headerGemini) {
      try {
        geminiFromProfileOrAccount = Boolean(
          resolveGeminiApiKeyForUser(uid, slug) || resolveGeminiApiKeyFromUserRow(uid),
        );
      } catch {
        geminiFromProfileOrAccount = false;
      }
    }

    const openAi = String(process.env.OPENAI_API_KEY || '').trim();
    const headerOpenAi =
      typeof req.headers?.['x-user-openai-api-key'] === 'string' && String(req.headers['x-user-openai-api-key']).trim();

    let openAiFromProfileOrAccount = false;
    if (uid && !headerOpenAi) {
      try {
        openAiFromProfileOrAccount = Boolean(
          resolveOpenAiStackFromProfiles(uid, slug)?.apiKey || resolveOpenAiStackFromUserRow(uid)?.apiKey,
        );
      } catch {
        openAiFromProfileOrAccount = false;
      }
    }

    let preferUltraWebGemini = false;
    if (uid) {
      const vp = getUserVideoPreferences(uid);
      preferUltraWebGemini = Boolean(vp.preferUltraProfile && String(vp.preferredProfileSlug || '').trim());
    }

    const hasGeminiRest = Boolean(headerGemini || geminiFromProfileOrAccount || envGemini);
    const geminiFromEnvFallback = Boolean(uid && !headerGemini && !geminiFromProfileOrAccount && envGemini);

    res.json({
      ok: hasGeminiRest || preferUltraWebGemini,
      hasApiKey: hasGeminiRest,
      /** Key Gemini do user lưu (profile + tài khoản), không tính .env */
      geminiFromProfileOrAccount,
      /** Đang dùng GEMINI_API_KEY .env vì không còn key trong cài đặt */
      geminiFromEnvFallback,
      /** Đã bật tạo video qua Gemini web (Gmail đăng nhập trong Chrome portable) */
      preferUltraWebGemini,
      hasOpenAiKey: Boolean(headerOpenAi || openAi || openAiFromProfileOrAccount),
      authRequired: true,
      geminiKeyPresenceOnly: true,
      flowQueueMode: isQueueModeEnabled(),
      workersInProcess: process.env.FLOW_RUN_WORKERS !== 'false' && isQueueModeEnabled(),
    });
  });

  /**
   * Khi `npm run dev`, NODE_ENV=development: không phục vụ `dist/` từ Express.
   * Nếu không — trình duyệt mở cổng API (8787) sẽ thấy bundle `dist` cũ thay vì UI từ Vite (5173), nên sidebar/code không đổi dù đã sửa `src/`.
   */
  const distDir = process.env.VERCEL ? path.join(process.cwd(), 'dist') : path.join(__dirname, '..', 'dist');
  const skipDistWhileViteDev = process.env.NODE_ENV === 'development';
  if (fs.existsSync(distDir) && !skipDistWhileViteDev) {
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith(`${path.sep}index.html`) || filePath.endsWith('/index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}
