import { buildUserKeyHeaders } from './userKeys.js';

const API = '/api';
const cred = { credentials: 'include' };

export async function fetchCharacterRegistry() {
  const r = await fetch(`${API}/prompt/characters/registry`, { ...cred, headers: { ...buildUserKeyHeaders() } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không tải được danh sách nhân vật registry');
  return Array.isArray(data.entries) ? data.entries : [];
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ debug?: boolean }} [opts] When `opts.debug` or `body.debug`, calls `POST .../generate?debug=1` and server returns `debug` payload.
 */
export async function generatePromptStudio(body, opts = {}) {
  const debug = Boolean(opts.debug ?? body?.debug);
  const url = debug ? `${API}/prompt/generate?debug=1` : `${API}/prompt/generate`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không tạo được prompt');
  return data;
}

export async function generatePromptPillars(industry, quantity) {
  const r = await fetch(`${API}/prompt/pillars`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify({ industry, quantity }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không tạo được chủ đề lớn');
  return data.pillars || [];
}

export async function generatePromptTopics(pillar, quantity = 20) {
  const r = await fetch(`${API}/prompt/topics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify({ pillar, quantity }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không tạo được chủ đề video');
  return data.topics || [];
}

async function postSuggest(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử Gợi ý AI.');
    }
    throw new Error(data.error || `Không lấy được gợi ý AI (HTTP ${r.status})`);
  }
  return data.suggestions || [];
}

export function suggestPromptCharacters(body) {
  return postSuggest('/prompt/suggest/character', body);
}

export function suggestPromptContexts(body) {
  return postSuggest('/prompt/suggest/context', body);
}

/**
 * Sinh nhân vật (có tên) + bối cảnh + visual_style cho tab «Nhân vật & Bối cảnh» (Text → Video).
 * @param {{ storyPrompt: string, styleLabel?: string, language?: string }} body
 * @returns {Promise<{ items: Array<{ key: string, name: string, category: string, description: string }>, error?: string }>}
 */
export async function fetchTextVideoCast(body) {
  const r = await fetch(`${API}/prompt/text-video/cast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) {
      throw new Error('Phiên đăng nhập đã hết hạn. Đăng nhập lại để sinh nhân vật & bối cảnh.');
    }
    throw new Error(data.error || `Không sinh được cast (HTTP ${r.status})`);
  }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    error: typeof data.error === 'string' && data.error ? data.error : undefined,
  };
}

/**
 * Phân cảnh có cấu trúc @CHAR / #BACKGROUND (tab Phân cảnh).
 * @param {{ storyPrompt: string, styleLabel?: string, language?: string, sceneCount: number, castItems?: unknown[] }} body
 */
export async function fetchTextVideoStructuredScenes(body) {
  const r = await fetch(`${API}/prompt/text-video/scenes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) {
      throw new Error('Phiên đăng nhập đã hết hạn. Đăng nhập lại để sinh phân cảnh.');
    }
    throw new Error(data.error || `Không sinh được phân cảnh (HTTP ${r.status})`);
  }
  return {
    scenes: Array.isArray(data.scenes) ? data.scenes : [],
    error: typeof data.error === 'string' && data.error ? data.error : undefined,
  };
}
