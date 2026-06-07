import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Share the same data dir as userStore (SQLite). */
const DATA_DIR = process.env.VEO3PRO_DATA_DIR
  ? path.resolve(process.env.VEO3PRO_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, (process.env.USER_DB_FILE || 'veo3pro.sqlite').replace(/^[/\\]+/, ''));

/** @type {import('better-sqlite3').Database | null} */
let dbSingleton = null;

function openDb() {
  if (dbSingleton) return dbSingleton;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      user_id TEXT PRIMARY KEY,
      gemini_ct TEXT,
      grok_ct TEXT,
      grok_base_url TEXT,
      openai_ct TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  // Migrate existing columns if table already existed.
  const cols = db.prepare('PRAGMA table_info(user_api_keys)').all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('grok_ct')) db.exec('ALTER TABLE user_api_keys ADD COLUMN grok_ct TEXT');
  if (!names.has('grok_base_url')) db.exec('ALTER TABLE user_api_keys ADD COLUMN grok_base_url TEXT');
  if (!names.has('openai_ct')) db.exec('ALTER TABLE user_api_keys ADD COLUMN openai_ct TEXT');
  if (!names.has('gemini_api_enabled')) db.exec('ALTER TABLE user_api_keys ADD COLUMN gemini_api_enabled INTEGER');
  if (!names.has('grok_api_enabled')) db.exec('ALTER TABLE user_api_keys ADD COLUMN grok_api_enabled INTEGER');
  if (!names.has('openai_api_enabled')) db.exec('ALTER TABLE user_api_keys ADD COLUMN openai_api_enabled INTEGER');
  // Legacy column: openai_base_url -> grok_base_url (best effort).
  if (names.has('openai_base_url')) {
    try {
      const any = db.prepare('SELECT 1 FROM user_api_keys WHERE openai_base_url IS NOT NULL AND TRIM(openai_base_url) != "" LIMIT 1').get();
      if (any) {
        db.exec('UPDATE user_api_keys SET grok_base_url = COALESCE(grok_base_url, openai_base_url) WHERE openai_base_url IS NOT NULL AND TRIM(openai_base_url) != ""');
      }
    } catch {
      /* ignore */
    }
  }
  dbSingleton = db;
  return db;
}

function getMasterKey() {
  const raw = String(process.env.USER_KEYS_MASTER_KEY || '').trim();
  if (!raw) {
    throw new Error('Thiếu USER_KEYS_MASTER_KEY trong .env (base64 32 bytes).');
  }
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('USER_KEYS_MASTER_KEY không hợp lệ (cần base64).');
  }
  if (buf.length !== 32) {
    throw new Error('USER_KEYS_MASTER_KEY phải là base64 của 32 bytes (AES-256).');
  }
  return buf;
}

export function encryptString(plain) {
  const text = String(plain || '');
  if (!text.trim()) return null;
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // payload: iv || tag || ct (base64)
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptString(payloadB64) {
  const raw = String(payloadB64 || '').trim();
  if (!raw) return '';
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < 12 + 16 + 1) return '';
  const key = getMasterKey();
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out.toString('utf8');
}

export function getUserApiKeyStatus(userId) {
  const db = openDb();
  const r = db.prepare('SELECT gemini_ct, grok_ct, grok_base_url, openai_ct FROM user_api_keys WHERE user_id = ?').get(userId);
  const hasGemini = Boolean(r?.gemini_ct && String(r.gemini_ct).trim());
  const hasGrok = Boolean(r?.grok_ct && String(r.grok_ct).trim());
  const hasOpenAi = Boolean(r?.openai_ct && String(r.openai_ct).trim());
  const hasGrokBaseUrl = Boolean(r?.grok_base_url && String(r.grok_base_url).trim());
  return { hasGemini, hasGrok, hasOpenAi, hasGrokBaseUrl };
}

export function setUserApiKeys(userId, { geminiApiKey, grokApiKey, grokBaseUrl, openAiApiKey }) {
  const db = openDb();
  const now = new Date().toISOString();
  const geminiCt = encryptString(geminiApiKey);
  const grokCt = encryptString(grokApiKey);
  const openAiCt = encryptString(openAiApiKey);
  const baseUrl = String(grokBaseUrl || '').trim();
  db.prepare(
    `
    INSERT INTO user_api_keys (user_id, gemini_ct, grok_ct, grok_base_url, openai_ct, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      gemini_ct = excluded.gemini_ct,
      grok_ct = excluded.grok_ct,
      grok_base_url = excluded.grok_base_url,
      openai_ct = excluded.openai_ct,
      updated_at = excluded.updated_at
  `,
  ).run(userId, geminiCt, grokCt, baseUrl || null, openAiCt, now);
  return getUserApiKeyStatus(userId);
}

export function clearUserApiKeys(userId) {
  const db = openDb();
  db.prepare('DELETE FROM user_api_keys WHERE user_id = ?').run(userId);
  return { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
}

export function getDecryptedUserKeys(userId) {
  const db = openDb();
  const r = db.prepare('SELECT gemini_ct, grok_ct, grok_base_url, openai_ct FROM user_api_keys WHERE user_id = ?').get(userId);
  if (!r) return { geminiApiKey: '', grokApiKey: '', grokBaseUrl: '', openAiApiKey: '' };
  return {
    geminiApiKey: r.gemini_ct ? decryptString(r.gemini_ct) : '',
    grokApiKey: r.grok_ct ? decryptString(r.grok_ct) : '',
    grokBaseUrl: typeof r.grok_base_url === 'string' ? r.grok_base_url.trim() : '',
    openAiApiKey: r.openai_ct ? decryptString(r.openai_ct) : '',
  };
}

/** Raw row for resolution (includes *_api_enabled). */
export function getUserApiKeysRawRow(userId) {
  if (!userId) return null;
  const db = openDb();
  return db
    .prepare(
      `
      SELECT gemini_ct, grok_ct, grok_base_url, openai_ct,
             COALESCE(gemini_api_enabled, 1) AS gemini_api_enabled,
             COALESCE(grok_api_enabled, 1) AS grok_api_enabled,
             COALESCE(openai_api_enabled, 1) AS openai_api_enabled
      FROM user_api_keys WHERE user_id = ?
    `,
    )
    .get(userId);
}

/**
 * @param {string} userId
 * @param {{ geminiEnabled?: boolean, grokEnabled?: boolean, openAiEnabled?: boolean }} flags
 */
export function setUserApiKeyApiFlags(userId, { geminiEnabled, grokEnabled, openAiEnabled }) {
  if (!userId) throw new Error('Thiếu userId.');
  const db = openDb();
  const row = db.prepare('SELECT user_id FROM user_api_keys WHERE user_id = ?').get(userId);
  if (!row) throw new Error('Chưa có key tài khoản — lưu key trước hoặc bỏ qua.');
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
  vals.push(userId);
  db.prepare(`UPDATE user_api_keys SET ${sets.join(', ')} WHERE user_id = ?`).run(...vals);
  return { ok: true };
}

