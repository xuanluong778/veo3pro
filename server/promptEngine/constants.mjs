/** @typedef {'compiler-v1'} PromptEngineVersion */

/** @deprecated Use `sceneFlow.ts` / `./js/sceneFlow.js` — kept as alias for the 10-beat flow. */
export { SCENE_FUNCTION_FLOW as SCENE_FUNCTION_CYCLE } from './js/sceneFlow.js';

export const ENGINE_VERSION = /** @type {const} */ ('compiler-v1');

/** Appended to user negative line (system-controlled). */
export const NEGATIVE_SUFFIX =
  'style drift, inconsistent character look, random outfit change, text watermark, subtitles burned-in, low resolution, blur, banding, duplicate faces, morphing artifacts';

/** Prompt Studio / Veo: mỗi clip tối đa (giây). */
export const MAX_CLIP_DURATION_SEC = 8;
export const MIN_CLIP_DURATION_SEC = 3;

/** @param {unknown} n */
export function clampClipDurationSec(n) {
  const v = Math.floor(Number(n));
  const base = Number.isFinite(v) && v > 0 ? v : 8;
  return Math.min(MAX_CLIP_DURATION_SEC, Math.max(MIN_CLIP_DURATION_SEC, base));
}
