/**
 * Gemini / OpenAI REST — thứ tự dùng billing (trừ quota theo key):
 * 1) Header từng request (x-user-*-api-key) nếu có
 * 2) Key Chrome profile: ưu tiên `x-veo3pro-profile-slug`, sau đó các profile còn lại (chỉ hàng có API bật + có ciphertext)
 * 3) Key theo user_api_keys (tài khoản app), chỉ field bật API
 * 4) Biến môi trường OPENAI_* / GEMINI_API_KEY trong .env — chỉ khi không còn nguồn nào ở (2)(3)
 *
 * Gemini qua Gmail đã đăng nhập (web / Ultra): không đi qua file này — xử lý riêng ở POST /api/video/create khi preferUltraProfile.
 * Veo REST (`veoService`): dùng cùng header `x-user-proxy-url` như `geminiRest` để gọi Google qua đúng IP (credit theo proxy).
 */
import { decryptString } from './userApiKeysService.js';
import {
  getChromeProfileApiRow,
  listOrderedChromeProfileSlugs,
} from './chromeProfilesService.js';
import { getUserApiKeysRawRow } from './userApiKeysService.js';

/** SQLite 0 = off; NULL = on (default). */
export function apiFlagOn(sqliteVal) {
  if (sqliteVal === null || sqliteVal === undefined) return true;
  return Number(sqliteVal) !== 0;
}

/**
 * @param {string} userId
 * @param {string} [preferredSlug] Client gửi `x-veo3pro-profile-slug` — profile đó được thử trước (khi bật Gemini + có key) để credit/quota theo key profile đó.
 * @returns {string}
 */
export function resolveGeminiApiKeyForUser(userId, preferredSlug) {
  if (!userId) return '';
  const pref = String(preferredSlug || '').trim();

  const geminiFromSlug = (slug) => {
    const row = getChromeProfileApiRow(userId, slug);
    if (!row || !apiFlagOn(row.gemini_api_enabled) || !row.gemini_ct) return '';
    try {
      const k = decryptString(row.gemini_ct);
      return k && String(k).trim() ? String(k).trim() : '';
    } catch {
      return '';
    }
  };

  if (pref) {
    const k = geminiFromSlug(pref);
    if (k) return k;
  }

  for (const slug of listOrderedChromeProfileSlugs(userId, preferredSlug)) {
    if (pref && slug === pref) continue;
    const k = geminiFromSlug(slug);
    if (k) return k;
  }
  return '';
}

/**
 * @param {string} userId
 * @param {string} [preferredSlug] Profile đang chọn được thử OpenAI/Grok trước (khi bật API + có key).
 * @returns {{ apiKey: string, baseUrl: string } | null}
 */
export function resolveOpenAiStackFromProfiles(userId, preferredSlug) {
  if (!userId) return null;
  const pref = String(preferredSlug || '').trim();

  const openAiFromRow = (row) => {
    if (!row || !apiFlagOn(row.openai_api_enabled) || !row.openai_ct) return null;
    try {
      const k = decryptString(row.openai_ct);
      if (k && String(k).trim()) return { apiKey: String(k).trim(), baseUrl: '' };
    } catch {
      /* skip */
    }
    return null;
  };

  const grokFromRow = (row) => {
    if (!row || !apiFlagOn(row.grok_api_enabled) || !row.grok_ct) return null;
    try {
      const k = decryptString(row.grok_ct);
      if (!k || !String(k).trim()) return null;
      const base =
        row.grok_base_url && String(row.grok_base_url).trim() && apiFlagOn(row.grok_api_enabled)
          ? String(row.grok_base_url).trim()
          : '';
      return { apiKey: String(k).trim(), baseUrl: base };
    } catch {
      return null;
    }
  };

  const stackFromSlug = (slug) => {
    const row = getChromeProfileApiRow(userId, slug);
    if (!row) return null;
    return openAiFromRow(row) || grokFromRow(row);
  };

  if (pref) {
    const hit = stackFromSlug(pref);
    if (hit) return hit;
  }

  for (const slug of listOrderedChromeProfileSlugs(userId, preferredSlug)) {
    if (pref && slug === pref) continue;
    const hit = stackFromSlug(slug);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {string} userId
 * @returns {{ apiKey: string, baseUrl: string } | null}
 */
export function resolveOpenAiStackFromUserRow(userId) {
  if (!userId) return null;
  const row = getUserApiKeysRawRow(userId);
  if (!row) return null;
  if (apiFlagOn(row.openai_api_enabled) && row.openai_ct) {
    try {
      const k = decryptString(row.openai_ct);
      if (k && String(k).trim()) return { apiKey: String(k).trim(), baseUrl: '' };
    } catch {
      /* skip */
    }
  }
  if (apiFlagOn(row.grok_api_enabled) && row.grok_ct) {
    try {
      const k = decryptString(row.grok_ct);
      if (!k || !String(k).trim()) return null;
      const base =
        row.grok_base_url && String(row.grok_base_url).trim() && apiFlagOn(row.grok_api_enabled)
          ? String(row.grok_base_url).trim()
          : '';
      return { apiKey: String(k).trim(), baseUrl: base };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {string} userId
 * @param {string} [preferredSlug]
 * @returns {string}
 */
export function resolveGeminiApiKeyFromUserRow(userId) {
  if (!userId) return '';
  const row = getUserApiKeysRawRow(userId);
  if (!row || !apiFlagOn(row.gemini_api_enabled) || !row.gemini_ct) return '';
  try {
    const k = decryptString(row.gemini_ct);
    return k && String(k).trim() ? String(k).trim() : '';
  } catch {
    return '';
  }
}

/**
 * Danh sách Gemini REST key theo thứ tự billing (slug ưu tiên → profile khác → user_api_keys → .env), không trùng.
 * Dùng để Veo thử key kế tiếp khi key trước báo quota/rate limit.
 */
export function listGeminiRestKeysOrdered(userId, preferredSlug) {
  const keys = [];
  const push = (k) => {
    const s = String(k || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };

  if (!userId) {
    push(process.env.GEMINI_API_KEY || '');
    return keys;
  }

  const gemFromSlug = (slug) => {
    const row = getChromeProfileApiRow(userId, slug);
    if (!row || !apiFlagOn(row.gemini_api_enabled) || !row.gemini_ct) return;
    try {
      push(decryptString(row.gemini_ct));
    } catch {
      /* skip */
    }
  };

  const pref = String(preferredSlug || '').trim();
  if (pref) gemFromSlug(pref);
  for (const slug of listOrderedChromeProfileSlugs(userId, preferredSlug)) {
    if (pref && slug === pref) continue;
    gemFromSlug(slug);
  }

  const ur = getUserApiKeysRawRow(userId);
  if (ur && apiFlagOn(ur.gemini_api_enabled) && ur.gemini_ct) {
    try {
      push(decryptString(ur.gemini_ct));
    } catch {
      /* skip */
    }
  }

  push(process.env.GEMINI_API_KEY || '');
  return keys.filter(Boolean);
}

/**
 * Ứng với một request đã auth: header one-off → else list theo user + slug.
 */
export function geminiRestKeyCandidatesFromRequest(req) {
  const hdr = req?.headers?.['x-user-gemini-api-key'];
  if (typeof hdr === 'string' && hdr.trim()) return [hdr.trim()];
  const uid = req?.user?.id;
  const slug =
    typeof req?.headers?.['x-veo3pro-profile-slug'] === 'string' ? req.headers['x-veo3pro-profile-slug'].trim() : '';
  if (!uid) {
    const env = String(process.env.GEMINI_API_KEY || '').trim();
    return env ? [env] : [];
  }
  return listGeminiRestKeysOrdered(uid, slug);
}

/**
 * Chi tiết nguồn key để UI biết "đang dùng key/Gmail nào".
 * @returns {{ apiKey: string, source: { type: 'header' | 'profile' | 'user' | 'env', slug?: string } }[]}
 */
export function geminiRestCandidatesDetailedFromRequest(req) {
  const out = [];
  const seen = new Set();
  const push = (apiKey, source, meta) => {
    const k = String(apiKey || '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ apiKey: k, source, meta: meta || null });
  };

  const hdr = req?.headers?.['x-user-gemini-api-key'];
  if (typeof hdr === 'string' && hdr.trim()) {
    push(hdr.trim(), { type: 'header' });
    return out;
  }

  const uid = req?.user?.id;
  const preferredSlug =
    typeof req?.headers?.['x-veo3pro-profile-slug'] === 'string' ? req.headers['x-veo3pro-profile-slug'].trim() : '';

  if (uid) {
    const pullProfile = (slug) => {
      if (!slug) return;
      const row = getChromeProfileApiRow(uid, slug);
      if (!row) return;
      if (!apiFlagOn(row.gemini_api_enabled)) return;
      if (!row.gemini_ct) return;
      try {
        const plain = decryptString(row.gemini_ct);
        push(plain, { type: 'profile', slug }, { hadCiphertext: true, decryptOk: true });
      } catch {
        // Keep meta for debugging via /api/veo/start debug field.
        out.push({
          apiKey: '',
          source: { type: 'profile', slug },
          meta: { hadCiphertext: true, decryptOk: false },
        });
      }
    };

    if (preferredSlug) pullProfile(preferredSlug);
    for (const slug of listOrderedChromeProfileSlugs(uid, preferredSlug)) {
      if (preferredSlug && slug === preferredSlug) continue;
      pullProfile(slug);
    }

    const ur = getUserApiKeysRawRow(uid);
    if (ur && apiFlagOn(ur.gemini_api_enabled) && ur.gemini_ct) {
      try {
        const plain = decryptString(ur.gemini_ct);
        push(plain, { type: 'user' }, { hadCiphertext: true, decryptOk: true });
      } catch {
        out.push({
          apiKey: '',
          source: { type: 'user' },
          meta: { hadCiphertext: true, decryptOk: false },
        });
      }
    }
  }

  const env = String(process.env.GEMINI_API_KEY || '').trim();
  if (env) push(env, { type: 'env' });
  return out;
}

export function isGeminiQuotaLikeErrorMessage(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  return (
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('rate-limit') ||
    m.includes('resource_exhausted') ||
    m.includes('resource exhausted') ||
    m.includes('too many requests') ||
    m.includes('exceeded your') ||
    /\b429\b/.test(m)
  );
}
