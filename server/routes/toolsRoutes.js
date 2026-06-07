import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import {
  deleteChromePortableProfile,
  listChromePortableProfiles,
  clearChromePortableProfileKeys,
  getChromePortableProfileKeyStatus,
  setChromePortableProfileKeys,
  patchChromePortableProfileKeys,
  touchChromePortableProfileOpened,
  upsertChromePortableProfile,
  chromePortableProfileExists,
  getDecryptedChromePortableProfileKeys,
  setChromePortableProfileApiFlags,
} from '../services/chromeProfilesService.js';
import { getProxyDispatcher, normalizeProxyUrl } from '../services/proxyService.js';

function getLocalBypassHosts() {
  const out = new Set([
    '<-loopback>',
    '<local>',
    'localhost',
    '127.0.0.1',
    '[::1]',
  ]);
  try {
    const nets = os.networkInterfaces?.() || {};
    for (const ifName of Object.keys(nets)) {
      const addrs = nets[ifName] || [];
      for (const a of addrs) {
        if (!a || a.internal) continue;
        if (a.family === 'IPv4' && typeof a.address === 'string' && a.address.includes('.')) {
          out.add(a.address);
        }
      }
    }
  } catch {
    // ignore
  }
  return Array.from(out);
}

function sanitizeProfileName(raw) {
  const base = String(raw || '').trim();
  if (!base) return '';
  // Windows-safe slug
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug;
}

function buildChromePortableBat(profileSlug) {
  // Create a separate user-data-dir so Chrome data is isolated.
  // Use a stable folder under user profile so it persists across runs.
  const dir = `%USERPROFILE%\\Veo3Pro-ChromeProfiles\\${profileSlug}`;
  return [
    '@echo off',
    'setlocal',
    '',
    `set "PROFILE_DIR=${dir}"`,
    'if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"',
    '',
    'REM Try common Chrome install paths, fallback to "chrome" on PATH',
    'set "CHROME_EXE="',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME_EXE=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined CHROME_EXE set "CHROME_EXE=chrome"',
    '',
    'start "" "%CHROME_EXE%" ^',
    '  --user-data-dir="%PROFILE_DIR%" ^',
    '  --no-first-run ^',
    '  --no-default-browser-check',
    '',
    'endlocal',
    '',
  ].join('\r\n');
}

function resolveChromeExe() {
  // Windows-only. Try common install paths; fallback to "chrome" on PATH.
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const p1 = path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const p2 = path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const p3 = path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe');
  if (fs.existsSync(p1)) return p1;
  if (fs.existsSync(p2)) return p2;
  if (fs.existsSync(p3)) return p3;
  return 'chrome';
}

function chromeFlag(name, value) {
  const v = String(value ?? '');
  if (!v) return String(name || '');
  // Chrome on Windows can be picky when the flag value (after '=') is quoted.
  // We normalize by quoting the whole --flag=value when needed.
  const needsQuotes = /[\s"]/g.test(v);
  if (!needsQuotes) return `${name}=${v}`;
  const escaped = v.replace(/"/g, '\\"');
  return `${name}="${escaped}"`;
}

function ensureProxyAuthExtension(profileSlug, proxyUrl) {
  const p = String(proxyUrl || '').trim();
  if (!p) return '';
  const u = new URL(p);
  const username = decodeURIComponent(String(u.username || ''));
  const password = decodeURIComponent(String(u.password || ''));
  if (!username || !password) return '';

  const host = String(u.hostname || '').trim();
  const port = Number(u.port || '');
  if (!host || !Number.isFinite(port) || port <= 0) return '';

  const scheme = String(u.protocol || '').toLowerCase() === 'https:' ? 'https' : 'http';

  const extDir = path.join(os.homedir(), 'Veo3Pro-ChromeProfiles', '_extensions', profileSlug, 'proxy-auth');
  fs.mkdirSync(extDir, { recursive: true });

  const manifest = {
    // MV3 is required on modern Chrome builds (MV2 often blocked).
    manifest_version: 3,
    name: 'Veo3Pro Proxy Auth',
    version: '1.0.0',
    permissions: ['proxy', 'storage', 'webRequest', 'webRequestAuthProvider'],
    host_permissions: ['<all_urls>'],
    background: { service_worker: 'background.js' },
    minimum_chrome_version: '108.0.0',
  };

  // Use <local> + explicit LAN IPs so the app at localhost/LAN keeps working.
  const bypassList = getLocalBypassHosts();

  const backgroundJs = `
var config = {
  mode: "fixed_servers",
  rules: {
    singleProxy: { scheme: ${JSON.stringify(scheme)}, host: ${JSON.stringify(host)}, port: ${JSON.stringify(port)} },
    bypassList: ${JSON.stringify(bypassList)}
  }
};

try {
  chrome.proxy.settings.set({ value: config, scope: "regular" }, function () {});
} catch (e) {}

chrome.webRequest.onAuthRequired.addListener(
  function (details, callback) {
    try {
      if (details && details.isProxy) {
        callback({ authCredentials: { username: ${JSON.stringify(username)}, password: ${JSON.stringify(password)} } });
        return;
      }
    } catch (e) {}
    callback();
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);
`.trimStart();

  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(extDir, 'background.js'), backgroundJs, 'utf8');

  return extDir;
}

async function openChromePortableProfile(profileSlug, proxyUrl = '') {
  if (process.platform !== 'win32') {
    const err = new Error('Tính năng này hiện chỉ hỗ trợ Windows.');
    err.code = 'PLATFORM_UNSUPPORTED';
    throw err;
  }
  const profileDir = path.join(os.homedir(), 'Veo3Pro-ChromeProfiles', profileSlug);
  fs.mkdirSync(profileDir, { recursive: true });
  const chromeExe = resolveChromeExe();
  // IMPORTANT: use spawn(chromeExe, args[]) directly.
  // Node's spawn handles spaces in args correctly; cmd/start quoting is fragile.
  const args = [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--new-window'];
  const p = String(proxyUrl || '').trim();
  let extDirUsed = '';
  let proxyMode = '';
  let bypassUsed = '';
  if (p) {
    const u = new URL(p);
    const hasAuth = Boolean(String(u.username || '').trim() && String(u.password || '').trim());

    // If proxy requires auth, DO NOT use --proxy-server (Chrome can't accept user/pass there).
    // We rely on the extension to set proxy + provide credentials, avoiding the auth popup.
    const extDir = hasAuth ? ensureProxyAuthExtension(profileSlug, p) : '';
    if (extDir) {
      extDirUsed = extDir;
      proxyMode = 'extension';
      args.push(`--disable-extensions-except=${extDir}`);
      args.push(`--load-extension=${extDir}`);
      // Also apply bypass list at Chromium level as a backup.
      const bypass = getLocalBypassHosts().join(';');
      if (bypass) {
        bypassUsed = bypass;
        args.push(`--proxy-bypass-list=${bypass}`);
      }
    } else {
      // No auth: simplest is command-line proxy.
      const hostPort = `${u.hostname}${u.port ? ':' + u.port : ''}`;
      if (hostPort && !hostPort.endsWith(':')) {
        proxyMode = 'cli';
        args.push(`--proxy-server=${hostPort}`);
        // Keep localhost/LAN reachable while proxying the rest (so the app can still call /api).
        const bypass = getLocalBypassHosts().join(';');
        if (bypass) {
          bypassUsed = bypass;
          args.push(`--proxy-bypass-list=${bypass}`);
        }
      }
    }
  }
  const child = spawn(chromeExe, args, { detached: true, stdio: 'ignore', windowsHide: true });

  // Don't report OK unless Chrome actually spawned.
  await new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, 400);
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(err);
    });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve();
    });
  });

  try {
    child.unref();
  } catch {
    // ignore
  }

  return { chromeExe, profileDir, extDirUsed, proxyMode, bypassUsed };
}

export function createToolsRouter() {
  const r = Router();

  // POST /api/tools/chrome-portable-profile-bat { profileName: string }
  r.post('/chrome-portable-profile-bat', (req, res) => {
    try {
      const profileName = typeof req.body?.profileName === 'string' ? req.body.profileName : '';
      const slug = sanitizeProfileName(profileName);
      if (!slug) return res.status(400).json({ error: 'Nhập tên profile.' });
      const bat = buildChromePortableBat(slug);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Veo3Pro_ChromeProfile_${slug}.bat"`);
      res.send(bat);
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không tạo được file mở Chrome profile.' });
    }
  });

  // POST /api/tools/open-chrome-portable-profile { profileName: string }
  // Opens Chrome on the SERVER machine (intended for local/Laragon usage).
  r.post('/open-chrome-portable-profile', async (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const profileName = typeof req.body?.profileName === 'string' ? req.body.profileName : '';
      const proxyUrlRaw = typeof req.body?.proxyUrl === 'string' ? req.body.proxyUrl : '';
      const accountsText = typeof req.body?.accountsText === 'string' ? req.body.accountsText : undefined;
      const slug = sanitizeProfileName(profileName);
      if (!slug) return res.status(400).json({ error: 'Nhập tên profile.' });
      const proxyUrl = proxyUrlRaw.trim() ? normalizeProxyUrl(proxyUrlRaw) : '';
      upsertChromePortableProfile(uid, {
        slug,
        displayName: String(profileName || '').trim() || slug,
        proxyUrl,
        accountsText,
      });
      const out = await openChromePortableProfile(slug, proxyUrl);
      touchChromePortableProfileOpened(uid, slug);
      res.json({
        ok: true,
        profileDir: out.profileDir,
        proxyMode: out.proxyMode || '',
        extDir: out.extDirUsed || '',
        bypass: out.bypassUsed || '',
      });
    } catch (e) {
      const msg =
        e?.code === 'ENOENT'
          ? 'Không tìm thấy Chrome. Hãy cài Google Chrome hoặc thêm chrome.exe vào PATH.'
          : e?.message || 'Không mở được Chrome profile.';
      res.status(500).json({ error: msg, code: e?.code || '' });
    }
  });

  // GET /api/tools/chrome-portable-profiles
  r.get('/chrome-portable-profiles', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const items = listChromePortableProfiles(uid);
      res.json({ ok: true, items });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không đọc được danh sách profile.' });
    }
  });

  // GET /api/tools/chrome-portable-profiles/reveal-keys?slug=...
  // Chỉ trả plaintext cho chủ profile (JWT). Không expose cho user khác.
  r.get('/chrome-portable-profiles/reveal-keys', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const slug = typeof req.query?.slug === 'string' ? req.query.slug.trim() : '';
      if (!slug) return res.status(400).json({ error: 'Thiếu slug.' });
      if (!chromePortableProfileExists(uid, slug)) {
        return res.status(404).json({ error: 'Không có Chrome profile này.' });
      }
      const keys = getDecryptedChromePortableProfileKeys(uid, slug);
      const st = getChromePortableProfileKeyStatus(uid, slug);
      res.json({
        ok: true,
        keys,
        apiEnabled: st.apiEnabled || { gemini: true, grok: true, openAi: true },
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không đọc được key của profile.' });
    }
  });

  // GET /api/tools/chrome-portable-profiles/key-status?slug=...
  r.get('/chrome-portable-profiles/key-status', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const slug = typeof req.query?.slug === 'string' ? req.query.slug.trim() : '';
      if (!slug) return res.status(400).json({ error: 'Thiếu slug.' });
      const status = getChromePortableProfileKeyStatus(uid, slug);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không đọc được trạng thái key của profile.' });
    }
  });

  // POST /api/tools/chrome-portable-profiles/patch-keys { slug, geminiApiKey?, ... } — chỉ cập nhật field có trong body.
  r.post('/chrome-portable-profiles/patch-keys', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
      if (!slug) return res.status(400).json({ error: 'Thiếu slug.' });
      const partial = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'geminiApiKey')) {
        partial.geminiApiKey = typeof req.body.geminiApiKey === 'string' ? req.body.geminiApiKey : '';
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'grokApiKey')) {
        partial.grokApiKey = typeof req.body.grokApiKey === 'string' ? req.body.grokApiKey : '';
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'grokBaseUrl')) {
        partial.grokBaseUrl = typeof req.body.grokBaseUrl === 'string' ? req.body.grokBaseUrl : '';
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'openAiApiKey')) {
        partial.openAiApiKey = typeof req.body.openAiApiKey === 'string' ? req.body.openAiApiKey : '';
      }
      if (!Object.keys(partial).length) return res.status(400).json({ error: 'Không có field nào để cập nhật.' });
      const status = patchChromePortableProfileKeys(uid, slug, partial);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Không cập nhật được key.' });
    }
  });

  // POST /api/tools/chrome-portable-profiles/set-keys { slug, geminiApiKey?, grokApiKey?, grokBaseUrl?, openAiApiKey? }
  r.post('/chrome-portable-profiles/set-keys', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
      if (!slug) return res.status(400).json({ error: 'Thiếu slug.' });
      const status = setChromePortableProfileKeys(uid, slug, {
        geminiApiKey: req.body?.geminiApiKey,
        grokApiKey: req.body?.grokApiKey,
        grokBaseUrl: req.body?.grokBaseUrl,
        openAiApiKey: req.body?.openAiApiKey,
      });
      res.json({ ok: true, status });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Không lưu được key cho profile.' });
    }
  });

  // POST /api/tools/chrome-portable-profiles/api-flags { slug, geminiEnabled?, grokEnabled?, openAiEnabled? }
  r.post('/chrome-portable-profiles/api-flags', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
      if (!slug) return res.status(400).json({ error: 'Thiếu slug.' });
      setChromePortableProfileApiFlags(uid, slug, {
        geminiEnabled: typeof req.body?.geminiEnabled === 'boolean' ? req.body.geminiEnabled : undefined,
        grokEnabled: typeof req.body?.grokEnabled === 'boolean' ? req.body.grokEnabled : undefined,
        openAiEnabled: typeof req.body?.openAiEnabled === 'boolean' ? req.body.openAiEnabled : undefined,
      });
      const status = getChromePortableProfileKeyStatus(uid, slug);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Không cập nhật được bật/tắt API.' });
    }
  });

  // POST /api/tools/chrome-portable-profiles/clear-keys { slug }
  r.post('/chrome-portable-profiles/clear-keys', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
      if (!slug) return res.status(400).json({ error: 'Thiếu slug.' });
      const status = clearChromePortableProfileKeys(uid, slug);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không xoá được key của profile.' });
    }
  });

  // POST /api/tools/chrome-portable-profiles/save { profileName: string, proxyUrl?: string }
  r.post('/chrome-portable-profiles/save', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const profileName = typeof req.body?.profileName === 'string' ? req.body.profileName : '';
      const proxyUrlRaw = typeof req.body?.proxyUrl === 'string' ? req.body.proxyUrl : '';
      const accountsText = typeof req.body?.accountsText === 'string' ? req.body.accountsText : '';
      const slug = sanitizeProfileName(profileName);
      if (!slug) return res.status(400).json({ error: 'Nhập tên profile.' });
      const proxyUrl = proxyUrlRaw.trim() ? normalizeProxyUrl(proxyUrlRaw) : '';
      upsertChromePortableProfile(uid, {
        slug,
        displayName: String(profileName || '').trim() || slug,
        proxyUrl,
        accountsText,
      });
      res.json({ ok: true, slug, displayName: String(profileName || '').trim() || slug, proxyUrl, accountsText });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Không lưu được profile.' });
    }
  });

  // POST /api/tools/chrome-portable-profiles/delete { slug: string }
  r.post('/chrome-portable-profiles/delete', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
      if (!slug) return res.status(400).json({ error: 'Thiếu slug.' });
      deleteChromePortableProfile(uid, slug);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không xóa được profile.' });
    }
  });

  // POST /api/tools/proxy-ip-check { proxyUrl?: string }
  // Returns outbound IP as seen through the proxy (server-side).
  r.post('/proxy-ip-check', async (req, res) => {
    try {
      const proxyUrlRaw = typeof req.body?.proxyUrl === 'string' ? req.body.proxyUrl : '';
      const proxyUrl = proxyUrlRaw.trim() ? normalizeProxyUrl(proxyUrlRaw) : '';
      const dispatcher = getProxyDispatcher(proxyUrl);
      const r2 = await fetch('https://api.ipify.org?format=json', dispatcher ? { dispatcher } : undefined);
      const data = await r2.json().catch(() => ({}));
      if (!r2.ok) return res.status(502).json({ error: `IP check HTTP ${r2.status}` });
      res.json({ ok: true, ip: String(data?.ip || '').trim(), proxyUrl: proxyUrl || '' });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Không test được proxy.' });
    }
  });

  return r;
}

