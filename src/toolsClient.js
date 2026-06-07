const API = '/api/tools';
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

export async function downloadChromePortableProfileBat(profileName) {
  const r = await fetch(`${API}/chrome-portable-profile-bat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ profileName }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || 'Không tạo được file .bat');
  }
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') || '';
  const m = cd.match(/filename="([^"]+)"/i);
  const filename = m?.[1] || 'Veo3Pro_ChromeProfile.bat';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function openChromePortableProfile(profileName, proxyUrl = '', accountsText = '') {
  const r = await fetch(`${API}/open-chrome-portable-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ profileName, proxyUrl, accountsText }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không mở được Chrome profile.');
  return data;
}

export async function fetchChromePortableProfiles() {
  const r = await fetch(`${API}/chrome-portable-profiles`, { ...cred });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không lấy được danh sách profile.');
  return Array.isArray(data.items) ? data.items : [];
}

export async function deleteChromePortableProfile(slug) {
  const r = await fetch(`${API}/chrome-portable-profiles/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ slug }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không xóa được profile.');
  return true;
}

export async function saveChromePortableProfile(profileName, proxyUrl = '', accountsText = '') {
  const r = await fetch(`${API}/chrome-portable-profiles/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ profileName, proxyUrl, accountsText }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không lưu được profile.');
  return data;
}

export async function proxyIpCheck(proxyUrl = '') {
  const r = await fetch(`${API}/proxy-ip-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ proxyUrl }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không test được proxy.');
  return data;
}

export async function fetchChromeProfileKeyStatus(slug) {
  const s = String(slug || '').trim();
  if (!s) throw new Error('Thiếu slug profile.');
  const r = await fetch(`${API}/chrome-portable-profiles/key-status?slug=${encodeURIComponent(s)}`, { ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không đọc được trạng thái key của profile.');
  return (
    data.status || {
      hasGemini: false,
      hasGrok: false,
      hasOpenAi: false,
      hasGrokBaseUrl: false,
      apiEnabled: { gemini: true, grok: true, openAi: true },
    }
  );
}

/** Chỉ gửi các field cần đổi (ví dụ xóa một key: `{ geminiApiKey: '' }`). */
export async function patchChromeProfileKeys({ slug, geminiApiKey, grokApiKey, grokBaseUrl, openAiApiKey }) {
  const s = String(slug || '').trim();
  if (!s) throw new Error('Thiếu slug profile.');
  const body = { slug: s };
  if (geminiApiKey !== undefined) body.geminiApiKey = geminiApiKey;
  if (grokApiKey !== undefined) body.grokApiKey = grokApiKey;
  if (grokBaseUrl !== undefined) body.grokBaseUrl = grokBaseUrl;
  if (openAiApiKey !== undefined) body.openAiApiKey = openAiApiKey;
  const r = await fetch(`${API}/chrome-portable-profiles/patch-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không cập nhật được key.');
  return (
    data.status || {
      hasGemini: false,
      hasGrok: false,
      hasOpenAi: false,
      hasGrokBaseUrl: false,
      apiEnabled: { gemini: true, grok: true, openAi: true },
    }
  );
}

export async function saveChromeProfileKeys({ slug, geminiApiKey, grokApiKey, grokBaseUrl, openAiApiKey }) {
  const s = String(slug || '').trim();
  if (!s) throw new Error('Thiếu slug profile.');
  const r = await fetch(`${API}/chrome-portable-profiles/set-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ slug: s, geminiApiKey, grokApiKey, grokBaseUrl, openAiApiKey }),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không lưu được key cho profile.');
  return data.status || { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
}

export async function clearChromeProfileKeys(slug) {
  const s = String(slug || '').trim();
  if (!s) throw new Error('Thiếu slug profile.');
  const r = await fetch(`${API}/chrome-portable-profiles/clear-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({ slug: s }),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không xoá được key của profile.');
  return data.status || { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
}

/** Plaintext chỉ chủ JWT thấy (server kiểm tra session). */
export async function fetchChromeProfileRevealKeys(slug) {
  const s = String(slug || '').trim();
  if (!s) throw new Error('Thiếu slug profile.');
  const r = await fetch(`${API}/chrome-portable-profiles/reveal-keys?slug=${encodeURIComponent(s)}`, { ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không đọc được key của profile.');
  const keys = data.keys || {
    geminiApiKey: '',
    grokApiKey: '',
    grokBaseUrl: '',
    openAiApiKey: '',
  };
  const apiEnabled = data.apiEnabled || { gemini: true, grok: true, openAi: true };
  return { ...keys, apiEnabled };
}

export async function saveChromeProfileApiFlags(slug, flags) {
  const s = String(slug || '').trim();
  if (!s) throw new Error('Thiếu slug profile.');
  const r = await fetch(`${API}/chrome-portable-profiles/api-flags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({
      slug: s,
      geminiEnabled: typeof flags?.geminiEnabled === 'boolean' ? flags.geminiEnabled : undefined,
      grokEnabled: typeof flags?.grokEnabled === 'boolean' ? flags.grokEnabled : undefined,
      openAiEnabled: typeof flags?.openAiEnabled === 'boolean' ? flags.openAiEnabled : undefined,
    }),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không cập nhật được bật/tắt API.');
  return data.status || { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
}

