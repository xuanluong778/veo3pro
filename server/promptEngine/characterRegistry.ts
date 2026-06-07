/**
 * Character Registry — system-owned visual locks. Prompt pipeline injects these;
 * clients send stable IDs only so appearance cannot drift via free-text or LLM invention.
 */

export interface CharacterProfile {
  id: string;
  displayName: string;
  /** Single canonical visual bible; must match every scene. */
  visualLock: string;
  wardrobeLock?: string;
  /** Extra negatives for this identity (merged at compile time only if we extend negatives). */
  negativeHints?: string;
}

/** Maximum distinct registry characters per generate request. */
export const MAX_CHARACTER_IDS = 8;

const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

export class UnknownCharacterIdError extends Error {
  readonly unknownIds: string[];
  constructor(unknownIds: string[]) {
    super(`Unknown character id(s): ${unknownIds.join(', ')}`);
    this.name = 'UnknownCharacterIdError';
    this.unknownIds = unknownIds;
  }
}

/**
 * Normalizes and validates id shape (lowercase, hyphenated slug).
 */
export function sanitizeCharacterId(raw: string): string | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s || !ID_RE.test(s)) return null;
  return s;
}

export const CHARACTER_REGISTRY: Record<string, CharacterProfile> = {
  'host-neutral-vn': {
    id: 'host-neutral-vn',
    displayName: 'Host trung tính (VN)',
    visualLock:
      'Adult Vietnamese presenter, neutral warm expression, short neat black hair, medium skin tone, plain cream crew-neck top, natural soft key on face, no glasses, minimal jewelry (optional simple watch only), consistent facial proportions and age read.',
    wardrobeLock: 'Identical cream crew-neck in every scene unless the script states one explicit justified wardrobe beat.',
    negativeHints: 'different face, hair recolor, wig swap, glasses on/off, gender swap, age drift, beauty-filter morph',
  },
  'mascot-lung-cute': {
    id: 'mascot-lung-cute',
    displayName: 'Mascot phổi dễ thương',
    visualLock:
      'Soft rounded lung-shaped mascot, pastel pink-coral gradient body, large friendly dot eyes, small blush marks, stubby limbs, felt-stop-motion texture, fixed proportions and silhouette, no photoreal human features.',
    wardrobeLock: 'No outfit changes; same material finish and palette across scenes.',
    negativeHints: 'photoreal lungs, anatomy gore, human face inside mascot, size change, extra limbs',
  },
  'product-hand-only': {
    id: 'product-hand-only',
    displayName: 'Chỉ tay cầm sản phẩm',
    visualLock:
      'Single adult hand (medium skin tone, short clean nails) holding the product; wrist and forearm edge only; no face, no second person, consistent hand identity across scenes.',
    wardrobeLock: 'No sleeve pattern or skin tone changes between scenes.',
    negativeHints: 'full body, face reveal, different hand, nail art change, gloves unless script says so',
  },
};

export function listRegistryPublicMeta(): { id: string; displayName: string }[] {
  return Object.values(CHARACTER_REGISTRY).map(({ id, displayName }) => ({ id, displayName }));
}

type ParseIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; code: 'UNKNOWN_IDS'; unknownIds: string[] }
  | { ok: false; code: 'INVALID_FORMAT'; samples: string[] };

/**
 * Parse and validate client-supplied ids against {@link CHARACTER_REGISTRY}.
 * Empty input yields `ok: true` with `ids: []` (caller treats as legacy free-text path).
 */
export function parseRequestedCharacterIds(raw: unknown): ParseIdsResult {
  const list: string[] = Array.isArray(raw)
    ? raw.map((x) => String(x ?? ''))
    : typeof raw === 'string'
      ? raw.split(/[,\n;|]+/)
      : [];

  const normalized: string[] = [];
  const unknown: string[] = [];
  const invalidSamples: string[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const id = sanitizeCharacterId(trimmed);
    if (!id) {
      if (invalidSamples.length < 8) invalidSamples.push(trimmed.slice(0, 64));
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const row = CHARACTER_REGISTRY[id];
    if (!row) unknown.push(id);
    else normalized.push(id);
  }

  if (invalidSamples.length) return { ok: false, code: 'INVALID_FORMAT', samples: invalidSamples };
  if (unknown.length) return { ok: false, code: 'UNKNOWN_IDS', unknownIds: unknown };
  return { ok: true, ids: normalized.slice(0, MAX_CHARACTER_IDS) };
}

export function resolveCharacterProfiles(ids: string[]): CharacterProfile[] {
  const unknown: string[] = [];
  const out: CharacterProfile[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = sanitizeCharacterId(String(raw));
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = CHARACTER_REGISTRY[id];
    if (!p) unknown.push(id);
    else out.push(p);
  }
  if (unknown.length) throw new UnknownCharacterIdError(unknown);
  return out;
}

/**
 * Deterministic CHARACTER line payload from locked profiles (no model paraphrase).
 */
export function formatCharacterCentralFromProfiles(profiles: CharacterProfile[], mode: string): string {
  const modeLine =
    `consistency mode: ${mode} | VISUAL_LOCK_REGISTRY_ONLY — do not invent, alter, age, or restyle these identities; match locked profiles exactly in every scene; no AI-driven character variation.`.replace(/\s+/g, ' ').trim();
  if (!profiles.length) return `Central subject not specified | ${modeLine}`;
  const blocks = profiles.map((p) => {
    const parts = [`[${p.id}] ${p.displayName}`, `VISUAL_LOCK: ${p.visualLock}`];
    if (p.wardrobeLock) parts.push(`WARDROBE_LOCK: ${p.wardrobeLock}`);
    if (p.negativeHints) parts.push(`CHAR_NEG_HINTS: ${p.negativeHints}`);
    return parts.join(' | ');
  });
  return `${blocks.join(' || ')} | ${modeLine}`.replace(/\s+/g, ' ').trim();
}

/** Scene FOCUS_BEAT labels: cycle display names when multiple registry characters exist. */
export function focusLabelsFromProfiles(profiles: CharacterProfile[], quantity: number): string[] {
  if (!profiles.length) return [];
  const labels = profiles.map((p) => p.displayName);
  const q = Math.min(20, Math.max(1, Number(quantity) || 1));
  return Array.from({ length: q }, (_, i) => labels[i % labels.length]);
}
