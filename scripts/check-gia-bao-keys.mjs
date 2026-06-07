import Database from 'better-sqlite3';

const db = new Database('./data/veo3pro.sqlite');

const q = process.argv.slice(2).join(' ').trim();
const query = q || 'gia bao';
const like = `%${query.toLowerCase().replace(/\s+/g, '%')}%`;

const users = q === '*'
  ? db
      .prepare(
        `
        SELECT id, email, display_name
        FROM users
        ORDER BY created_at DESC
        LIMIT 20
      `,
      )
      .all()
  : db
      .prepare(
        `
        SELECT id, email, display_name
        FROM users
        WHERE lower(coalesce(display_name, '')) LIKE ?
           OR lower(coalesce(email, '')) LIKE ?
        ORDER BY created_at DESC
        LIMIT 10
      `,
      )
      .all(like, like);

console.log(JSON.stringify({ query: q || query, users }, null, 2));

if (!users[0]) process.exit(0);

const uid = users[0].id;
const r = db
  .prepare('SELECT gemini_ct, grok_ct, grok_base_url, openai_ct, updated_at FROM user_api_keys WHERE user_id = ?')
  .get(uid);

const status = r
  ? {
      hasGemini: Boolean(r.gemini_ct && String(r.gemini_ct).trim()),
      hasGrok: Boolean(r.grok_ct && String(r.grok_ct).trim()),
      hasOpenAi: Boolean(r.openai_ct && String(r.openai_ct).trim()),
      hasGrokBaseUrl: Boolean(r.grok_base_url && String(r.grok_base_url).trim()),
      updatedAt: r.updated_at || null,
    }
  : null;

console.log(JSON.stringify({ userId: uid, status }, null, 2));

