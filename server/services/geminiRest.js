import { GEMINI_API_BASE } from '../config.js';
import { mergeGeminiGenerationConfig } from '../config/geminiTemperatures.js';
import { getProxyDispatcher } from './proxyService.js';

const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-1.5-flash'];

function shouldRetryWithFallback(message = '', status = 0) {
  const m = String(message || '').toLowerCase();
  if (status === 404) return true;
  return (
    m.includes('no longer available') ||
    m.includes('not found for api version') ||
    m.includes('is not found') ||
    m.includes('unsupported model')
  );
}

async function callGemini(apiKey, model, payload, proxyUrl = '') {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const dispatcher = getProxyDispatcher(proxyUrl);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    ...(dispatcher ? { dispatcher } : {}),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {object} payload Gemini REST `generateContent` body
 * @param {{ temperaturePurpose?: 'topic' | 'thesis' | 'sceneIdea' | 'finalSceneContent' | 'suggestions' | 'structuredStoryboard' | 'visionQc' }} [options] Configures temperature when `generationConfig.temperature` is omitted (see `server/config/geminiTemperatures.js`).
 */
export async function geminiGenerateContent(apiKey, model, payload, options = {}) {
  const merged = mergeGeminiGenerationConfig(payload, options);
  const primary = await callGemini(apiKey, model, merged, options.proxyUrl || '');
  if (primary.ok) return primary.data;

  const primaryMsg = primary.data?.error?.message || JSON.stringify(primary.data);
  if (shouldRetryWithFallback(primaryMsg, primary.status)) {
    for (const fallbackModel of MODEL_FALLBACKS) {
      if (!fallbackModel || fallbackModel === model) continue;
      const fallback = await callGemini(apiKey, fallbackModel, merged, options.proxyUrl || '');
      if (fallback.ok) return fallback.data;
    }
  }
  throw new Error(`Gemini ${model} HTTP ${primary.status}: ${primaryMsg}`);
}

export { getGeminiTemperature, GEMINI_TEMPERATURE_BY_PURPOSE } from '../config/geminiTemperatures.js';

export function extractTextFromGenerateContent(data) {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

/** Collect inline images from all candidates/parts (image-capable models). */
export function extractInlineImagesFromGenerateContent(data) {
  const out = [];
  const candidates = data.candidates ?? [];
  for (const c of candidates) {
    const parts = c.content?.parts ?? [];
    for (const p of parts) {
      const id = p.inlineData;
      if (id?.data && id?.mimeType) {
        out.push({ mimeType: id.mimeType, data: id.data });
      }
    }
  }
  return out;
}
