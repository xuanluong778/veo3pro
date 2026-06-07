/**
 * Scene memory — short summaries from prior scenes (last N only) for continuity in partial generation.
 */

/** Max prior scenes injected into the next prompt (cap to avoid context overload). */
export const SCENE_MEMORY_MAX_PRIOR = 3;

/** Max characters per stored summary line (subject text). */
export const SCENE_MEMORY_SUMMARY_MAX_CHARS = 200;

/**
 * @param {string} text
 * @param {number} [maxChars=SCENE_MEMORY_SUMMARY_MAX_CHARS]
 * @returns {string}
 */
export function truncateSceneSummary(text, maxChars = SCENE_MEMORY_SUMMARY_MAX_CHARS) {
  const s = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return '';
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}

/**
 * Prior scenes relative to `currentIndex` (exclusive): up to the last {@link SCENE_MEMORY_MAX_PRIOR} completed rows.
 * @param {{ subject?: string }[]} rows Completed partial rows (length === currentIndex when generating scene `currentIndex`).
 * @param {string[]} sceneFns
 * @param {number} currentIndex 0-based index of the scene about to be generated.
 * @returns {{ sceneNumber: number, sceneFunction: string, summary: string }[]}
 */
export function collectSceneMemoryEntries(rows, sceneFns, currentIndex) {
  const start = Math.max(0, currentIndex - SCENE_MEMORY_MAX_PRIOR);
  const out = [];
  for (let j = start; j < currentIndex; j++) {
    const summary = truncateSceneSummary(rows[j]?.subject);
    if (!summary) continue;
    const voiceRaw = String(rows[j]?.voice ?? rows[j]?.dialogue_vi ?? '').trim();
    const voiceSnip =
      voiceRaw && !/^silent$/i.test(voiceRaw) ? truncateSceneSummary(voiceRaw, 100) : '';
    const narratorSnip = truncateSceneSummary(rows[j]?.narrator_vi, 140);
    out.push({
      sceneNumber: j + 1,
      sceneFunction: String(sceneFns[j] || '').trim(),
      summary,
      voiceSnip,
      narratorSnip,
    });
  }
  return out;
}

/**
 * Human-readable block for Gemini (empty string if no entries).
 * @param {{ sceneNumber: number, sceneFunction: string, summary: string }[]} entries
 * @returns {string}
 */
export function buildSceneMemoryContext(entries) {
  if (!Array.isArray(entries) || !entries.length) return '';
  const lines = entries.map((e) => {
    let line = `- Scene ${e.sceneNumber}${e.sceneFunction ? ` [${e.sceneFunction}]` : ''}: subject: ${e.summary}`;
    if (e.voiceSnip) line += ` | prior on-screen line: ${e.voiceSnip}`;
    if (e.narratorSnip) line += ` | prior narrator: ${e.narratorSnip}`;
    return line;
  });
  return [
    `SCENE_MEMORY (last ${entries.length} scene(s) — same world & hero; advance the arc; do not contradict facts):`,
    'Each line above is READ-ONLY. Your NEW scene must use FRESH wording: do NOT copy/paste or lightly paraphrase those subject/voice/narrator strings.',
    ...lines,
    '',
  ].join('\n');
}
