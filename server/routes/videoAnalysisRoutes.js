import { Router } from 'express';
import multer from 'multer';
import { analyzeVideoFromBufferGemini, analyzeVideoFromUrlGemini } from '../services/videoAnalysisGemini.js';
import { getProxyUrlFromReq } from '../services/proxyService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || '';
    const okMime = mime === 'video/mp4' || mime === 'video/quicktime';
    const name = (file.originalname || '').toLowerCase();
    const okExt = name.endsWith('.mp4') || name.endsWith('.mov');
    if (okMime || okExt) return cb(null, true);
    cb(new Error('Chỉ chấp nhận MP4 hoặc MOV.'));
  },
});

export function createVideoAnalysisRouter({ getApiKey } = {}) {
  const r = Router();
  const getGeminiKey = (req) => {
    if (typeof getApiKey === 'function') return getApiKey(req);
    const hdr = req?.headers?.['x-user-gemini-api-key'];
    if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();
    const k = String(process.env.GEMINI_API_KEY || '').trim();
    if (!k) throw new Error('Thiếu GEMINI_API_KEY (hoặc user chưa lưu key).');
    return k;
  };

  r.post('/url', async (req, res) => {
    try {
      const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';
      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'URL không hợp lệ (cần http/https).' });
      }
      const apiKey = getGeminiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const result = await analyzeVideoFromUrlGemini(apiKey, url, notes, { proxyUrl });
      res.json({ ok: true, result });
    } catch (e) {
      console.error('[video-analysis]', e);
      res.status(500).json({ error: e.message || 'Phân tích thất bại.' });
    }
  });

  r.post(
    '/upload',
    (req, res, next) => {
      upload.single('video')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message || 'Upload không hợp lệ.' });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const file = req.file;
        if (!file?.buffer?.length) {
          return res.status(400).json({ error: 'Thiếu file video.' });
        }
        const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';
        const mime = file.mimetype === 'video/quicktime' ? 'video/quicktime' : 'video/mp4';
        const apiKey = getGeminiKey(req);
        const proxyUrl = getProxyUrlFromReq(req);
        const result = await analyzeVideoFromBufferGemini(apiKey, file.buffer, mime, file.originalname, notes, { proxyUrl });
        res.json({ ok: true, result });
      } catch (e) {
        console.error('[video-analysis upload]', e);
        res.status(500).json({ error: e.message || 'Phân tích thất bại.' });
      }
    },
  );

  return r;
}
