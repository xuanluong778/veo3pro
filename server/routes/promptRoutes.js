import { Router } from 'express';
import {
  generatePromptScenes,
  generateContentPillars,
  generateViralTopics,
  generateCharacterSuggestions,
  generateContextSuggestions,
  generateTextVideoCast,
  generateTextVideoStructuredScenes,
} from '../services/promptService.js';
import { listRegistryPublicMeta, parseRequestedCharacterIds } from '../promptEngine/js/characterRegistry.js';
import { clampClipDurationSec } from '../promptEngine/constants.mjs';
import { getProxyUrlFromReq } from '../services/proxyService.js';
import { generateTextVideoPromptWithOpenAI } from '../services/textVideoPromptOpenAi.js';

const ALLOWED_STYLES = new Set(['châm biếm', 'giáo dục', 'triết lý', 'hài hước', 'cảm động', 'kinh dị', 'kịch tính', 'bí ẩn']);
const DEFAULT_PROMPT_STUDIO_MODEL = 'gemini-2.5-flash';

/** Query `?debug=1` or body `debug: true` enables extended prompt generate response. */
function parsePromptGenerateDebug(req) {
  const q = String(req.query?.debug ?? '')
    .trim()
    .toLowerCase();
  if (q === '1' || q === 'true' || q === 'yes') return true;
  const b = req.body?.debug;
  if (b === true || b === 1) return true;
  if (typeof b === 'string' && ['1', 'true', 'yes'].includes(b.trim().toLowerCase())) return true;
  return false;
}

export function createPromptRouter({ getApiKey, getOpenAiKey, getOpenAiBaseUrl } = {}) {
  const router = Router();

  router.post('/pillars', async (req, res) => {
    try {
      const industry = String(req.body?.industry || '').trim();
      if (!industry) return res.status(400).json({ error: 'Thiếu lĩnh vực.' });
      const quantity = Math.min(20, Math.max(1, Number(req.body?.quantity) || 7));
      const apiKey = getApiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const pillars = await generateContentPillars(apiKey, industry, quantity, { proxyUrl });
      res.json({ pillars });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Pillars generation failed' });
    }
  });

  router.post('/topics', async (req, res) => {
    try {
      const pillar = String(req.body?.pillar || '').trim();
      if (!pillar) return res.status(400).json({ error: 'Thiếu chủ đề lớn.' });
      const quantity = Math.min(50, Math.max(1, Number(req.body?.quantity) || 20));
      const apiKey = getApiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const topics = await generateViralTopics(apiKey, pillar, quantity, { proxyUrl });
      res.json({ topics });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Topics generation failed' });
    }
  });

  router.post('/suggest/character', async (req, res) => {
    try {
      const payload = {
        industry: String(req.body?.industry || '').trim(),
        pillar: String(req.body?.pillar || '').trim(),
        topic: String(req.body?.topic || '').trim(),
        count: Math.min(16, Math.max(8, Number(req.body?.count) || 12)),
      };
      const apiKey = getApiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const suggestions = await generateCharacterSuggestions(apiKey, payload, { proxyUrl });
      res.json({ suggestions });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Character suggestions failed' });
    }
  });

  router.get('/characters/registry', (_req, res) => {
    try {
      res.json({ entries: listRegistryPublicMeta() });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Registry read failed' });
    }
  });

  router.post('/suggest/context', async (req, res) => {
    try {
      const payload = {
        industry: String(req.body?.industry || '').trim(),
        pillar: String(req.body?.pillar || '').trim(),
        topic: String(req.body?.topic || '').trim(),
        count: Math.min(12, Math.max(3, Number(req.body?.count) || 5)),
      };
      const apiKey = getApiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const suggestions = await generateContextSuggestions(apiKey, payload, { proxyUrl });
      res.json({ suggestions });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Context suggestions failed' });
    }
  });

  router.post('/text-video/cast', async (req, res) => {
    try {
      const storyPrompt = String(req.body?.storyPrompt || req.body?.prompt || '').trim();
      if (!storyPrompt) return res.status(400).json({ error: 'Thiếu storyPrompt / prompt.' });
      const styleLabel = String(req.body?.styleLabel || '').trim();
      const language = String(req.body?.language || 'vi').trim();
      const apiKey = getApiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const out = await generateTextVideoCast(apiKey, { storyPrompt, styleLabel, language }, { proxyUrl });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message || 'Text-video cast failed' });
    }
  });

  router.post('/text-video/scenes', async (req, res) => {
    try {
      const storyPrompt = String(req.body?.storyPrompt || req.body?.prompt || '').trim();
      if (!storyPrompt) return res.status(400).json({ error: 'Thiếu storyPrompt / prompt.' });
      const styleLabel = String(req.body?.styleLabel || '').trim();
      const language = String(req.body?.language || 'vi').trim();
      const sceneCount = Math.min(32, Math.max(1, Number(req.body?.sceneCount ?? req.body?.count ?? 1) || 1));
      const castItems = Array.isArray(req.body?.castItems) ? req.body.castItems : [];
      const apiKey = getApiKey(req);
      const proxyUrl = getProxyUrlFromReq(req);
      const out = await generateTextVideoStructuredScenes(
        apiKey,
        { storyPrompt, styleLabel, language, sceneCount, castItems },
        { proxyUrl },
      );
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message || 'Text-video scenes failed' });
    }
  });

  router.post('/generate', async (req, res) => {
    try {
      const body = req.body || {};
      const topic = String(body.topic || '').trim();
      if (!topic) return res.status(400).json({ error: 'Thiếu topic/chủ đề video.' });

      const quantity = Math.min(20, Math.max(1, Number(body.quantity) || 1));
      const duration = clampClipDurationSec(body.duration);
      const humorLevel = Math.min(100, Math.max(0, Number(body.humorLevel) || 0));
      const styleRaw = String(body.style || 'cinematic').trim().toLowerCase();
      const style = ALLOWED_STYLES.has(styleRaw) ? styleRaw : String(body.style || 'cinematic').trim();

      let promptDNA;
      try {
        promptDNA =
          body.promptDNA && typeof body.promptDNA === 'object' ? JSON.parse(JSON.stringify(body.promptDNA)) : undefined;
      } catch {
        promptDNA = undefined;
      }

      let characterIds;
      if (body.characterIds !== undefined && body.characterIds !== null) {
        const parsed = parseRequestedCharacterIds(body.characterIds);
        if (!parsed.ok) {
          if (parsed.code === 'UNKNOWN_IDS') {
            return res.status(400).json({
              error: `Character id không tồn tại trong registry: ${parsed.unknownIds.join(', ')}`,
            });
          }
          return res.status(400).json({
            error: `Định dạng character id không hợp lệ (chỉ chữ thường, số, dấu gạch ngang). Ví dụ sai: ${parsed.samples.join(', ')}`,
          });
        }
        characterIds = parsed.ids;
      }

      const useRegistry = Array.isArray(characterIds) && characterIds.length > 0;
      const debug = parsePromptGenerateDebug(req);

      const llmRaw = String(body.llm || body.engine || 'gemini').trim().toLowerCase();
      const useOpenAi = llmRaw === 'openai' || llmRaw === 'chatgpt';

      const payload = {
        topic,
        style,
        duration,
        ratio: String(body.ratio || '16:9').trim(),
        character: useRegistry ? '' : String(body.character || '').trim(),
        ...(useRegistry ? { characterIds } : {}),
        characterMode: String(body.characterMode || 'giữ nguyên').trim(),
        humorLevel,
        context: String(body.context || '').trim(),
        negative: String(body.negative || '').trim(),
        voice: (() => {
          const v = String(body.voice ?? '').trim();
          if (!v) return 'Nam trẻ';
          return v;
        })(),
        language: String(body.language || 'vi').trim(),
        quantity,
        ...(promptDNA ? { promptDNA } : {}),
        ...(debug ? { debug: true } : {}),
      };

      const proxyUrl = getProxyUrlFromReq(req);

      if (useOpenAi) {
        if (typeof getOpenAiKey !== 'function' || typeof getOpenAiBaseUrl !== 'function') {
          return res.status(500).json({ error: 'Server chưa cấu hình OpenAI cho đường prompt.' });
        }
        if (useRegistry) {
          return res.status(400).json({ error: 'ChatGPT/OpenAI không hỗ trợ character registry — chọn Gemini.' });
        }
        if (quantity !== 1) {
          return res.status(400).json({ error: 'ChatGPT/OpenAI hiện chỉ hỗ trợ quantity = 1.' });
        }
        if (promptDNA) {
          return res.status(400).json({ error: 'ChatGPT/OpenAI không hỗ trợ promptDNA — chọn Gemini.' });
        }
        if (debug) {
          return res.status(400).json({ error: 'Debug prompt chỉ dùng với Gemini.' });
        }
        let openKey;
        let openBase = '';
        try {
          openKey = getOpenAiKey(req);
          openBase = getOpenAiBaseUrl(req);
        } catch (e) {
          return res.status(400).json({ error: e.message || 'Chưa có OpenAI API key.' });
        }
        const ctxParts = [payload.context, payload.negative ? `Tránh: ${payload.negative}` : ''].filter(Boolean);
        const { prompt: ptext, model: oaModel } = await generateTextVideoPromptWithOpenAI(
          {
            topic,
            style: payload.style,
            duration,
            ratio: payload.ratio,
            language: payload.language,
            context: ctxParts.join('\n'),
          },
          { apiKey: openKey, baseURL: openBase, proxyUrl },
        );
        return res.json({
          scenes: [{ title: 'Cảnh 1', prompt: ptext }],
          meta: { count: 1, model: oaModel, llm: 'openai' },
        });
      }

      const apiKey = getApiKey(req);
      const out = await generatePromptScenes(apiKey, payload, { proxyUrl });
      const engineMeta = out.meta && typeof out.meta === 'object' ? out.meta : {};
      res.json({
        scenes: out.scenes,
        meta: {
          ...engineMeta,
          count: out.scenes.length,
          model: process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL,
          llm: 'gemini',
        },
        ...(out.debug && typeof out.debug === 'object' ? { debug: out.debug } : {}),
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Prompt generation failed' });
    }
  });

  return router;
}
