/**
 * Map Prompt Studio UI language strings → English label for prompts / Veo sheet.
 * @param {string} raw
 * @returns {string}
 */
export function mapStudioLanguageToEnglishName(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (!s || s === 'vi' || s.includes('việt')) return 'Vietnamese';
  if (s.includes('anh') || s === 'en' || s.includes('english')) return 'English';
  if (s.includes('trung') || s.includes('chinese') || s === 'zh' || s.includes('mandarin')) return 'Mandarin Chinese';
  if (s.includes('nhật') || s.includes('japan') || s === 'ja') return 'Japanese';
  if (s.includes('pháp') || s.includes('french') || s === 'fr') return 'French';
  if (s.includes('đức') || s.includes('german') || s === 'de') return 'German';
  if (s.includes('tây ban nha') || s.includes('spanish') || s === 'es') return 'Spanish';
  return 'Vietnamese';
}

/**
 * One line for LLM partial prompts: which language the "voice" JSON must use.
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @param {{ spoken?: boolean }} [opts]
 * @returns {string}
 */
export function buildLlmDialogueLanguageLine(input, opts = {}) {
  const spoken = opts.spoken !== false;
  if (!spoken) return '';
  const name = mapStudioLanguageToEnglishName(input?.language);
  const native = String(input?.language || '').trim();
  return `Dialogue "voice" field: write the spoken line entirely in ${name} (natural, conversational). User language setting: "${native || 'Tiếng Việt'}".`;
}
