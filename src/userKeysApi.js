const API = '/api/user-keys';
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

export async function fetchUserKeyStatus() {
  const r = await fetch(`${API}/status`, { ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không đọc được trạng thái key.');
  return data.status || { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
}

export async function saveUserKeys(payload) {
  const r = await fetch(`${API}/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify(payload || {}),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không lưu được key.');
  return data.status || { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
}

export async function clearUserKeys() {
  const r = await fetch(`${API}/clear`, { method: 'POST', ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không xoá được key.');
  return data.status || { hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false };
}

/** Plaintext chỉ chủ JWT thấy. */
export async function fetchUserKeysReveal() {
  const r = await fetch(`${API}/reveal`, { ...cred });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không đọc được key đã lưu.');
  const keys = data.keys || {
    geminiApiKey: '',
    grokApiKey: '',
    grokBaseUrl: '',
    openAiApiKey: '',
  };
  const apiEnabled = data.apiEnabled || { gemini: true, grok: true, openAi: true };
  return { ...keys, apiEnabled };
}

export async function saveUserApiKeyApiFlags(flags) {
  const r = await fetch(`${API}/api-flags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify({
      geminiEnabled: typeof flags?.geminiEnabled === 'boolean' ? flags.geminiEnabled : undefined,
      grokEnabled: typeof flags?.grokEnabled === 'boolean' ? flags.grokEnabled : undefined,
      openAiEnabled: typeof flags?.openAiEnabled === 'boolean' ? flags.openAiEnabled : undefined,
    }),
  });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Không cập nhật được bật/tắt API.');
  return data.apiEnabled || { gemini: true, grok: true, openAi: true };
}

