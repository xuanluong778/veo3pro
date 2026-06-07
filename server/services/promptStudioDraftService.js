import { openDb } from './userStore.js';

const MAX_DRAFT_CHARS = 2_000_000; // ~2MB JSON (enough for big prompts)

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_studio_drafts (
      user_id TEXT PRIMARY KEY,
      draft_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

/**
 * @param {string} userId
 * @returns {{ draft: any, updatedAt: string } | null}
 */
export function getPromptStudioDraft(userId) {
  if (!userId) return null;
  const db = openDb();
  ensureTable(db);
  const row = db.prepare('SELECT draft_json, updated_at FROM prompt_studio_drafts WHERE user_id = ?').get(userId);
  if (!row?.draft_json) return null;
  try {
    return { draft: JSON.parse(String(row.draft_json)), updatedAt: String(row.updated_at || '') };
  } catch {
    return null;
  }
}

/**
 * @param {string} userId
 * @param {any} draft
 * @returns {{ ok: true }}
 */
export function setPromptStudioDraft(userId, draft) {
  if (!userId) throw new Error('Thiếu userId.');
  const raw = JSON.stringify(draft ?? null);
  if (raw.length > MAX_DRAFT_CHARS) throw new Error('Draft quá lớn — hãy giảm số cảnh hoặc rút gọn prompt.');
  const db = openDb();
  ensureTable(db);
  const now = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO prompt_studio_drafts (user_id, draft_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET draft_json = excluded.draft_json, updated_at = excluded.updated_at
    `,
  ).run(userId, raw, now);
  return { ok: true };
}

/**
 * @param {string} userId
 * @returns {{ ok: true }}
 */
export function clearPromptStudioDraft(userId) {
  if (!userId) return { ok: true };
  const db = openDb();
  ensureTable(db);
  db.prepare('DELETE FROM prompt_studio_drafts WHERE user_id = ?').run(userId);
  return { ok: true };
}

