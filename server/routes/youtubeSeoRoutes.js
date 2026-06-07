import { Router } from 'express';
import multer from 'multer';
import {
  generateThumbnail,
  generateThumbnailPromptText,
  generateLogoPromptText,
  generateLogoImage,
} from '../services/youtubeSeoService.js';
import {
  generateTitlesBundleGemini,
  generateDescriptionBundleGemini,
  generateTagsBundleGemini,
  generateCommentBundleGemini,
  generateFilenameSlugGemini,
  competitorAnalysisGemini,
} from '../services/youtubeSeoGeminiService.js';
import { generateThumbnailPromptTextGemini, generateLogoPromptTextGemini } from '../services/youtubeSeoGeminiService.js';
import { getProxyUrlFromReq } from '../services/proxyService.js';

const imageMimeFilter = (_req, file, cb) => {
  const mime = file.mimetype || '';
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp') return cb(null, true);
  cb(new Error('Ảnh tham chiếu: chỉ PNG, JPEG hoặc WebP.'));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: imageMimeFilter,
});

const uploadThumbRefs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 2 },
  fileFilter: imageMimeFilter,
});

const LANG_LABEL = {
  en: 'English',
  vi: 'Vietnamese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  pt: 'Portuguese',
  id: 'Indonesian',
  th: 'Thai',
};

function readCtx(req, opts = {}) {
  const language = typeof req.body?.language === 'string' ? req.body.language.trim() : 'en';
  const keyword = typeof req.body?.keyword === 'string' ? req.body.keyword.trim() : '';
  const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
  const competitorUrl = typeof req.body?.competitorUrl === 'string' ? req.body.competitorUrl.trim() : '';
  const channelUrl = typeof req.body?.channelUrl === 'string' ? req.body.channelUrl.trim() : '';
  const selectedTitle =
    typeof req.body?.selectedTitle === 'string' ? req.body.selectedTitle.trim().slice(0, 500) : '';
  if (!keyword) throw new Error('Thiếu từ khóa chính.');
  if (opts.requireSelectedTitle && !selectedTitle) {
    throw new Error('Thiếu tiêu đề đã chọn (selectedTitle).');
  }
  const languageLabel = LANG_LABEL[language] || language || 'English';
  return { language, languageLabel, keyword, topic, competitorUrl, channelUrl, selectedTitle };
}

export function createYoutubeSeoRouter({ getApiKey, getOpenAiKey, getOpenAiBaseUrl } = {}) {
  const r = Router();
  const clientOptsFromReq = (req) => ({
    apiKey: typeof getOpenAiKey === 'function' ? getOpenAiKey(req) : undefined,
    baseURL: typeof getOpenAiBaseUrl === 'function' ? getOpenAiBaseUrl(req) : undefined,
    proxyUrl: getProxyUrlFromReq(req),
  });
  const getGeminiKey = (req) => {
    if (typeof getApiKey === 'function') return getApiKey(req);
    const hdr = req?.headers?.['x-user-gemini-api-key'];
    if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();
    const k = String(process.env.GEMINI_API_KEY || '').trim();
    if (!k) throw new Error('Thiếu GEMINI_API_KEY (hoặc user chưa lưu key).');
    return k;
  };

  /** Bước 1: chỉ 10 tiêu đề */
  r.post('/generate', async (req, res) => {
    try {
      const ctx = readCtx(req);
      const apiKey = getGeminiKey(req);
      const titles = await generateTitlesBundleGemini(apiKey, ctx, { proxyUrl: getProxyUrlFromReq(req) });
      const data = { titles };
      res.json({ ok: true, data });
    } catch (e) {
      console.error('[youtube-seo generate]', e);
      res.status(500).json({ error: e.message || 'Tạo tiêu đề thất bại.' });
    }
  });

  /** Bước 2: mô tả, tag, comment, slug — cần selectedTitle */
  r.post('/generate-rest', async (req, res) => {
    try {
      const ctx = readCtx(req, { requireSelectedTitle: true });
      const apiKey = getGeminiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const t = String(ctx.selectedTitle || '').trim();
      const [description, tags, comment, filename] = await Promise.all([
        generateDescriptionBundleGemini(apiKey, { ...ctx, selectedTitle: t }, { proxyUrl }),
        generateTagsBundleGemini(apiKey, { ...ctx, selectedTitle: t }, { proxyUrl }),
        generateCommentBundleGemini(apiKey, { ...ctx, selectedTitle: t }, { proxyUrl }),
        generateFilenameSlugGemini(apiKey, { ...ctx, selectedTitle: t }, { proxyUrl }),
      ]);
      const data = { description, tags, comment, filename };
      res.json({ ok: true, data });
    } catch (e) {
      console.error('[youtube-seo generate-rest]', e);
      res.status(500).json({ error: e.message || 'Tạo mô tả / nội dung thất bại.' });
    }
  });

  r.post('/regenerate', async (req, res) => {
    try {
      const section = typeof req.body?.section === 'string' ? req.body.section.trim() : '';
      const ctx = readCtx(req);
      const apiKey = getGeminiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const needTitle = ['description', 'tags', 'comment', 'filename'].includes(section);
      if (needTitle && !ctx.selectedTitle) {
        return res.status(400).json({ error: 'Cần gửi selectedTitle khi làm mới mô tả / tag / comment / slug.' });
      }
      let partial;
      switch (section) {
        case 'titles':
          partial = { titles: await generateTitlesBundleGemini(apiKey, ctx, { proxyUrl }) };
          break;
        case 'description':
          partial = { description: await generateDescriptionBundleGemini(apiKey, ctx, { proxyUrl }) };
          break;
        case 'tags':
          partial = { tags: await generateTagsBundleGemini(apiKey, ctx, { proxyUrl }) };
          break;
        case 'comment':
          partial = { comment: await generateCommentBundleGemini(apiKey, ctx, { proxyUrl }) };
          break;
        case 'filename':
          partial = { filename: await generateFilenameSlugGemini(apiKey, ctx, { proxyUrl }) };
          break;
        default:
          return res.status(400).json({ error: 'section không hợp lệ.' });
      }
      res.json({ ok: true, data: partial });
    } catch (e) {
      console.error('[youtube-seo regenerate]', e);
      res.status(500).json({ error: e.message || 'Tạo lại thất bại.' });
    }
  });

  r.post('/competitor', async (req, res) => {
    try {
      const kind = typeof req.body?.kind === 'string' ? req.body.kind.trim() : '';
      if (!['category', 'tags', 'insights'].includes(kind)) {
        return res.status(400).json({ error: 'kind phải là category, tags hoặc insights.' });
      }
      const ctx = readCtx(req);
      const competitorUrl =
        typeof req.body?.competitorUrl === 'string' ? req.body.competitorUrl.trim() : ctx.competitorUrl;
      const apiKey = getGeminiKey(req);
      const analysis = await competitorAnalysisGemini(apiKey, {
        kind,
        competitorUrl,
        keyword: ctx.keyword,
        topic: ctx.topic,
        languageLabel: ctx.languageLabel,
      }, { proxyUrl: getProxyUrlFromReq(req) });
      res.json({ ok: true, kind, analysis });
    } catch (e) {
      console.error('[youtube-seo competitor]', e);
      res.status(500).json({ error: e.message || 'Phân tích thất bại.' });
    }
  });

  r.post('/thumbnail-prompt', async (req, res) => {
    try {
      const ctx = readCtx(req);
      const apiKey = getGeminiKey(req);
      const selectedTitle =
        typeof req.body?.selectedTitle === 'string' ? req.body.selectedTitle.trim().slice(0, 500) : '';
      const ideaPrompt = typeof req.body?.ideaPrompt === 'string' ? req.body.ideaPrompt.trim() : '';
      const overlayText = typeof req.body?.overlayText === 'string' ? req.body.overlayText.trim() : '';
      const styleId = typeof req.body?.style === 'string' ? req.body.style.trim() : 'realistic';
      const rawAspectRatio = typeof req.body?.aspectRatio === 'string' ? req.body.aspectRatio.trim() : '';
      const aspectRatio = rawAspectRatio === '9:16' ? '9:16' : rawAspectRatio === '1:1' ? '1:1' : '16:9';
      const imagePrompt = await generateThumbnailPromptTextGemini(apiKey, {
        languageLabel: ctx.languageLabel,
        keyword: ctx.keyword,
        topic: ctx.topic,
        selectedTitle,
        ideaPrompt,
        overlayText,
        styleId,
        aspectRatio,
      }, { proxyUrl: getProxyUrlFromReq(req) });
      res.json({ ok: true, imagePrompt });
    } catch (e) {
      console.error('[youtube-seo thumbnail-prompt]', e);
      res.status(500).json({ error: e.message || 'Sinh prompt ảnh thất bại.' });
    }
  });

  r.post('/logo-prompt', async (req, res) => {
    try {
      const ctx = readCtx(req);
      const apiKey = getGeminiKey(req);
      const logoIdea = typeof req.body?.logoIdea === 'string' ? req.body.logoIdea.trim() : '';
      const logoText = typeof req.body?.logoText === 'string' ? req.body.logoText.trim() : '';
      const brandName = typeof req.body?.brandName === 'string' ? req.body.brandName.trim() : '';
      const imagePrompt = await generateLogoPromptTextGemini(apiKey, {
        languageLabel: ctx.languageLabel,
        keyword: ctx.keyword,
        brandName,
        logoIdea,
        logoText,
        topic: ctx.topic,
        selectedTitle: ctx.selectedTitle,
      }, { proxyUrl: getProxyUrlFromReq(req) });
      res.json({ ok: true, imagePrompt });
    } catch (e) {
      console.error('[youtube-seo logo-prompt]', e);
      res.status(500).json({ error: e.message || 'Sinh prompt logo thất bại.' });
    }
  });

  r.post('/logo', async (req, res) => {
    try {
      const ctx = readCtx(req);
      const logoIdea = typeof req.body?.logoIdea === 'string' ? req.body.logoIdea.trim() : '';
      const logoText = typeof req.body?.logoText === 'string' ? req.body.logoText.trim() : '';
      const brandName = typeof req.body?.brandName === 'string' ? req.body.brandName.trim() : '';
      const { b64, revisedPrompt } = await generateLogoImage(
        {
          keyword: ctx.keyword,
          languageLabel: ctx.languageLabel,
          brandName,
          logoIdea,
          logoText,
          topic: ctx.topic,
          selectedTitle: ctx.selectedTitle,
        },
        clientOptsFromReq(req),
      );
      res.json({ ok: true, imageBase64: b64, mimeType: 'image/png', revisedPrompt });
    } catch (e) {
      console.error('[youtube-seo logo]', e);
      res.status(500).json({ error: e.message || 'Sinh logo thất bại.' });
    }
  });

  r.post(
    '/thumbnail',
    (req, res, next) => {
      uploadThumbRefs.array('reference', 2)(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message || 'Upload ảnh không hợp lệ.' });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const keyword = typeof req.body?.keyword === 'string' ? req.body.keyword.trim() : '';
        if (!keyword) return res.status(400).json({ error: 'Thiếu keyword.' });
        const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
        const language = typeof req.body?.language === 'string' ? req.body.language.trim() : 'en';
        const languageLabel = LANG_LABEL[language] || language || 'English';
        const ideaPrompt = typeof req.body?.ideaPrompt === 'string' ? req.body.ideaPrompt.trim() : '';
        const overlayText = typeof req.body?.overlayText === 'string' ? req.body.overlayText.trim() : '';
        const legacy = typeof req.body?.thumbnailPrompt === 'string' ? req.body.thumbnailPrompt.trim() : '';
        const userPrompt = [ideaPrompt, overlayText ? `Văn bản trên thumbnail (dễ đọc): ${overlayText}` : '', legacy]
          .filter(Boolean)
          .join('\n\n');
        const styleId = typeof req.body?.style === 'string' ? req.body.style.trim() : 'realistic';
        const rawAspectRatio = typeof req.body?.aspectRatio === 'string' ? req.body.aspectRatio.trim() : '';
        const aspectRatio = rawAspectRatio === '9:16' ? '9:16' : rawAspectRatio === '1:1' ? '1:1' : '16:9';
        const selectedTitle =
          typeof req.body?.selectedTitle === 'string' ? req.body.selectedTitle.trim().slice(0, 500) : '';
        const files = Array.isArray(req.files) ? req.files : [];
        const file = files[0];
        const { b64, revisedPrompt } = await generateThumbnail({
          keyword,
          topic,
          languageLabel,
          userPrompt,
          styleId,
          aspectRatio,
          referenceBuffer: file?.buffer,
          referenceMime: file?.mimetype,
          selectedTitle: selectedTitle || undefined,
        }, clientOptsFromReq(req));
        res.json({ ok: true, imageBase64: b64, mimeType: 'image/png', revisedPrompt });
      } catch (e) {
        console.error('[youtube-seo thumbnail]', e);
        res.status(500).json({ error: e.message || 'Sinh thumbnail thất bại.' });
      }
    },
  );

  return r;
}
