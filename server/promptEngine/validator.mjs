import { AUDIO_DIALOGUE_MARK } from './promptCompiler.mjs';

const MAX_SUBJECT_LEN = 220;
const MAX_DIALOGUE_WORDS = 48;

/**
 * Giảm lặp từ liền nhau và lặp cụm 2–3 từ liền nhau (model hay nhân đôi).
 * @param {string} text
 * @returns {string}
 */
export function dedupeRepeatedWordRuns(text) {
  let s = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return '';
  const toks = s.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i += 1) {
    if (i > 0 && toks[i] === toks[i - 1]) continue;
    out.push(toks[i]);
  }
  s = out.join(' ');
  for (let pass = 0; pass < 8; pass += 1) {
    const next = s
      .replace(/(\S+\s+\S+)\s+\1(?=\s|$)/g, '$1')
      .replace(/(\S+\s+\S+\s+\S+)\s+\1(?=\s|$)/g, '$1');
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

/**
 * @param {string} text
 * @returns {number}
 */
export function countWordsVi(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const MAX_VOICE_WORDS = 48;

/**
 * Validates one LLM partial scene **before** sanitization (so over-long voice triggers retry, not silent truncate). Voice ≤8 words for ~8s clips.
 * @param {{ subject?: string, voice?: string, dialogue_vi?: string, narrator_vi?: string, sceneFunction?: string }} scene
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateScene(scene) {
  const errors = [];
  const subject = String(scene?.subject ?? '').trim();
  if (!subject) errors.push('missing_subject');

  const sceneFunction = String(scene?.sceneFunction ?? '').trim();
  if (!sceneFunction) errors.push('missing_scene_function');

  const voiceRaw = String(scene?.voice ?? scene?.dialogue_vi ?? '').trim();
  const voiceNorm = voiceRaw || 'SILENT';
  const isSilent = /^silent$/i.test(voiceNorm);
  if (!isSilent && countWordsVi(voiceNorm) > MAX_VOICE_WORDS) {
    errors.push('voice_too_many_words');
  }

  const narr = String(scene?.narrator_vi ?? '').trim();
  if (!narr) errors.push('missing_narrator_vi');
  else if (countWordsVi(narr) > MAX_VOICE_WORDS) errors.push('narrator_too_many_words');

  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * @param {string} s
 * @returns {string}
 */
export function sanitizeSubject(s) {
  let t = String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ');
  t = dedupeRepeatedWordRuns(t);
  if (!t) t = 'Một nhịp hình duy nhất trong cùng thế giới câu chuyện (bổ sung thủ công nếu cần).';
  if (t.length > MAX_SUBJECT_LEN) t = `${t.slice(0, MAX_SUBJECT_LEN - 1)}…`;
  return t;
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeDialogueVi(raw) {
  const s0 = dedupeRepeatedWordRuns(String(raw || '').trim());
  if (!s0 || /^silent$/i.test(s0)) return 'SILENT';
  const words = s0.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_DIALOGUE_WORDS) return words.join(' ');
  return words.slice(0, MAX_DIALOGUE_WORDS).join(' ');
}

/** Narrator / Flow VO — cùng trần từ với thoại nhân vật. */
export function sanitizeNarratorVi(raw) {
  const s = dedupeRepeatedWordRuns(String(raw || '').trim());
  if (!s) return '';
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_DIALOGUE_WORDS) return words.join(' ');
  return words.slice(0, MAX_DIALOGUE_WORDS).join(' ');
}

/**
 * Validates output of {@link import('./promptCompiler.mjs').buildFinalPrompt}.
 * @param {string} prompt
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCompiledPrompt(prompt) {
  const text = String(prompt || '');
  const lines = text.split('\n');
  const required = [
    'GLOBAL_STYLE:',
    'CENTRAL_THESIS:',
    'CONSISTENCY_LOCK:',
    'INTENSITY:',
    'CHARACTER:',
    'SCENE:',
    'CAMERA:',
    'LIGHTING:',
    'MOTION:',
    'AUDIO:',
    'NEGATIVE_PROMPT:',
  ];
  for (const k of required) {
    if (!lines.some((l) => l.startsWith(k))) return { ok: false, error: `Thiếu khối ${k}` };
  }
  const audioLine = lines.find((l) => l.startsWith('AUDIO:'));
  if (!audioLine) return { ok: false, error: 'Thiếu khối AUDIO:' };
  const idx = audioLine.indexOf(AUDIO_DIALOGUE_MARK);
  const val = idx === -1 ? '' : audioLine.slice(idx + AUDIO_DIALOGUE_MARK.length).trim();
  if (val !== 'SILENT' && countWordsVi(val) > MAX_DIALOGUE_WORDS) {
    return { ok: false, error: 'Thoại (voice) trong AUDIO vượt quá 48 từ' };
  }
  return { ok: true };
}
