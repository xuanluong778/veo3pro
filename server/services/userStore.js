import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Vercel / serverless: set `VEO3PRO_DATA_DIR=/tmp/veo3pro-data` (ephemeral). */
const DATA_DIR = process.env.VEO3PRO_DATA_DIR
  ? path.resolve(process.env.VEO3PRO_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, (process.env.USER_DB_FILE || 'veo3pro.sqlite').replace(/^[/\\]+/, ''));
const LEGACY_USERS_JSON = path.join(DATA_DIR, 'users.json');

/**
 * @typedef {{
 *   id: string,
 *   email: string,
 *   passwordHash: string | null,
 *   googleId?: string | null,
 *   plan: string,
 *   createdAt: string,
 *   displayName: string | null,
 *   phone: string | null,
 * }} UserRow
 */

let chain = Promise.resolve();

function runExclusive(fn) {
  const next = chain.then(() => fn());
  chain = next.catch(() => {});
  return next;
}

/** @type {import('better-sqlite3').Database | null} */
let dbSingleton = null;

/** @param {import('better-sqlite3').Database} db */
function migrateFromJsonIfNeeded(db) {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return;
  if (!fs.existsSync(LEGACY_USERS_JSON)) return;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(LEGACY_USERS_JSON, 'utf8'));
  } catch {
    return;
  }
  if (!Array.isArray(raw.users) || raw.users.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, google_id, plan, created_at)
    VALUES (@id, @email, @password_hash, @google_id, @plan, @created_at)
  `);
  const runTx = db.transaction((users) => {
    for (const u of users) {
      insert.run({
        id: u.id,
        email: String(u.email || '').toLowerCase().trim(),
        password_hash: u.passwordHash ?? null,
        google_id: u.googleId ?? null,
        plan: u.plan || 'free',
        created_at: u.createdAt || new Date().toISOString(),
      });
    }
  });
  runTx(raw.users);
  console.log('[userStore] Đã chuyển', raw.users.length, 'user từ users.json sang SQLite.');
}

/** @param {import('better-sqlite3').Database} db */
function migrateUserProfileColumns(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const names = new Set(cols.map((/** @type {{ name: string }} */ c) => c.name));
  if (!names.has('display_name')) {
    db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  }
  if (!names.has('phone')) {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }
  if (!names.has('contact_email')) {
    db.exec('ALTER TABLE users ADD COLUMN contact_email TEXT');
  }
  if (!names.has('avatar_url')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
  }
}

export function openDb() {
  if (dbSingleton) return dbSingleton;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
  `);
  migrateUserProfileColumns(db);
  migrateFromJsonIfNeeded(db);
  dbSingleton = db;
  return db;
}

/** @param {Record<string, unknown> | undefined} r */
function rowToUser(r) {
  if (!r) return null;
  return {
    id: /** @type {string} */ (r.id),
    email: String(r.email).toLowerCase().trim(),
    passwordHash: /** @type {string | null} */ (r.password_hash),
    googleId: /** @type {string | null | undefined} */ (r.google_id),
    plan: String(r.plan || 'free'),
    createdAt: String(r.created_at),
    displayName: r.display_name != null && String(r.display_name).trim() ? String(r.display_name).trim() : null,
    phone: r.phone != null && String(r.phone).trim() ? String(r.phone).trim() : null,
    contactEmail:
      r.contact_email != null && String(r.contact_email).trim() ? String(r.contact_email).trim() : null,
    avatarUrl: r.avatar_url != null && String(r.avatar_url).trim() ? String(r.avatar_url).trim() : null,
  };
}

export async function findUserByEmail(email) {
  const norm = email.toLowerCase().trim();
  const db = openDb();
  const r = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(norm);
  return rowToUser(r);
}

export async function findUserByGoogleId(googleId) {
  const db = openDb();
  const r = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
  return rowToUser(r);
}

export async function findUserById(id) {
  const db = openDb();
  const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return rowToUser(r);
}

export async function createUserRecord(input) {
  return runExclusive(async () => {
    const db = openDb();
    const email = input.email.toLowerCase().trim();
    const exists = db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (exists) {
      const err = new Error('Email already registered');
      err.code = 'EMAIL_TAKEN';
      throw err;
    }
    const user = {
      id: randomUUID(),
      email,
      passwordHash: input.passwordHash,
      googleId: null,
      plan: input.plan || 'free',
      createdAt: new Date().toISOString(),
      displayName: null,
      phone: null,
    };
    db.prepare(
      `INSERT INTO users (id, email, password_hash, google_id, plan, created_at, display_name, phone)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL)`,
    ).run(user.id, email, input.passwordHash, user.plan, user.createdAt);
    return user;
  });
}

export async function createOAuthUserRecord(input) {
  return runExclusive(async () => {
    const db = openDb();
    const email = input.email.toLowerCase().trim();
    const { googleId } = input;
    if (db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(email)) {
      const err = new Error('Email already registered');
      err.code = 'EMAIL_TAKEN';
      throw err;
    }
    if (db.prepare('SELECT 1 FROM users WHERE google_id = ?').get(googleId)) {
      const err = new Error('Google account already registered');
      err.code = 'GOOGLE_TAKEN';
      throw err;
    }
    const user = {
      id: randomUUID(),
      email,
      passwordHash: null,
      googleId,
      plan: 'free',
      createdAt: new Date().toISOString(),
      displayName: null,
      phone: null,
    };
    db.prepare(
      `INSERT INTO users (id, email, password_hash, google_id, plan, created_at, display_name, phone)
       VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL)`,
    ).run(user.id, email, googleId, user.plan, user.createdAt);
    return user;
  });
}

export async function linkGoogleToUser(userId, googleId) {
  return runExclusive(async () => {
    const db = openDb();
    const taken = db.prepare('SELECT id FROM users WHERE google_id = ? AND id != ?').get(googleId, userId);
    if (taken) {
      const err = new Error('This Google account is linked to another user');
      err.code = 'GOOGLE_LINK_TAKEN';
      throw err;
    }
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!u) {
      const err = new Error('User not found');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }
    db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, userId);
    u.google_id = googleId;
    return rowToUser(u);
  });
}

export async function updateUserPasswordHash(userId, passwordHash) {
  return runExclusive(async () => {
    const db = openDb();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    return findUserById(userId);
  });
}

/**
 * @param {string} userId
 * @param {{ displayName?: string | null; phone?: string | null; contactEmail?: string | null; avatarUrl?: string | null }} fields
 */
export async function updateUserProfileFields(userId, fields) {
  return runExclusive(async () => {
    const db = openDb();
    const sets = [];
    const vals = [];
    if (fields.displayName !== undefined) {
      sets.push('display_name = ?');
      const v = fields.displayName;
      vals.push(v === null || v === '' ? null : String(v).trim());
    }
    if (fields.phone !== undefined) {
      sets.push('phone = ?');
      const v = fields.phone;
      vals.push(v === null || v === '' ? null : String(v).trim());
    }
    if (fields.contactEmail !== undefined) {
      sets.push('contact_email = ?');
      const v = fields.contactEmail;
      vals.push(v === null || v === '' ? null : String(v).trim());
    }
    if (fields.avatarUrl !== undefined) {
      sets.push('avatar_url = ?');
      const v = fields.avatarUrl;
      vals.push(v === null || v === '' ? null : String(v).trim());
    }
    if (!sets.length) return findUserById(userId);
    vals.push(userId);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return findUserById(userId);
  });
}
