/**
 * True when Prompt Studio user chose no VO (music/SFX only).
 * @param {string} [voice]
 */
export function isStudioVoiceSilentPreset(voice) {
  const v = String(voice || '')
    .trim()
    .toLowerCase();
  if (!v || v === 'none') return true;
  if (v.includes('không thoại')) return true;
  return false;
}
