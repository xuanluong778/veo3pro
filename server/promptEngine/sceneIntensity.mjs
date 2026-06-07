/**
 * Deterministic narrative intensity (1 → N) for scene progression prompts.
 */

/**
 * @param {number} sceneIndex0 0-based scene index
 * @param {number} totalScenes total scene count (clamped 1–20)
 * @returns {string} Single line for INTENSITY: block and LLM context
 */
export function buildIntensityLine(sceneIndex0, totalScenes) {
  const n = Math.min(20, Math.max(1, Math.floor(Number(totalScenes)) || 1));
  const i0 = Math.max(0, Math.floor(Number(sceneIndex0)) || 0);
  const step = Math.min(n, i0 + 1);
  const pct = Math.round((step / n) * 100);
  let band = 'RISE';
  if (step === 1) band = 'OPEN';
  else if (step === n) band = 'CLOSE';
  else if (step / n < 0.35) band = 'EARLY_RISE';
  else if (step / n < 0.7) band = 'MID_PEAK';
  else band = 'LATE_PEAK';
  return `Scene ${step}/${n} arc ~${pct}% (${band}): escalate stakes vs prior beats; one idea only; do not contradict CENTRAL_THESIS or CHARACTER.`;
}
