import { Router } from 'express';
import { buildVeoInstance, veoPredictLongRunning } from '../services/veoService.js';
import { getUserVideoPreferences } from '../services/videoPreferenceService.js';
import { listChromePortableProfiles } from '../services/chromeProfilesService.js';

import { normalizeProxyUrl, getEffectiveProxyUrlFromReq } from '../services/proxyService.js';
import path from 'path';
import fs from 'fs';
import { createUltraJobStore, runUltraVeoAutomation } from '../services/ultraVeoAutomation.js';

const ultraJobs = createUltraJobStore();

export function createVideoCreateRouter({ getApiKey }) {
  const r = Router();

  // GET /api/video/prefs
  r.get('/prefs', (req, res) => {
    const uid = req?.user?.id;
    if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
    const prefs = getUserVideoPreferences(uid);
    res.json({ ok: true, prefs });
  });

  // POST /api/video/prefs { preferUltraProfile: boolean, preferredProfileSlug: string }
  r.post('/prefs', async (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const preferUltraProfile = Boolean(req.body?.preferUltraProfile);
      const preferredProfileSlug = typeof req.body?.preferredProfileSlug === 'string' ? req.body.preferredProfileSlug : '';
      const { setUserVideoPreferences } = await import('../services/videoPreferenceService.js');
      const out = setUserVideoPreferences(uid, { preferUltraProfile, preferredProfileSlug });
      res.json({ ok: true, prefs: out });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Không lưu được cấu hình.' });
    }
  });

  // POST /api/video/create
  // Thứ tự billing:
  // 1) Gemini qua Gmail đã đăng nhập (web): preferUltraProfile + preferredProfileSlug + profile tồn tại → automation Chrome portable (quota Google account).
  // 2) Không có (1): Veo REST giống /api/veo/start — header → key profile (slug client) → key tài khoản → GEMINI_API_KEY .env.
  r.post('/create', async (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });

      const prefs = getUserVideoPreferences(uid);
      if (prefs.preferUltraProfile && prefs.preferredProfileSlug) {
        const profiles = listChromePortableProfiles(uid);
        const found = profiles.find((p) => p.slug === prefs.preferredProfileSlug);
        if (found) {
          const proxyUrl = found.proxyUrl ? normalizeProxyUrl(found.proxyUrl) : '';
          const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
          if (!String(prompt || '').trim()) {
            return res.status(400).json({ error: 'Thiếu prompt.' });
          }

          const job = ultraJobs.create({
            userId: uid,
            profileSlug: found.slug,
            status: 'queued',
            mode: 'ultra_profile',
            prompt: String(prompt).trim(),
          });

          // Fire-and-forget automation (local server). Mặc định mở Chrome hiện gemini.google để bạn theo dõi; ẩn: ULTRA_HEADLESS=1 trong .env
          ultraJobs.update(job.id, { status: 'running' });
          const ultraHeadless = ['1', 'true', 'yes'].includes(
            String(process.env.ULTRA_HEADLESS || '').trim().toLowerCase(),
          );
          runUltraVeoAutomation({
            userId: uid,
            profileSlug: found.slug,
            prompt: job.prompt,
            outDir: path.join(process.cwd(), 'data', 'ultra-downloads'),
            headless: ultraHeadless,
          })
            .then(({ filePath }) => {
              ultraJobs.update(job.id, { status: 'completed', filePath });
            })
            .catch((e) => {
              ultraJobs.update(job.id, { status: 'failed', error: e?.message || 'Automation failed', code: e?.code || '' });
            });

          return res.json({ ok: true, mode: 'ultra_profile', jobId: job.id });
        }
      }

      // Fallback: API key route (env / stored keys / header)
      const apiKey = getApiKey(req);
      const { model = 'veo-3.1-generate-preview', aspectRatio, resolution, durationSeconds, personGeneration, ...rest } =
        req.body || {};
      const instance = buildVeoInstance(rest);
      const parameters = {};
      if (aspectRatio) parameters.aspectRatio = aspectRatio;
      if (resolution) parameters.resolution = resolution;
      if (durationSeconds !== undefined && durationSeconds !== null && durationSeconds !== '') {
        const n = typeof durationSeconds === 'number' ? durationSeconds : Number(String(durationSeconds).trim());
        if (Number.isFinite(n)) parameters.durationSeconds = n;
      }
      if (personGeneration) parameters.personGeneration = personGeneration;
      const proxyUrl = getEffectiveProxyUrlFromReq(req);
      const operationName = await veoPredictLongRunning(apiKey, model, instance, parameters, { proxyUrl });
      res.json({ ok: true, mode: 'api_key', operationName });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Tạo video thất bại.' });
    }
  });

  // GET /api/video/job/:id
  r.get('/job/:id', (req, res) => {
    const uid = req?.user?.id;
    if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
    const id = String(req.params?.id || '').trim();
    const job = ultraJobs.get(id);
    if (!job || job.userId !== uid) return res.status(404).json({ error: 'Không tìm thấy job.' });
    res.json({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        error: job.error || '',
        code: job.code || '',
        downloadUrl: job.filePath ? `/api/video/job/${job.id}/download` : '',
      },
    });
  });

  // GET /api/video/job/:id/download
  r.get('/job/:id/download', (req, res) => {
    const uid = req?.user?.id;
    if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
    const id = String(req.params?.id || '').trim();
    const job = ultraJobs.get(id);
    if (!job || job.userId !== uid) return res.status(404).json({ error: 'Không tìm thấy job.' });
    if (job.status !== 'completed' || !job.filePath) return res.status(400).json({ error: 'Chưa có file để tải.' });
    if (!fs.existsSync(job.filePath)) return res.status(404).json({ error: 'File không tồn tại.' });
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="ultra-veo.mp4"');
    fs.createReadStream(job.filePath).pipe(res);
  });

  return r;
}

