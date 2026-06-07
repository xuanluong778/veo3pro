import { sanitizeSubject, sanitizeNarratorVi, sanitizeDialogueVi } from './validator.mjs';

/** Từ thường gặp — bỏ qua khi đo “giống nhau” để tránh coi hai cảnh cùng chủ đề là trùng chỉ vì lặp từ nối. */
const STOP = new Set(
  `và của cho một các là có trong trên với để không này đó khi thì đã đang sẽ bạn tôi cũng như hay hoặc nhưng từ ma mà còn lại về đến tại the a an is are to of in on at for and or`
    .split(/\s+/),
);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} s */
function contentTokens(s) {
  return norm(s)
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** @param {string} s @returns {Map<string, number>} */
function tokenMultiset(s) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const t of contentTokens(s)) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

/**
 * Jaccard trên multiset từ (nội dung gần giống / đảo câu vẫn bắt được).
 * @param {string} a
 * @param {string} b
 */
export function multisetJaccardStrings(a, b) {
  const A = tokenMultiset(a);
  const B = tokenMultiset(b);
  if (A.size === 0 && B.size === 0) return 0;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  let uni = 0;
  const keys = new Set([...A.keys(), ...B.keys()]);
  for (const k of keys) {
    const ca = A.get(k) || 0;
    const cb = B.get(k) || 0;
    inter += Math.min(ca, cb);
    uni += Math.max(ca, cb);
  }
  return uni <= 0 ? 0 : inter / uni;
}

/** @param {string} text @param {string[]} priors */
function maxMultisetJaccard(text, priors) {
  let m = 0;
  for (const p of priors) {
    const j = multisetJaccardStrings(text, p);
    if (j > m) m = j;
  }
  return m;
}

const voiceLeads = ['Ở đây,', 'Tiếp theo,', 'Cùng lúc,', 'Một chút nữa —', 'Riêng clip này,', 'Tiếp tục,'];

/**
 * Một lượt: so với mọi dòng đã duyệt trong pass (trùng tuyệt đối hoặc Jaccard cao → chỉnh).
 */
function ensureDistinctPartialsOnce(rows, sceneFns) {
  const priorS = [];
  const priorN = [];
  const priorV = [];

  for (let i = 0; i < rows.length; i += 1) {
    const fn = String(sceneFns[i] || `BEAT_${i}`).trim();
    const r = rows[i];
    let subj = String(r.subject || '').trim();
    let narr = String(r.narrator_vi || '').trim();
    let voice = String(r.voice ?? r.dialogue_vi ?? '').trim();

    let guard = 0;
    while (guard < 8) {
      const sk = norm(subj);
      const dupSExact = sk.length >= 10 && priorS.some((p) => norm(p) === sk);
      const dupSJac = priorS.length > 0 && maxMultisetJaccard(subj, priorS) > 0.58;
      if (!dupSExact && !dupSJac) break;
      subj = sanitizeSubject(
        `${subj} — clip ${i + 1} (${fn})·${guard + 1}: cùng nhân vật, hành động và từ ngữ mới.`,
      );
      guard += 1;
    }
    priorS.push(subj);

    guard = 0;
    while (guard < 8) {
      const nk = norm(narr);
      const dupNExact = nk.length >= 14 && priorN.some((p) => norm(p) === nk);
      const dupNJac = priorN.length > 0 && maxMultisetJaccard(narr, priorN) > 0.62;
      if (!dupNExact && !dupNJac) break;
      narr = sanitizeNarratorVi(
        `${narr} (Video ${i + 1}·${fn}·${guard + 1}: lớp ý mới, không trùng lời các clip trước.)`,
      );
      guard += 1;
    }
    priorN.push(narr);

    if (!voice || /^silent$/i.test(voice)) {
      r.voice = sanitizeDialogueVi('SILENT');
    } else {
      guard = 0;
      while (guard < 8) {
        const vk = norm(voice);
        const dupVExact = vk.length >= 8 && priorV.some((p) => norm(p) === vk);
        const dupVJac = priorV.length > 0 && maxMultisetJaccard(voice, priorV) > 0.72;
        if (!dupVExact && !dupVJac) break;
        voice = `${voiceLeads[(i + guard) % voiceLeads.length]} ${voice}`;
        guard += 1;
      }
      r.voice = sanitizeDialogueVi(voice);
      priorV.push(voice);
    }

    r.subject = sanitizeSubject(subj);
    r.narrator_vi = sanitizeNarratorVi(narr);
    if (Object.prototype.hasOwnProperty.call(r, 'dialogue_vi')) r.dialogue_vi = r.voice;
  }
}

/**
 * Hai lượt + Jaccard: xử lý trùng nguyên văn, đảo câu, và lặp từ khóa giữa các prompt/cảnh.
 * @param {{ subject?: string, voice?: string, narrator_vi?: string, dialogue_vi?: string }[]} rows
 * @param {string[]} sceneFns
 */
export function ensureDistinctPartials(rows, sceneFns) {
  if (!Array.isArray(rows) || !rows.length) return;
  ensureDistinctPartialsOnce(rows, sceneFns);
  ensureDistinctPartialsOnce(rows, sceneFns);
}
