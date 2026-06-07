import { buildUserKeyHeaders } from './userKeys.js';

const API = '/api';

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

export async function checkHealth() {
  const r = await fetch(`${API}/health`, { ...cred, headers: { ...buildUserKeyHeaders() } });
  return readJsonSafe(r);
}

export async function startGeneration(body, options = {}) {
  const r = await fetch(`${API}/veo/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    signal: options.signal,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Lỗi khởi tạo');
  return {
    operationName: data.operationName,
    usedSource: data.usedSource || null,
    attemptTrace: Array.isArray(data.attemptTrace) ? data.attemptTrace : [],
    debug: data.debug || null,
  };
}

export async function pollOperation(operationName, options = {}) {
  const q = new URLSearchParams({ operation: operationName });
  const r = await fetch(`${API}/veo/status?${q}`, {
    ...cred,
    signal: options.signal,
    headers: { ...buildUserKeyHeaders() },
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Lỗi kiểm tra trạng thái');
  return data;
}

export function extractVideoUri(operationJson) {
  const gvr = operationJson?.response?.generateVideoResponse;
  const sample = gvr?.generatedSamples?.[0];
  return sample?.video?.uri ?? null;
}

export async function downloadVideoBlob(uri, options = {}) {
  const payload = { uri };
  if (typeof options.operation === 'string' && options.operation.trim()) {
    payload.operation = options.operation.trim();
  }
  const r = await fetch(`${API}/veo/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    signal: options.signal,
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || 'Tải video thất bại');
  }
  return r.blob();
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result;
      const base64 = String(s).replace(/^data:[^;]+;base64,/, '');
      resolve({ data: base64, mimeType: file.type || 'image/png' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
