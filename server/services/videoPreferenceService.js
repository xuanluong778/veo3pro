import { openDb } from './userStore.js';

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_video_preferences (
      user_id TEXT PRIMARY KEY,
      prefer_ultra_profile INTEGER NOT NULL DEFAULT 0,
      preferred_profile_slug TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

export function getUserVideoPreferences(userId) {
  if (!userId) return { preferUltraProfile: false, preferredProfileSlug: '' };
  const db = openDb();
  ensureTable(db);
  const r = db
    .prepare(
      'SELECT prefer_ultra_profile as preferUltraProfile, preferred_profile_slug as preferredProfileSlug FROM user_video_preferences WHERE user_id = ?',
    )
    .get(userId);
  if (!r) return { preferUltraProfile: false, preferredProfileSlug: '' };
  return {
    preferUltraProfile: Boolean(r.preferUltraProfile),
    preferredProfileSlug: typeof r.preferredProfileSlug === 'string' ? r.preferredProfileSlug : '',
  };
}

export function setUserVideoPreferences(userId, { preferUltraProfile, preferredProfileSlug }) {
  if (!userId) throw new Error('Thiếu userId.');
  const db = openDb();
  ensureTable(db);
  const now = new Date().toISOString();
  const prefer = preferUltraProfile ? 1 : 0;
  const slug = String(preferredProfileSlug || '').trim() || null;
  db.prepare(
    `
      INSERT INTO user_video_preferences (user_id, prefer_ultra_profile, preferred_profile_slug, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        prefer_ultra_profile = excluded.prefer_ultra_profile,
        preferred_profile_slug = excluded.preferred_profile_slug,
        updated_at = excluded.updated_at
    `,
  ).run(userId, prefer, slug, now);
  return getUserVideoPreferences(userId);
}

