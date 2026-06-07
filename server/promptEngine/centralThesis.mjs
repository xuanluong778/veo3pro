/**
 * One central thesis per video — generated once, injected into every compiled scene + partial LLM context.
 */

function cleanJsonFence(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function extractLikelyJson(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const s = cleanJsonFence(t);
  const firstObj = s.indexOf('{');
  const lastObj = s.lastIndexOf('}');
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return s.slice(firstObj, lastObj + 1).trim();
  }
  return s;
}

const MAX_THESIS_CHARS = 200;

/**
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @returns {string}
 */
export function buildCentralThesisUserPrompt(input) {
  const topic = String(input.topic || 'General topic').trim();
  const ctx = String(input.context || '').trim();
  const style = String(input.style || '').trim();
  const lines = [
    'Return STRICT JSON only: {"thesis":"..."}',
    'Rules:',
    `- "thesis": exactly ONE core message for the entire multi-scene film, max ${MAX_THESIS_CHARS} characters.`,
    '- Same language as topic (usually Vietnamese).',
    '- No scene list, no camera/lighting, no new character invention.',
    '',
    `Topic: ${topic}`,
  ];
  if (style) lines.push(`Style label (tone only; do not invent visuals): ${style}`);
  if (ctx) lines.push(`Extra context: ${ctx}`);
  lines.push('', 'JSON only. No markdown.');
  return lines.join('\n');
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function parseCentralThesisJson(text) {
  const cleaned = extractLikelyJson(text);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed.thesis ?? parsed.core_message ?? parsed.message;
  if (typeof raw !== 'string') return null;
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.length < 8) return null;
  return t.length > MAX_THESIS_CHARS ? `${t.slice(0, MAX_THESIS_CHARS - 1)}…` : t;
}

/**
 * @param {string} [topic]
 * @param {string} [context]
 * @returns {string}
 */
export function fallbackThesisFromTopic(topic, context) {
  const t = String(topic || '').trim();
  const c = String(context || '').trim();
  const core = [t, c].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim();
  const s = core || 'Một thông điệp xuyên suốt giữ các cảnh thống nhất.';
  return s.length > MAX_THESIS_CHARS ? `${s.slice(0, MAX_THESIS_CHARS - 1)}…` : s;
}
