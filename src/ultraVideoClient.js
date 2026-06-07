const API = '/api/video';
const cred = { credentials: 'include' };

async function readJsonSafe(r) {
  const raw = await r.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

export async function ultraCreateVideo(prompt) {
  const r = await fetch(`${API}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ prompt }),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Tạo video Ultra thất bại.');
  return data;
}

export async function ultraGetJob(jobId) {
  const r = await fetch(`${API}/job/${encodeURIComponent(jobId)}`, { ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không lấy được trạng thái job.');
  return data.job;
}

export async function ultraDownloadJobBlob(jobId, options = {}) {
  const signal = options?.signal;
  const r = await fetch(`${API}/job/${encodeURIComponent(jobId)}/download`, { ...cred, signal });
  if (!r.ok) {
    const data = await readJsonSafe(r);
    throw new Error(data.error || 'Tải file Ultra thất bại.');
  }
  return r.blob();
}

