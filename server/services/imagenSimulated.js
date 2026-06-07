/**
 * Gemini REST image generation (“Imagen-style” interchange).
 */
import { geminiGenerateContent, extractInlineImagesFromGenerateContent } from './geminiRest.js';

export function getImageModelCandidates() {
  return (
    process.env.FLOW_IMAGE_MODEL ||
    'gemini-2.0-flash-preview-image-generation,gemini-2.0-flash-exp-image-generation,gemini-2.5-flash-image-preview'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function tryGenerateWithModel(apiKey, model, promptText) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };
  const data = await geminiGenerateContent(apiKey, model, payload);
  const imgs = extractInlineImagesFromGenerateContent(data);
  if (!imgs.length) throw new Error(`No inline image in response (${model})`);
  return imgs[0];
}

export async function generateReferenceImageWithModel(apiKey, model, promptText) {
  return tryGenerateWithModel(apiKey, model, promptText);
}

export async function generateReferenceImage(apiKey, promptText) {
  const enriched = `Photoreal cinematic film still. ${promptText}\nNo UI, no watermark, no subtitles.`;
  let lastErr;
  for (const model of getImageModelCandidates()) {
    try {
      return await tryGenerateWithModel(apiKey, model, enriched);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Image generation failed for all candidate models');
}
