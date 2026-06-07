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
export declare const MAX_CHARACTER_IDS = 8;
export declare class UnknownCharacterIdError extends Error {
    readonly unknownIds: string[];
    constructor(unknownIds: string[]);
}
/**
 * Normalizes and validates id shape (lowercase, hyphenated slug).
 */
export declare function sanitizeCharacterId(raw: string): string | null;
export declare const CHARACTER_REGISTRY: Record<string, CharacterProfile>;
export declare function listRegistryPublicMeta(): {
    id: string;
    displayName: string;
}[];
type ParseIdsResult = {
    ok: true;
    ids: string[];
} | {
    ok: false;
    code: 'UNKNOWN_IDS';
    unknownIds: string[];
} | {
    ok: false;
    code: 'INVALID_FORMAT';
    samples: string[];
};
/**
 * Parse and validate client-supplied ids against {@link CHARACTER_REGISTRY}.
 * Empty input yields `ok: true` with `ids: []` (caller treats as legacy free-text path).
 */
export declare function parseRequestedCharacterIds(raw: unknown): ParseIdsResult;
export declare function resolveCharacterProfiles(ids: string[]): CharacterProfile[];
/**
 * Deterministic CHARACTER line payload from locked profiles (no model paraphrase).
 */
export declare function formatCharacterCentralFromProfiles(profiles: CharacterProfile[], mode: string): string;
/** Scene FOCUS_BEAT labels: cycle display names when multiple registry characters exist. */
export declare function focusLabelsFromProfiles(profiles: CharacterProfile[], quantity: number): string[];
export {};
//# sourceMappingURL=characterRegistry.d.ts.map