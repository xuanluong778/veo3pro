const API = '/api/video';
const cred = { credentials: 'include' };

export async function fetchVideoPrefs() {
  const r = await fetch(`${API}/prefs`, { ...cred });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không lấy được cấu hình video.');
  return data.prefs || { preferUltraProfile: false, preferredProfileSlug: '' };
}

export async function saveVideoPrefs(prefs) {
  const r = await fetch(`${API}/prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify(prefs || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Không lưu được cấu hình video.');
  return data.prefs || { preferUltraProfile: false, preferredProfileSlug: '' };
}

