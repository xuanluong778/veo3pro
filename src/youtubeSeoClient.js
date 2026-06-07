import { buildUserKeyHeaders } from './userKeys.js';

const API = '/api/youtube-seo';

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

/** Bước 1: chỉ danh sách tiêu đề */
export async function generateYoutubeSeoTitles(body) {
  const r = await fetch(`${API}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Sinh tiêu đề thất bại.');
  return data.data;
}

/**
 * Bước 2: mô tả, tag, comment, slug (cần selectedTitle trong body)
 * @returns {Promise<{ description: string, tags: string[], comment: string, filename: string }>}
 */
export async function generateYoutubeSeoRest(body) {
  const r = await fetch(`${API}/generate-rest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Tạo mô tả / nội dung thất bại.');
  return data.data;
}

export async function regenerateYoutubeSeoSection(body) {
  const r = await fetch(`${API}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Regenerate thất bại.');
  return data.data;
}

export async function generateYoutubeThumbnailPrompt(body) {
  const r = await fetch(`${API}/thumbnail-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Sinh prompt ảnh thất bại.');
  return data.imagePrompt;
}

export async function generateYoutubeLogoPrompt(body) {
  const r = await fetch(`${API}/logo-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Sinh prompt logo thất bại.');
  return data.imagePrompt;
}

/**
 * @param {object} fields
 * @param {File[]|File|null} referenceFiles tối đa 2 file
 */
export async function generateYoutubeThumbnail(fields, referenceFiles) {
  const fd = new FormData();
  fd.append('keyword', fields.keyword || '');
  fd.append('topic', fields.topic || '');
  fd.append('language', fields.language || 'en');
  if (fields.ideaPrompt) fd.append('ideaPrompt', fields.ideaPrompt);
  if (fields.overlayText) fd.append('overlayText', fields.overlayText);
  fd.append('thumbnailPrompt', fields.thumbnailPrompt || '');
  fd.append('style', fields.style || 'realistic');
  fd.append('aspectRatio', fields.aspectRatio || '16:9');
  if (fields.selectedTitle) fd.append('selectedTitle', fields.selectedTitle);
  const list = Array.isArray(referenceFiles) ? referenceFiles : referenceFiles ? [referenceFiles] : [];
  for (const f of list.slice(0, 2)) {
    if (f) fd.append('reference', f);
  }

  const r = await fetch(`${API}/thumbnail`, {
    method: 'POST',
    headers: { ...buildUserKeyHeaders() },
    ...cred,
    body: fd,
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Sinh thumbnail thất bại.');
  return {
    imageBase64: data.imageBase64,
    mimeType: data.mimeType || 'image/png',
    revisedPrompt: data.revisedPrompt,
  };
}

export async function generateYoutubeLogo(fields) {
  const r = await fetch(`${API}/logo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildUserKeyHeaders() },
    ...cred,
    body: JSON.stringify(fields),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Sinh logo thất bại.');
  return {
    imageBase64: data.imageBase64,
    mimeType: data.mimeType || 'image/png',
    revisedPrompt: data.revisedPrompt,
  };
}
