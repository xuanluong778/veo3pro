import { buildUserKeyHeaders } from './userKeys.js';
const API = '/api/vbee';

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

/** Trạng thái cấu hình (không lộ bí mật). */
export async function vbeeConfigStatus() {
  const r = await fetch(`${API}/config-status`, { headers: { ...buildUserKeyHeaders() }, ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không đọc được trạng thái Vbee.');
  return data;
}

/** Danh sách giọng hợp lệ từ Vbee API theo token hiện tại. */
export async function vbeeListVoices() {
  const r = await fetch(`${API}/voices`, { headers: { ...buildUserKeyHeaders() }, ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không lấy được danh sách giọng Vbee.');
  return data;
}

/**
 * Tạo TTS qua server (dùng VBEE_APP_ID / VBEE_TOKEN trong .env).
 * @param {object} body
 * @param {string} body.inputText
 * @param {string} body.voiceCode — ví dụ hn_female_ngochuyen_full_48k-fhg
 * @param {string} [body.callbackUrl] — nếu không set thì dùng VBEE_CALLBACK_URL
 * @param {boolean} [body.poll=false] — chờ và trả audio (poll GET /tts/:id)
 */
export async function vbeeTextToSpeech(body) {
  const r = await fetch(`${API}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Gọi Vbee TTS thất bại.');
  return data;
}

/**
 * TTS có cache theo voice_code + text.
 * Lần đầu: đợi Vbee xong, tải audio về server và trả localUrl.
 * Lần sau: trả localUrl ngay, rất nhanh.
 */
export async function vbeeTextToSpeechCached(body) {
  const r = await fetch(`${API}/tts-cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Gọi Vbee TTS (cache) thất bại.');
  return data;
}

/** Tạo/lấy audio nghe thử đã cache theo voice_code */
export async function vbeePreviewCache(body) {
  const r = await fetch(`${API}/preview-cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không tạo được cache preview audio.');
  return data;
}

/** GET trạng thái request sau khi đã có requestId */
export async function vbeeGetRequest(requestId) {
  const r = await fetch(`${API}/request/${encodeURIComponent(requestId)}`, { headers: { ...buildUserKeyHeaders() }, ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không lấy được trạng thái request.');
  return data;
}
