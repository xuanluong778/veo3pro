import { buildUserKeyHeaders } from './userKeys.js';

const API = '/api/video-analysis';

const cred = { credentials: 'include' };

async function readJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

export async function analyzeVideoByUrl(url, notes = '') {
  const r = await fetch(`${API}/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify({ url, notes }),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Phân tích URL thất bại.');
  return data.result;
}

export async function analyzeVideoUpload(file, notes = '') {
  const fd = new FormData();
  fd.append('video', file);
  if (notes) fd.append('notes', notes);
  const r = await fetch(`${API}/upload`, {
    method: 'POST',
    headers: { ...buildUserKeyHeaders() },
    ...cred,
    body: fd,
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Upload / phân tích thất bại.');
  return data.result;
}
