/**
 * Central Gemini temperature map. Callers pass `temperaturePurpose` into
 * {@link ../services/geminiRest.js!geminiGenerateContent}; explicit `generationConfig.temperature` still wins.
 *
 * Defaults match product rules:
 * - topic: pillars / viral topics / topic-adjacent lists
 * - sceneIdea: Prompt Studio partial JSON (batch + per-scene retry)
 * - finalSceneContent: flow prompt enhancement (cinematic JSON rewrite)
 *
 * Optional purposes preserve prior behavior for other flows.
 */

export const GEMINI_TEMPERATURE_BY_PURPOSE = {
  topic: { default: 0.7, env: 'GEMINI_TEMP_TOPIC' },
  /** Single JSON thesis line — low temperature for stability */
  thesis: { default: 0.35, env: 'GEMINI_TEMP_THESIS' },
  /** Prompt Studio partials — higher variance to reduce copy-paste repeats across scenes */
  sceneIdea: { default: 0.88, env: 'GEMINI_TEMP_SCENE_IDEA', topP: 0.94, topPEnv: 'GEMINI_TOPP_SCENE_IDEA' },
  finalSceneContent: { default: 0.3, env: 'GEMINI_TEMP_FINAL_SCENE' },
  suggestions: { default: 0.75, env: 'GEMINI_TEMP_SUGGESTIONS' },
  structuredStoryboard: { default: 0.45, env: 'GEMINI_TEMP_STORYBOARD' },
  visionQc: { default: 0.1, env: 'GEMINI_TEMP_VISION_QC' },
};

/**
 * @param {keyof typeof GEMINI_TEMPERATURE_BY_PURPOSE} purpose
 * @returns {number | undefined} undefined if purpose unknown
 */
export function getGeminiTemperature(purpose) {
  const row = GEMINI_TEMPERATURE_BY_PURPOSE[purpose];
  if (!row) return undefined;
  const raw = process.env[row.env];
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(2, Math.max(0, n));
  }
  return row.default;
}

/**
 * @param {object} payload Gemini generateContent body
 * @param {{ temperaturePurpose?: keyof typeof GEMINI_TEMPERATURE_BY_PURPOSE }} [options]
 * @returns {object} shallow-cloned payload with temperature merged when absent
 */
export function mergeGeminiGenerationConfig(payload, options = {}) {
  const purpose = options.temperaturePurpose;
  if (!purpose) return payload;
  const row = GEMINI_TEMPERATURE_BY_PURPOSE[purpose];
  const existing =
    payload.generationConfig && typeof payload.generationConfig === 'object'
      ? { ...payload.generationConfig }
      : {};
  if (existing.temperature !== undefined && existing.temperature !== null) {
    return payload;
  }
  const t = getGeminiTemperature(purpose);
  if (typeof t !== 'number' || !Number.isFinite(t)) return payload;
  const gen = { ...existing, temperature: t };
  if (
    row &&
    typeof row.topP === 'number' &&
    (existing.topP === undefined || existing.topP === null)
  ) {
    let topP = row.topP;
    if (row.topPEnv && process.env[row.topPEnv] !== undefined && process.env[row.topPEnv] !== '') {
      const n = Number(process.env[row.topPEnv]);
      if (Number.isFinite(n)) topP = Math.min(1, Math.max(0.01, n));
    }
    gen.topP = topP;
  }
  return {
    ...payload,
    generationConfig: gen,
  };
}
