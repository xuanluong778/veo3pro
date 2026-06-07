const API = '/api/prompt-studio-draft';
const cred = { credentials: 'include' };

async function readJsonSafe(r) {
  const t = await r.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return { error: t };
  }
}

export async function fetchPromptStudioDraft() {
  const r = await fetch(`${API}`, { method: 'GET', ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không thể đọc draft.');
  return data.draft || null;
}

export async function savePromptStudioDraft(draft) {
  const r = await fetch(`${API}/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ draft }),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không thể lưu draft.');
  return true;
}

export async function clearPromptStudioDraft() {
  const r = await fetch(`${API}/clear`, { method: 'POST', ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không thể xóa draft.');
  return true;
}

