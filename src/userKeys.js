/**
 * IMPORTANT:
 * We no longer persist API keys in browser storage. Keys are stored per-user on the server (encrypted).
 * This file is kept for backward compatibility with older client code paths.
 */

export function buildUserKeyHeaders() {
  // Do not attach user keys from browser storage.
  // But we DO attach non-secret request context like proxy URL (user preference).
  /** @type {Record<string, string>} */
  const headers = {};
  try {
    const raw = localStorage.getItem('veo3pro_general_settings_v1');
    if (raw) {
      const j = JSON.parse(raw);
      const proxyUrl = typeof j?.proxyUrl === 'string' ? j.proxyUrl.trim() : '';
      if (proxyUrl) headers['x-user-proxy-url'] = proxyUrl;
    }
  } catch {
    /* ignore */
  }

  // Active Chrome portable profile slug (used to choose per-profile API keys on server).
  try {
    const slug = String(localStorage.getItem('veo3pro_active_api_profile_slug_v1') || '').trim();
    if (slug) headers['x-veo3pro-profile-slug'] = slug;
  } catch {
    /* ignore */
  }

  return headers;
}

