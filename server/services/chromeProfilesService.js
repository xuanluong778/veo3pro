import { openDb } from './userStore.js';
import { decryptString, encryptString } from './userApiKeysService.js';

/** SQLite 0 = off; NULL = on (default). */
function apiFlagOn(sqliteVal) {
  if (sqliteVal === null || sqliteVal === undefined) return true;
  return Number(sqliteVal) !== 0;
}

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chrome_portable_profiles (
      user_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      display_name TEXT NOT NULL,
      proxy_url TEXT,
      accounts_text TEXT,
      gemini_ct TEXT,
      grok_ct TEXT,
      grok_base_url TEXT,
      openai_ct TEXT,
      created_at TEXT NOT NULL,
      last_opened_at TEXT,
      PRIMARY KEY (user_id, slug),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chrome_portable_profiles_user ON chrome_portable_profiles(user_id, created_at);
  `);

  // Migration for older schema: add proxy_url if missing
  try {
    const cols = db.prepare('PRAGMA table_info(chrome_portable_profiles)').all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('proxy_url')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN proxy_url TEXT');
    }
    if (!names.has('accounts_text')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN accounts_text TEXT');
    }
    if (!names.has('gemini_ct')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN gemini_ct TEXT');
    }
    if (!names.has('grok_ct')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN grok_ct TEXT');
    }
    if (!names.has('grok_base_url')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN grok_base_url TEXT');
    }
    if (!names.has('openai_ct')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN openai_ct TEXT');
    }
    if (!names.has('gemini_api_enabled')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN gemini_api_enabled INTEGER');
    }
    if (!names.has('grok_api_enabled')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN grok_api_enabled INTEGER');
    }
    if (!names.has('openai_api_enabled')) {
      db.exec('ALTER TABLE chrome_portable_profiles ADD COLUMN openai_api_enabled INTEGER');
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} userId
 * @param {string} [preferredSlug]
 * @returns {string[]}
 */
export function listOrderedChromeProfileSlugs(userId, preferredSlug) {
  if (!userId) return [];
  const db = openDb();
  ensureTable(db);
  const all = db
    .prepare(
      `
      SELECT slug FROM chrome_portable_profiles
      WHERE user_id = ?
      ORDER BY COALESCE(last_opened_at, created_at) DESC, created_at DESC
    `,
    )
    .all(userId)
    .map((r) => r.slug);
  const pref = String(preferredSlug || '').trim();
  if (!pref || !all.includes(pref)) return all;
  return [pref, ...all.filter((s) => s !== pref)];
}

export function getChromeProfileApiRow(userId, slug) {
  if (!userId || !slug) return null;
  const db = openDb();
  ensureTable(db);
  return db
    .prepare(
      `
      SELECT gemini_ct, grok_ct, openai_ct, grok_base_url,
             COALESCE(gemini_api_enabled, 1) AS gemini_api_enabled,
             COALESCE(grok_api_enabled, 1) AS grok_api_enabled,
             COALESCE(openai_api_enabled, 1) AS openai_api_enabled
      FROM chrome_portable_profiles
      WHERE user_id = ? AND slug = ?
    `,
    )
    .get(userId, slug);
}

/**
 * @param {string} userId
 * @param {string} slug
 * @param {{ geminiEnabled?: boolean, grokEnabled?: boolean, openAiEnabled?: boolean }} flags
 */
export function setChromePortableProfileApiFlags(userId, slug, { geminiEnabled, grokEnabled, openAiEnabled }) {
  if (!userId) throw new Error('Thiếu userId.');
  if (!slug) throw new Error('Thiếu slug.');
  const db = openDb();
  ensureTable(db);
  const exists = db.prepare('SELECT 1 AS ok FROM chrome_portable_profiles WHERE user_id = ? AND slug = ?').get(userId, slug);
  if (!exists) throw new Error('Không có Chrome profile này.');
  const sets = [];
  const vals = [];
  if (typeof geminiEnabled === 'boolean') {
    sets.push('gemini_api_enabled = ?');
    vals.push(geminiEnabled ? 1 : 0);
  }
  if (typeof grokEnabled === 'boolean') {
    sets.push('grok_api_enabled = ?');
    vals.push(grokEnabled ? 1 : 0);
  }
  if (typeof openAiEnabled === 'boolean') {
    sets.push('openai_api_enabled = ?');
    vals.push(openAiEnabled ? 1 : 0);
  }
  if (!sets.length) return { ok: true };
  vals.push(userId, slug);
  db.prepare(`UPDATE chrome_portable_profiles SET ${sets.join(', ')} WHERE user_id = ? AND slug = ?`).run(...vals);
  return { ok: true };
}

export function listChromePortableProfiles(userId) {
  if (!userId) return [];
  const db = openDb();
  ensureTable(db);
  const rows = db
    .prepare(
      `SELECT slug,
              display_name as displayName,
              proxy_url as proxyUrl,
              accounts_text as accountsText,
              gemini_ct,
              grok_ct,
              grok_base_url as grokBaseUrl,
              openai_ct,
              COALESCE(gemini_api_enabled, 1) AS gemini_api_enabled,
              COALESCE(grok_api_enabled, 1) AS grok_api_enabled,
              COALESCE(openai_api_enabled, 1) AS openai_api_enabled,
              created_at as createdAt,
              last_opened_at as lastOpenedAt
        FROM chrome_portable_profiles
       WHERE user_id = ?
       ORDER BY COALESCE(last_opened_at, created_at) DESC, created_at DESC`,
    )
    .all(userId);
  const items = Array.isArray(rows) ? rows : [];
  // Never expose ciphertext to client; only return statuses.
  return items.map((r) => ({
    slug: r.slug,
    displayName: r.displayName,
    proxyUrl: r.proxyUrl,
    accountsText: r.accountsText,
    createdAt: r.createdAt,
    lastOpenedAt: r.lastOpenedAt,
    keyStatus: {
      hasGemini: Boolean(r?.gemini_ct && String(r.gemini_ct).trim()),
      hasGrok: Boolean(r?.grok_ct && String(r.grok_ct).trim()),
      hasOpenAi: Boolean(r?.openai_ct && String(r.openai_ct).trim()),
      hasGrokBaseUrl: Boolean(r?.grokBaseUrl && String(r.grokBaseUrl).trim()),
    },
    apiEnabled: {
      gemini: apiFlagOn(r.gemini_api_enabled),
      grok: apiFlagOn(r.grok_api_enabled),
      openAi: apiFlagOn(r.openai_api_enabled),
    },
  }));
}

export function getChromePortableProfileKeyStatus(userId, slug) {
  if (!userId || !slug) return { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
  const db = openDb();
  ensureTable(db);
  const r = db
    .prepare(
      `
      SELECT gemini_ct, grok_ct, grok_base_url, openai_ct,
             COALESCE(gemini_api_enabled, 1) AS gemini_api_enabled,
             COALESCE(grok_api_enabled, 1) AS grok_api_enabled,
             COALESCE(openai_api_enabled, 1) AS openai_api_enabled
      FROM chrome_portable_profiles WHERE user_id = ? AND slug = ?
    `,
    )
    .get(userId, slug);
  return {
    hasGemini: Boolean(r?.gemini_ct && String(r.gemini_ct).trim()),
    hasGrok: Boolean(r?.grok_ct && String(r.grok_ct).trim()),
    hasOpenAi: Boolean(r?.openai_ct && String(r.openai_ct).trim()),
    hasGrokBaseUrl: Boolean(r?.grok_base_url && String(r.grok_base_url).trim()),
    apiEnabled: {
      gemini: apiFlagOn(r?.gemini_api_enabled),
      grok: apiFlagOn(r?.grok_api_enabled),
      openAi: apiFlagOn(r?.openai_api_enabled),
    },
  };
}

/**
 * Cập nhật một phần key (các field không gửi giữ nguyên trong DB).
 * @param {string} userId
 * @param {string} slug
 * @param {{ geminiApiKey?: string, grokApiKey?: string, grokBaseUrl?: string, openAiApiKey?: string }} partial
 */
export function patchChromePortableProfileKeys(userId, slug, partial) {
  if (!userId) throw new Error('Thiếu userId.');
  if (!slug) throw new Error('Thiếu slug.');
  if (!partial || typeof partial !== 'object') throw new Error('Thiếu dữ liệu patch.');
  const cur = getDecryptedChromePortableProfileKeys(userId, slug);
  const next = {
    geminiApiKey: Object.prototype.hasOwnProperty.call(partial, 'geminiApiKey')
      ? String(partial.geminiApiKey ?? '').trim()
      : cur.geminiApiKey,
    grokApiKey: Object.prototype.hasOwnProperty.call(partial, 'grokApiKey')
      ? String(partial.grokApiKey ?? '').trim()
      : cur.grokApiKey,
    grokBaseUrl: Object.prototype.hasOwnProperty.call(partial, 'grokBaseUrl')
      ? String(partial.grokBaseUrl ?? '').trim()
      : cur.grokBaseUrl,
    openAiApiKey: Object.prototype.hasOwnProperty.call(partial, 'openAiApiKey')
      ? String(partial.openAiApiKey ?? '').trim()
      : cur.openAiApiKey,
  };
  return setChromePortableProfileKeys(userId, slug, next);
}

export function setChromePortableProfileKeys(userId, slug, { geminiApiKey, grokApiKey, grokBaseUrl, openAiApiKey }) {
  if (!userId) throw new Error('Thiếu userId.');
  if (!slug) throw new Error('Thiếu slug.');
  const db = openDb();
  ensureTable(db);
  const geminiCt = encryptString(geminiApiKey);
  const grokCt = encryptString(grokApiKey);
  const openAiCt = encryptString(openAiApiKey);
  const baseUrl = String(grokBaseUrl || '').trim();
  db.prepare(
    `
      UPDATE chrome_portable_profiles
      SET gemini_ct = ?,
          grok_ct = ?,
          grok_base_url = ?,
          openai_ct = ?
      WHERE user_id = ? AND slug = ?
    `,
  ).run(geminiCt, grokCt, baseUrl || null, openAiCt, userId, slug);
  return getChromePortableProfileKeyStatus(userId, slug);
}

export function clearChromePortableProfileKeys(userId, slug) {
  if (!userId || !slug) return getChromePortableProfileKeyStatus(userId, slug);
  const db = openDb();
  ensureTable(db);
  db.prepare(
    `
      UPDATE chrome_portable_profiles
      SET gemini_ct = NULL, grok_ct = NULL, grok_base_url = NULL, openai_ct = NULL
      WHERE user_id = ? AND slug = ?
    `,
  ).run(userId, slug);
  return getChromePortableProfileKeyStatus(userId, slug);
}

export function chromePortableProfileExists(userId, slug) {
  if (!userId || !slug) return false;
  const db = openDb();
  ensureTable(db);
  const row = db.prepare('SELECT 1 AS ok FROM chrome_portable_profiles WHERE user_id = ? AND slug = ?').get(userId, slug);
  return Boolean(row?.ok);
}

export function getDecryptedChromePortableProfileKeys(userId, slug) {
  if (!userId || !slug) return { geminiApiKey: '', grokApiKey: '', grokBaseUrl: '', openAiApiKey: '' };
  const db = openDb();
  ensureTable(db);
  const r = db
    .prepare('SELECT gemini_ct, grok_ct, grok_base_url, openai_ct FROM chrome_portable_profiles WHERE user_id = ? AND slug = ?')
    .get(userId, slug);
  if (!r) return { geminiApiKey: '', grokApiKey: '', grokBaseUrl: '', openAiApiKey: '' };
  return {
    geminiApiKey: r.gemini_ct ? decryptString(r.gemini_ct) : '',
    grokApiKey: r.grok_ct ? decryptString(r.grok_ct) : '',
    grokBaseUrl: typeof r.grok_base_url === 'string' ? r.grok_base_url.trim() : '',
    openAiApiKey: r.openai_ct ? decryptString(r.openai_ct) : '',
  };
}

export function upsertChromePortableProfile(userId, { slug, displayName, proxyUrl, accountsText }) {
  if (!userId) throw new Error('Thiếu userId.');
  if (!slug) throw new Error('Thiếu slug.');
  const db = openDb();
  ensureTable(db);
  const now = new Date().toISOString();
  const nameOut = displayName || slug;
  const proxyOut = proxyUrl || null;

  // If accountsText is omitted, do not overwrite existing value.
  const hasAccounts = accountsText !== undefined;
  const accountsOut =
    accountsText === undefined ? undefined : String(accountsText || '').trim() ? String(accountsText) : null;

  if (hasAccounts) {
    db.prepare(
      `
        INSERT INTO chrome_portable_profiles (user_id, slug, display_name, proxy_url, accounts_text, created_at, last_opened_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, slug) DO UPDATE SET
          display_name = excluded.display_name,
          proxy_url = excluded.proxy_url,
          accounts_text = excluded.accounts_text
      `,
    ).run(userId, slug, nameOut, proxyOut, accountsOut, now, null);
  } else {
    db.prepare(
      `
        INSERT INTO chrome_portable_profiles (user_id, slug, display_name, proxy_url, created_at, last_opened_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, slug) DO UPDATE SET
          display_name = excluded.display_name,
          proxy_url = excluded.proxy_url
      `,
    ).run(userId, slug, nameOut, proxyOut, now, null);
  }
  return { ok: true };
}

export function touchChromePortableProfileOpened(userId, slug) {
  if (!userId || !slug) return { ok: true };
  const db = openDb();
  ensureTable(db);
  const now = new Date().toISOString();
  db.prepare(
    `
      UPDATE chrome_portable_profiles
      SET last_opened_at = ?
      WHERE user_id = ? AND slug = ?
    `,
  ).run(now, userId, slug);
  return { ok: true };
}

export function deleteChromePortableProfile(userId, slug) {
  if (!userId || !slug) return { ok: true };
  const db = openDb();
  ensureTable(db);
  db.prepare('DELETE FROM chrome_portable_profiles WHERE user_id = ? AND slug = ?').run(userId, slug);
  return { ok: true };
}

