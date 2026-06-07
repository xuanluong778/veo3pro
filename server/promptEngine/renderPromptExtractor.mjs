/**
 * Render Prompt Extractor — deterministic bridge from internal Veo-style blocks
 * to vendor-oriented single-string prompts (Runway / Kling / Sora-class APIs).
 */

import { AUDIO_DIALOGUE_MARK } from './promptCompiler.mjs';

export const RENDER_EXTRACT_VERSION = /** @type {const} */ ('render-extract-v1');

const KEY_LINE = /^([A-Z][A-Z0-9_]*):\s*(.*)$/;

/**
 * @param {string} compiled
 * @returns {Record<string, string>}
 */
export function parseCompiledPromptBlocks(compiled) {
  /** @type {Record<string, string[]>} */
  const acc = {};
  let key = '';
  for (const line of String(compiled || '').split('\n')) {
    const m = line.match(KEY_LINE);
    if (m) {
      key = m[1];
      if (!acc[key]) acc[key] = [];
      acc[key].push(m[2]);
    } else if (key) {
      acc[key].push(line);
    }
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, parts] of Object.entries(acc)) {
    out[k] = parts.join('\n').trim();
  }
  return out;
}

/**
 * @param {string} audioBlock full AUDIO: line body (without "AUDIO:" prefix) or full line
 */
export function extractDialogueFromAudioBlock(audioBlock) {
  const raw = String(audioBlock || '');
  const idx = raw.indexOf(AUDIO_DIALOGUE_MARK);
  if (idx === -1) return raw.replace(/^AUDIO:\s*/i, '').trim();
  return raw.slice(idx + AUDIO_DIALOGUE_MARK.length).trim();
}

/**
 * @param {string} text
 * @param {number} max
 */
function clip(text, max) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * @param {Record<string, string>} b
 */
function parseAspectFromGlobalStyle(b) {
  const gs = String(b.GLOBAL_STYLE || '');
  const m = gs.match(/\baspect\s+([\d:.]+)/i);
  return m ? m[1].trim() : '';
}

/**
 * Build one visual prompt string + negatives per vendor from a compiled engine prompt.
 * @param {string} compiledPrompt Output of {@link import('./promptCompiler.mjs').buildFinalPrompt}
 * @returns {{
 *   version: typeof RENDER_EXTRACT_VERSION,
 *   runway: { prompt: string, negativePrompt: string, aspectRatio?: string },
 *   kling: { prompt: string, negativePrompt: string, aspectRatio?: string },
 *   sora: { prompt: string, aspectRatio?: string },
 * }}
 */
export function buildRenderPromptBundle(compiledPrompt) {
  const b = parseCompiledPromptBlocks(compiledPrompt);
  const thesis = clip(b.CENTRAL_THESIS || '', 280);
  const scene = clip(b.SCENE || '', 420);
  const character = clip(b.CHARACTER || '', 380);
  const look = clip(b.GLOBAL_STYLE || '', 520);
  const camera = clip(b.CAMERA || '', 220);
  const lighting = clip(b.LIGHTING || '', 220);
  const motion = clip(b.MOTION || '', 220);
  const intensity = clip(b.INTENSITY || '', 240);
  const neg = clip(b.NEGATIVE_PROMPT || '', 1600);
  const audioBody = b.AUDIO || '';
  const dialogue = extractDialogueFromAudioBlock(audioBody);
  const spoken =
    dialogue && !/^silent$/i.test(dialogue)
      ? `[Spoken line — keep lip-sync if used] ${clip(dialogue, 120)}`
      : '[Spoken line] Silent / ambience only; no on-screen subtitle text.';

  const visualCore = [
    `[Film thesis] ${thesis}`,
    `[Beat / structure] ${intensity}`,
    `[Scene] ${scene}`,
    `[Character lock] ${character}`,
    `[Visual world] ${look}`,
    `[Camera] ${camera}`,
    `[Lighting] ${lighting}`,
    `[Motion] ${motion}`,
    spoken,
  ]
    .filter(Boolean)
    .join('\n');

  const aspectRatio = parseAspectFromGlobalStyle(b) || undefined;

  const sharedVisual = clip(visualCore, 1950);
  const runway = {
    prompt: sharedVisual,
    negativePrompt: neg,
    ...(aspectRatio ? { aspectRatio } : {}),
  };

  /** Kling-style APIs usually mirror Runway: same visual block + separate negative field. */
  const kling = {
    prompt: sharedVisual,
    negativePrompt: neg,
    ...(aspectRatio ? { aspectRatio } : {}),
  };

  const sora = {
    prompt: clip(
      `${visualCore}\n\nConstraints (do not depict): ${clip(neg, 450)}`,
      2500,
    ),
    ...(aspectRatio ? { aspectRatio } : {}),
  };

  return {
    version: RENDER_EXTRACT_VERSION,
    runway,
    kling,
    sora,
  };
}
