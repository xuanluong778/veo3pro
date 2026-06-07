/**
 * Deterministic kernels: CHARACTER, META — look/negative from Prompt DNA (TypeScript module).
 */

import { mergePromptDNA, buildNegativeFromDNA } from './js/promptDNA.js';
import {
  resolveCharacterProfiles,
  formatCharacterCentralFromProfiles,
  focusLabelsFromProfiles,
} from './js/characterRegistry.js';
import { parseCharacterPool } from './pool.mjs';
import { NEGATIVE_SUFFIX, clampClipDurationSec } from './constants.mjs';

/**
 * Resolve merged PromptDNA (defaults + optional client overrides on `input.promptDNA`).
 * @param {import('./types.mjs').StudioGenerateInput} input
 */
export function resolvePromptDNA(input) {
  const partial = input?.promptDNA && typeof input.promptDNA === 'object' ? input.promptDNA : {};
  return mergePromptDNA(partial);
}

/**
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @returns {string}
 */
export function buildNegativeLine(input) {
  const dna = resolvePromptDNA(input);
  return buildNegativeFromDNA(dna, String(input.negative || ''), NEGATIVE_SUFFIX);
}

function buildCharacterCentralLegacy(input) {
  const raw = String(input.character || 'Central subject not specified').trim();
  const mode = String(input.characterMode || 'keep-consistency').trim();
  const roster = parseCharacterPool(raw, 24);
  const ensemble =
    roster.length >= 2
      ? ` | ENSEMBLE_CAST: ${roster.length} co-stars in ONE storyline—cycle primary "Focus entity" per scene index; non-lead entities stay in-world (cameo/background/prop/silhouette) so no one drops from canon. Roster: ${roster.join(' · ')}.`
      : '';
  return `${raw} | consistency mode: ${mode} | same wardrobe/silhouette/material reads across every scene unless script explicitly states a single justified prop change.${ensemble}`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Registry path: validated `characterIds` on input; legacy path: `character` free text.
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @param {number} quantity
 * @returns {{ characterCentral: string, focusPool: string[], usesRegistry: boolean }}
 */
export function resolveCharacterInjections(input, quantity) {
  const q = Math.min(20, Math.max(1, Number(quantity) || 1));
  const rawIds = Array.isArray(input.characterIds) ? input.characterIds : [];
  const ids = [];
  const seen = new Set();
  for (const x of rawIds) {
    const id = String(x || '')
      .trim()
      .toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  if (ids.length) {
    const profiles = resolveCharacterProfiles(ids);
    const mode = String(input.characterMode || 'keep-consistency').trim();
    return {
      characterCentral: formatCharacterCentralFromProfiles(profiles, mode),
      focusPool: focusLabelsFromProfiles(profiles, q),
      usesRegistry: true,
    };
  }

  return {
    characterCentral: buildCharacterCentralLegacy(input),
    focusPool: parseCharacterPool(input.character, 24),
    usesRegistry: false,
  };
}

/**
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @returns {string}
 */
export function buildCharacterCentral(input) {
  return resolveCharacterInjections(input, 1).characterCentral;
}

/**
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @returns {string}
 */
export function buildMetaLine(input) {
  const ratio = String(input.ratio || '16:9').trim();
  const duration = clampClipDurationSec(input.duration);
  const humor = Math.min(100, Math.max(0, Number(input.humorLevel) || 0));
  return `duration ~${duration}s, aspect ${ratio}, humor ${humor}/100, continuous single-film continuity.`;
}
