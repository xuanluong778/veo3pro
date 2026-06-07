/**
 * Commercial export — one-line Veo sheet: Style, Character, Anatomy, Face, Composition,
 * Environment, Dialogue, Negative (matches common Veo 3 prompt examples).
 */

import { parseCompiledPromptBlocks, extractDialogueFromAudioBlock } from './renderPromptExtractor.mjs';
import { buildSceneTitle } from './promptCompiler.mjs';
import { isStudioVoiceSilentPreset } from './studioVoice.mjs';
import { dedupeRepeatedWordRuns } from './validator.mjs';

const STYLE_LEAD = 'High-End 3D Commercial Animation (Unreal Engine 5)';

const ANATOMY_FIXED_CARTOON =
  'Stylized Disney/Pixar cartoon style, exaggerated big head, small body, tiny thin stick-like arms and legs.';

const FACE_FIXED_CARTOON =
  "Large 3D expressive eyes and a simple animated mouth on the object's surface. NO NOSE. NO HUMAN CHIN.";

const ANATOMY_FIXED_REAL =
  'Photorealistic human anatomy with realistic proportions, natural body structure, realistic skin texture.';
const FACE_FIXED_REAL =
  'Photorealistic human face with natural eyes, natural mouth, realistic skin detail and facial features.';

/** @param {string} preset */
function mapVoicePresetToEn(preset) {
  const k = String(preset || '')
    .trim()
    .toLowerCase();
  if (isStudioVoiceSilentPreset(preset)) return { label: 'None', spoken: false };
  const m = new Map(
    Object.entries({
      'nam trẻ': 'Young Male',
      'nam trè': 'Mature Male',
      'nữ trẻ': 'Young Female',
      'trung tính': 'Neutral',
      'nam già': 'Older Male',
      'nữ già': 'Older Female',
      'trè con': 'Child',
      'hài hước': 'Playful',
      'kể chuyện': 'Storyteller',
      robot: 'Robot',
      'quái vật': 'Creature Character',
      'trầm ấm': 'Warm Low',
    }).map(([a, b]) => [a.toLowerCase(), b]),
  );
  return { label: m.get(k) || String(preset).trim(), spoken: true };
}

/** English tone label for Dialogue (…) line. */
function mapStyleToneToEn(st) {
  const s = String(st || '').toLowerCase();
  if (s.includes('châm')) return 'Sarcastic';
  if (s.includes('hài')) return 'Playful';
  if (s.includes('cảm')) return 'Emotional';
  if (s.includes('kinh')) return 'Suspenseful';
  if (s.includes('kịch')) return 'Dramatic';
  if (s.includes('bí')) return 'Mysterious';
  if (s.includes('giáo')) return 'Encouraging';
  if (s.includes('triết')) return 'Thoughtful';
  return 'Natural';
}

/** Strip ensemble/registry noise from CHARACTER block; keep hero copy. */
function simplifyCommercialCharacter(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  const cut = s.search(/\bENSEMBLE_CAST\b/i);
  if (cut >= 0) s = s.slice(0, cut).trim();
  s = s.replace(/\bVISUAL_LOCK_REGISTRY_ONLY\b[^|]*/gi, '');
  s = s.replace(/\bVISUAL_LOCK\b[^|]*/gi, '');
  return dedupeRepeatedWordRuns(s);
}

/** @param {string} s @param {number} max */
function clipText(s, max) {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** @param {string} q */
function escapeDialogueForQuotes(q) {
  return String(q || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, "'");
}

function collapseNorm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bỏ câu/đoạn có phần đầu trùng corpus (giảm lặp giữa Style / Environment / Dialogue).
 * @param {string} text
 * @param {string} corpus
 */
function dropRedundantClauses(text, corpus) {
  const c = collapseNorm(corpus);
  const raw = dedupeRepeatedWordRuns(String(text || '').replace(/\s+/g, ' ').trim());
  if (!raw) return '';
  if (!c) return raw;
  const sentences = raw.split(/(?<=[.!?…;])\s+/).map((x) => x.trim()).filter(Boolean);
  if (sentences.length <= 1) {
    const t = sentences[0] || raw;
    const nt = collapseNorm(t);
    if (nt.length >= 28) {
      const head = nt.slice(0, Math.min(72, nt.length));
      if (c.includes(head)) return '';
    }
    return t;
  }
  const kept = sentences.filter((p) => {
    const np = collapseNorm(p);
    if (np.length < 20) return true;
    const head = np.slice(0, Math.min(72, np.length));
    return !c.includes(head);
  });
  return dedupeRepeatedWordRuns(kept.join(' ').replace(/\s+/g, ' ').trim()) || raw;
}

/** @param {string} env @param {string} thesis */
function thesisAlreadyInEnvironment(env, thesis) {
  const e = collapseNorm(env);
  const words = String(thesis || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);
  if (!words.length) return true;
  let hit = 0;
  for (const w of words) if (e.includes(w)) hit += 1;
  return hit / words.length >= 0.5;
}

/** @param {string} dialogue */
function inferDialogueSpeedEn(dialogue) {
  const w = String(dialogue || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (w <= 0) return 'N/A';
  if (w <= 14) return 'Fast';
  if (w <= 32) return 'Normal';
  return 'Slow';
}

/**
 * Tiêu đề thẻ scene: ưu tiên tên nhân vật / đạo cụ ngắn (focus beat) nếu có.
 */
export function buildSceneDisplayTitle({ focusBeat, sceneFunction, subject }) {
  const fb = String(focusBeat || '').trim();
  if (fb && fb.length <= 42 && !/[\n\r]/.test(fb)) return fb;
  return buildSceneTitle(sceneFunction, subject);
}

/**
 * English commercial line: Style, Character, Anatomy, Face, Composition, Environment, Dialogue, Negative.
 * @param {string} compiledPrompt
 * @param {{ voicePreset?: string, styleTone?: string, context?: string, environmentBase?: string, duration?: number, language?: string, narratorVi?: string, ratio?: string, topic?: string, centralThesis?: string }} meta
 */
export function buildCommercialVeoSheetPrompt(compiledPrompt, meta = {}) {
  const b = parseCompiledPromptBlocks(String(compiledPrompt || ''));
  const globalStyle = String(b.GLOBAL_STYLE || '').replace(/\s+/g, ' ').trim();
  const character = String(b.CHARACTER || '').replace(/\s+/g, ' ').trim();
  const scene = String(b.SCENE || '').replace(/\s+/g, ' ').trim();
  const camera = String(b.CAMERA || '').replace(/\s+/g, ' ').trim();
  const lighting = String(b.LIGHTING || '').replace(/\s+/g, ' ').trim();
  const motion = String(b.MOTION || '').replace(/\s+/g, ' ').trim();
  const neg = String(b.NEGATIVE_PROMPT || '').replace(/\s+/g, ' ').trim();
  const audioBody = String(b.AUDIO || '');
  const dialogueRaw = extractDialogueFromAudioBlock(audioBody);

  const thesis = String(b.CENTRAL_THESIS || meta.centralThesis || '')
    .replace(/\s+/g, ' ')
    .trim();
  const topic = String(meta.topic || '').replace(/\s+/g, ' ').trim();
  const ctx = String(meta.context || '').trim();
  const envBase = String(meta.environmentBase || '').trim();
  const topicAnchor = [topic, ctx].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const sceneBare = scene
    .replace(/\[[^\]]+\]\s*/g, '')
    .replace(/\bFocus entity:\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const charCore = simplifyCommercialCharacter(character);
  const charBlock =
    clipText(charCore, 1100) || 'Central hero product or mascot (match topic).';

  // If user selected "Người thật (Realistic / Photoreal)" we must avoid hard-coded Disney/Pixar anatomy.
  const isPhotorealMode = /photoreal|realistic|người thật|nguoi that/i.test(charCore);
  const ANATOMY_FIXED = isPhotorealMode ? ANATOMY_FIXED_REAL : ANATOMY_FIXED_CARTOON;
  const FACE_FIXED = isPhotorealMode ? FACE_FIXED_REAL : FACE_FIXED_CARTOON;

  let styleTail = clipText(globalStyle, 160);
  styleTail = dropRedundantClauses(styleTail, [thesis, topicAnchor].join(' ')) || styleTail;
  const styleBlock =
    styleTail && !styleTail.toLowerCase().includes('unreal')
      ? `Style: ${STYLE_LEAD}. ${styleTail}`
      : `Style: ${STYLE_LEAD}.`;

  const composition = [camera, lighting, motion].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const compositionBlock = clipText(
    composition ||
      'Macro photography, shallow depth of field (Bokeh). The object looks small and cute.',
    420,
  );

  let environmentRaw = [ctx, sceneBare, envBase].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  environmentRaw = dedupeRepeatedWordRuns(environmentRaw);
  const charThesisCorpus = [charBlock, thesis, topicAnchor].join(' ');
  let environmentWork =
    dropRedundantClauses(environmentRaw, charThesisCorpus) || environmentRaw;
  if (thesis && !thesisAlreadyInEnvironment(environmentWork, thesis)) {
    environmentWork = dedupeRepeatedWordRuns(
      `${environmentWork} Core message: ${clipText(thesis, 130)}`.replace(/\s+/g, ' ').trim(),
    );
  }
  const environmentBlock =
    clipText(environmentWork, 520) ||
    'Premium tabletop or motivated practical set; match product category.';

  let negBlock = clipText(dedupeRepeatedWordRuns(neg), 520);
  if (isPhotorealMode) {
    // Hard block common cartoon/illustration artifacts.
    negBlock = clipText(
      dedupeRepeatedWordRuns(
        `${negBlock}; no disney/pixar cartoon; no animated big head; no illustration; no anime; no stylized face;`,
      ),
      520,
    );
  }

  const { label: voiceEn, spoken } = mapVoicePresetToEn(meta.voicePreset);
  const toneEn = mapStyleToneToEn(meta.styleTone);

  const hasLine = Boolean(dialogueRaw && !/^silent$/i.test(String(dialogueRaw).trim()));
  const narratorRaw = String(meta.narratorVi ?? '').trim();
  const narratorAsDialogue = !hasLine && narratorRaw;
  const resolvedDialogueRaw = hasLine ? dialogueRaw : narratorAsDialogue;
  const effectiveSpoken = Boolean(resolvedDialogueRaw && !/^silent$/i.test(String(resolvedDialogueRaw).trim()));
  const resolvedVoiceEn = hasLine && spoken ? voiceEn : 'Narrator (Gemini VN)';

  let spokenForSpeed = String(resolvedDialogueRaw || '').trim();
  if (effectiveSpoken) {
    const diaCorpus = [thesis, topicAnchor, charBlock, environmentBlock].join(' ');
    const diaTrim = dropRedundantClauses(dedupeRepeatedWordRuns(spokenForSpeed), diaCorpus);
    if (diaTrim && diaTrim.length >= 8) spokenForSpeed = diaTrim;
    else spokenForSpeed = dedupeRepeatedWordRuns(spokenForSpeed);
  }
  const lineForQuotes = effectiveSpoken ? escapeDialogueForQuotes(spokenForSpeed) : '';
  const speedEn = inferDialogueSpeedEn(spokenForSpeed);

  const dialogueSection = effectiveSpoken
    ? `Dialogue (Voice: ${resolvedVoiceEn}, Tone: ${toneEn}, Speed: ${speedEn}): "${lineForQuotes}"`
    : `Dialogue (Voice: ${resolvedVoiceEn}, Tone: ${toneEn}, Speed: N/A): ""`;

  let body = [
    styleBlock,
    `Character: ${charBlock}`,
    `Anatomy: ${ANATOMY_FIXED}`,
    `Face: ${FACE_FIXED}`,
    `Composition: ${compositionBlock}`,
    `Environment: ${environmentBlock}`,
    dialogueSection,
    `Negative: ${negBlock}`,
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  body = dedupeRepeatedWordRuns(body);
  return body;
}
