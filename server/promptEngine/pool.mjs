export function normalizeCharacterLabel(text) {
  return String(text || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

const CHARACTER_POOL_MAX = 24;

/**
 * Tất cả tên trong ô nhân vật (phân tách bằng `,` `;` `|` hoặc xuống dòng), tối đa {@link CHARACTER_POOL_MAX}.
 * Dùng cho roster đầy đủ trong prompt + xoay vòng Focus entity theo scene (không cắt theo số scene).
 *
 * @param {string} character
 * @param {number} [maxItems] mặc định 24
 * @returns {string[]}
 */
export function parseCharacterPool(character, maxItems = CHARACTER_POOL_MAX) {
  const cap = Math.min(CHARACTER_POOL_MAX, Math.max(1, Number(maxItems) || CHARACTER_POOL_MAX));
  const items = String(character || '')
    .split(/[,\n;|]+/)
    .map((x) => normalizeCharacterLabel(x))
    .filter(Boolean);
  return Array.from(new Set(items)).slice(0, cap);
}
