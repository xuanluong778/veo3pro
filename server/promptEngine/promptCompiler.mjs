/**
 * Prompt Compiler — system-owned template. AI supplies only `subject` + `voice` per scene;
 * `buildFinalPrompt` assembles the final string from Prompt DNA + character lock + scene slot.
 */

import { buildIntensityLine } from './sceneIntensity.mjs';
import { clampClipDurationSec } from './constants.mjs';

/** Marker inside AUDIO so validators can find the model-generated dialogue segment. */
export const AUDIO_DIALOGUE_MARK = '| Spoken dialogue (verbatim): ';

/** System-owned: no drift from locked DNA/character across the run. */
export const CONSISTENCY_LOCK_TEXT =
  'LOCKED_ACROSS_RUN: identical world grammar, palette, and CHARACTER read in every scene; forbid LUT/style hop, spontaneous redesign, second art direction, or new aspect; subject = ONE visual idea only per scene.';

/**
 * @typedef {import('./js/promptDNA.js').PromptDNA} PromptDNA
 */

/**
 * One scene worth of AI partials + runtime fields for GLOBAL_STYLE / negatives.
 * @typedef {Object} CompilerSceneInput
 * @property {string} subject
 * @property {string} voice
 * @property {string} sceneFunction
 * @property {string} [focusBeat]
 * @property {string} negativeLine
 * @property {string} [metaLine]
 * @property {string} [ratio]
 * @property {number} [duration]
 * @property {string} [styleTone]
 * @property {number} [humor]
 * @property {string} [context]
 * @property {string} centralThesis One core message for the whole video (injected every scene).
 * @property {number} [sceneIndex0] 0-based index for INTENSITY line
 * @property {number} [totalScenes] total scenes for INTENSITY line
 */

/**
 * Assemble the final Veo-style prompt from template blocks (no full-prompt AI path).
 * @param {CompilerSceneInput} scene
 * @param {PromptDNA} dna Merged Prompt DNA (defaults + optional `input.promptDNA` overrides).
 * @param {string} character Resolved CHARACTER line body (registry or legacy text).
 * @returns {string}
 */
export function buildFinalPrompt(scene, dna, character) {
  const ratio = String(scene.ratio || '16:9').trim();
  const duration = clampClipDurationSec(scene.duration);
  const styleTone = String(scene.styleTone || 'cinematic').trim();
  const humor = Math.min(100, Math.max(0, Number(scene.humor) || 0));
  const ctx = String(scene.context || '').trim();
  const subject = String(scene.subject || '').trim();
  const voice = String(scene.voice ?? '').trim();
  const sceneFn = String(scene.sceneFunction || '').trim();
  const focus = scene.focusBeat ? `Focus entity: ${String(scene.focusBeat).trim()}` : '';
  const sceneBlock = [`[${sceneFn}]`, subject, focus].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const gsCore = `${dna.globalStyle} Execution binders: aspect ${ratio}, ~${duration}s beats, humor register ${humor}/100 (performance only); tone label "${styleTone}" must not override DNA look.${ctx ? ` Story anchor: ${ctx}.` : ''} Environment continuity: ${dna.environmentBase}`
    .replace(/\s+/g, ' ')
    .trim();
  const meta = String(scene.metaLine || '').trim();
  const globalStyle = meta ? `${gsCore} Continuity: ${meta}`.replace(/\s+/g, ' ').trim() : gsCore;

  const audio = `${dna.audioBase}${AUDIO_DIALOGUE_MARK}${voice}`.replace(/\s+/g, ' ').trim();
  const neg = String(scene.negativeLine || '').trim();

  const thesis = String(scene.centralThesis || '').trim() || 'N/A — provide topic for thesis.';
  const idx0 = Math.max(0, Math.floor(Number(scene.sceneIndex0)) || 0);
  const total = Math.min(20, Math.max(1, Math.floor(Number(scene.totalScenes)) || 1));
  const intensity = buildIntensityLine(idx0, total);

  return [
    `GLOBAL_STYLE: ${globalStyle}`,
    `CENTRAL_THESIS: ${thesis}`,
    `CONSISTENCY_LOCK: ${CONSISTENCY_LOCK_TEXT}`,
    `INTENSITY: ${intensity}`,
    `CHARACTER: ${String(character || '').trim()}`,
    `SCENE: ${sceneBlock}`,
    `CAMERA: ${dna.cameraBase}`,
    `LIGHTING: ${dna.lightingBase}`,
    `MOTION: ${dna.motionBase}`,
    `AUDIO: ${audio}`,
    `NEGATIVE_PROMPT: ${neg}`,
  ].join('\n');
}

/**
 * @param {string} sceneFunction
 * @param {string} subject
 * @returns {string}
 */
export function buildSceneTitle(sceneFunction, subject) {
  const s = subject.length > 52 ? `${subject.slice(0, 49)}…` : subject;
  return `${sceneFunction} — ${s}`;
}
