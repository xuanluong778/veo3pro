import { ProxyAgent } from 'undici';
import { getChromeProfileApiRow } from './chromeProfilesService.js';

const cache = new Map();

export function normalizeProxyUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length > 300) throw new Error('Proxy URL quá dài.');
  // Allow shorthand formats users commonly paste:
  // - ip:port
  // - ip:port:user:pass
  // - user:pass@ip:port
  // (We convert to a proper http:// URL for undici + consistent storage.)
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    // ip:port:user:pass (password may contain ':', so capture rest)
    const m4 = s.match(/^([^:\s]+):(\d{2,5}):([^:\s]+):(.+)$/);
    if (m4) {
      const host = m4[1];
      const port = m4[2];
      const user = encodeURIComponent(m4[3]);
      const pass = encodeURIComponent(m4[4]);
      return normalizeProxyUrl(`http://${user}:${pass}@${host}:${port}`);
    }

    // ip:port
    const m2 = s.match(/^([^:\s]+):(\d{2,5})$/);
    if (m2) {
      return normalizeProxyUrl(`http://${m2[1]}:${m2[2]}`);
    }

    // user:pass@ip:port
    if (s.includes('@')) {
      return normalizeProxyUrl(`http://${s}`);
    }
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('Proxy URL không hợp lệ.');
  }
  const proto = String(u.protocol || '').toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') {
    throw new Error('Proxy chỉ hỗ trợ http/https.');
  }
  // Keep as-is (may include user:pass if user needs it).
  return u.toString();
}

export function getProxyDispatcher(proxyUrl) {
  const p = String(proxyUrl || '').trim();
  if (!p) return undefined;
  const norm = normalizeProxyUrl(p);
  if (cache.has(norm)) return cache.get(norm);
  const agent = new ProxyAgent(norm);
  cache.set(norm, agent);
  return agent;
}

export function getProxyUrlFromReq(req) {
  const hdr = req?.headers?.['x-user-proxy-url'];
  if (typeof hdr !== 'string') return '';
  const trimmed = hdr.trim();
  if (!trimmed) return '';
  return normalizeProxyUrl(trimmed);
}

/**
 * Proxy resolution order:
 * 1) Request header `x-user-proxy-url` (explicit override)
 * 2) Active Chrome portable profile proxy (by `x-veo3pro-profile-slug`)
 */
export function getEffectiveProxyUrlFromReq(req) {
  const fromHeader = getProxyUrlFromReq(req);
  if (fromHeader) return fromHeader;

  const uid = req?.user?.id;
  if (!uid) return '';
  const slug =
    typeof req?.headers?.['x-veo3pro-profile-slug'] === 'string' ? req.headers['x-veo3pro-profile-slug'].trim() : '';
  if (!slug) return '';

  try {
    const row = getChromeProfileApiRow(uid, slug);
    const p = String(row?.proxyUrl || '').trim();
    return p ? normalizeProxyUrl(p) : '';
  } catch {
    return '';
  }
}

