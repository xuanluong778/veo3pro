import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { chromium } from 'playwright';
import { appendPhotorealLiveActionWhenImplied, appendUltraGeminiWebVideoHint } from './veoService.js';

function safeSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function bufLooksLikeMp4(buf) {
  if (!buf || buf.length < 12) return false;
  const scan = buf.subarray(0, Math.min(buf.length, 65536));
  if (scan.includes(Buffer.from('ftyp'))) return true;
  const tag = buf.toString('ascii', 0, 4);
  return tag === 'moov' || tag === 'moof' || tag === 'styp';
}

function ultraVideoResponseLooksInteresting(url, contentType, contentLengthHeader) {
  const u = String(url || '').toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  const cl = Number(contentLengthHeader || 0) || 0;
  if (!u) return false;
  if (ct.includes('text/') || ct.includes('json') || ct.includes('javascript') || ct.includes('html')) return false;
  if (ct.startsWith('image/') || ct.startsWith('font/')) return false;
  if (u.includes('.m3u8') || u.includes('/manifest')) return false;
  if (ct.includes('video/')) return true;
  if (ct.includes('application/mp4')) return true;
  if (ct.includes('video/quicktime')) return true;
  if (u.includes('.mp4')) return true;
  if (u.includes('videoplayback')) return true;
  if (/googlevideo\.com|googleusercontent\.com|ggpht\.com|gstatic\.com|sandbox\.google\.com|googleapis\.com/i.test(u)) {
    if (ct.includes('video/') || ct.includes('application/mp4')) return true;
    if (ct.includes('octet-stream') && cl >= 25_000) return true;
    if (cl >= 80_000) return true;
  }
  if (/videogeneration|generated.*video|\/veo|veo3|video\/v\d|media\.google|labs\.google|generativelanguage/i.test(u))
    return true;
  return false;
}

/**
 * Bắt mọi response video/mp4 (hoặc octet-stream có nội dung giống MP4) trong suốt phiên — tránh lỗi
 * chỉ dùng một lần waitForResponse (Gemini đôi khi tải qua nhiều URL / không có .mp4 trong path).
 * @param {import('playwright').BrowserContext} context
 */
function attachUltraMp4ResponseSniffer(context, downloadsPath) {
  const minBytes = Math.max(
    3_000,
    Number.parseInt(String(process.env.ULTRA_MIN_VIDEO_BYTES || '8000'), 10) || 8_000,
  );
  let bestSize = 0;
  /** @type {string | null} */
  let bestPath = null;
  let chain = Promise.resolve();

  /** @param {import('playwright').Response} response */
  const onResponse = (response) => {
    chain = chain.then(async () => {
      try {
        if (!response.ok()) return;
        const url = response.url();
        const h = response.headers();
        const ct = h['content-type'] || '';
        if (!ultraVideoResponseLooksInteresting(url, ct, h['content-length'])) return;
        await response.finished().catch(() => {});
        let buf;
        try {
          buf = Buffer.from(await response.body());
        } catch {
          const rUrl = response.url();
          if (!/^https?:\/\//i.test(rUrl)) return;
          try {
            const r2 = await context.request.get(rUrl, {
              timeout: 240_000,
              failOnStatusCode: false,
              headers: { accept: 'video/mp4,video/*,*/*' },
            });
            if (!r2.ok()) return;
            buf = Buffer.from(await r2.body());
          } catch {
            return;
          }
        }
        if (buf.length < minBytes) return;
        const ctl = ct.toLowerCase();
        const trustCt =
          ctl.includes('video/mp4') || ctl.includes('application/mp4') || ctl.includes('video/quicktime');
        if (!bufLooksLikeMp4(buf) && !trustCt) return;
        if (buf.length <= bestSize) return;
        if (bestPath) {
          try {
            fs.unlinkSync(bestPath);
          } catch {
            /* ignore */
          }
        }
        bestSize = buf.length;
        bestPath = path.join(downloadsPath, `ultra-veo-net-${Date.now()}.mp4`);
        fs.writeFileSync(bestPath, buf);
      } catch {
        /* ignore */
      }
    });
  };

  context.on('response', onResponse);
  return {
    getCapturedPath: () => bestPath,
    flush: async () => {
      await chain.catch(() => {});
    },
    dispose: () => context.off('response', onResponse),
  };
}

/**
 * @param {import('playwright').Page} page
 */
async function saveFromVideoElementAnyFrame(page, downloadsPath) {
  /** @type {{ frame: import('playwright').Frame, handle: import('playwright').Locator, area: number, src: string }[]} */
  const picks = [];
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
  for (const frame of frames) {
    const n = await frame.locator('video').count().catch(() => 0);
    for (let idx = n - 1; idx >= 0; idx--) {
      const handle = frame.locator('video').nth(idx);
      // eslint-disable-next-line no-await-in-loop
      const vis = await handle.isVisible().catch(() => false);
      if (!vis) continue;
      // eslint-disable-next-line no-await-in-loop
      const meta = await handle
        .evaluate((el) => ({
          w: el.videoWidth,
          h: el.videoHeight,
          rs: el.readyState,
          src: el.currentSrc || el.src || '',
        }))
        .catch(() => null);
      if (!meta || meta.rs < 2) continue;
      if (meta.w < 8 && meta.h < 8) continue;
      picks.push({ frame, handle, area: meta.w * meta.h, src: meta.src });
    }
  }
  picks.sort((a, b) => b.area - a.area);
  const minBytes = Math.max(
    3_000,
    Number.parseInt(String(process.env.ULTRA_MIN_VIDEO_BYTES || '8000'), 10) || 8_000,
  );

  for (const pick of picks.slice(0, 5)) {
    const { frame, handle, src } = pick;
    if (src && /^https?:\/\//i.test(src)) {
      try {
        const req = frame.page().request;
        const r = await req.get(src);
        if (!r.ok()) continue;
        const buf = Buffer.from(await r.body());
        if (buf.length < minBytes) continue;
        const saveTo = path.join(downloadsPath, `ultra-veo-${Date.now()}.mp4`);
        fs.writeFileSync(saveTo, buf);
        return saveTo;
      } catch {
        /* next */
      }
    }
    if (src && src.startsWith('blob:')) {
      try {
        const bytes = await handle.evaluate(async (el) => {
          const s = el.currentSrc || el.src || '';
          if (!s.startsWith('blob:')) return null;
          const resp = await fetch(s);
          const ab = await resp.arrayBuffer();
          return Array.from(new Uint8Array(ab));
        });
        if (!bytes || bytes.length < minBytes) continue;
        const saveTo = path.join(downloadsPath, `ultra-veo-${Date.now()}.mp4`);
        fs.writeFileSync(saveTo, Buffer.from(bytes));
        return saveTo;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

/**
 * Chrome để lại Singleton* sau crash — file tồn tại nhưng không còn process → Playwright báo
 * "Target page, context or browser has been closed". Xóa best-effort (nếu profile đang mở thật
 * thì unlink thường thất bại, không sao).
 */
function bestEffortRemoveProfileSingletonLocks(userDataDir) {
  for (const n of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const p = path.join(userDataDir, n);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* đang giữ bởi Chrome hoặc quyền */
    }
  }
}

function buildUltraChromeArgs({ headless }) {
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--window-size=1400,900',
    // Giảm tỷ lệ Google / trang phát hiện automation và đóng sớm (headless).
    '--disable-blink-features=AutomationControlled',
  ];
  if (!headless) {
    args.push('--new-window', '--start-maximized');
  }
  const extra = String(process.env.ULTRA_CHROME_EXTRA_ARGS || '').trim();
  if (extra) {
    for (const seg of extra.split('|').map((s) => s.trim()).filter(Boolean)) {
      args.push(seg);
    }
  }
  const forceNoSandbox = process.env.ULTRA_NO_SANDBOX === '1';
  const winRelax =
    process.platform === 'win32' &&
    process.env.ULTRA_STRICT_SANDBOX !== '1' &&
    process.env.ULTRA_DISABLE_WIN_SANDBOX_RELAX !== '1';
  if (forceNoSandbox || winRelax) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return args;
}

async function stabilizePersistentContext(ctx) {
  await new Promise((r) => setTimeout(r, 400));
  const browser = ctx.browser();
  if (!browser || !browser.isConnected()) {
    await ctx.close().catch(() => {});
    const e = new Error(
      'Trình duyệt thoát ngay sau khi khởi chạy (thường do khóa profile cũ, EDR/antivirus, hoặc policy Chrome).',
    );
    // @ts-ignore
    e.code = 'ULTRA_BROWSER_CLOSED_IMMEDIATE';
    throw e;
  }
  let pages = ctx.pages();
  if (!pages.length) {
    await ctx.newPage();
    pages = ctx.pages();
  }
  const p0 = pages[0];
  if (!p0) {
    await ctx.close().catch(() => {});
    const e = new Error('Không có tab khởi đầu trong profile Chrome.');
    // @ts-ignore
    e.code = 'ULTRA_NO_START_PAGE';
    throw e;
  }
  await p0.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  if (!browser.isConnected()) {
    await ctx.close().catch(() => {});
    const e = new Error('Trình duyệt ngắt kết nối trong lúc khởi tạo tab.');
    // @ts-ignore
    e.code = 'ULTRA_BROWSER_CLOSED_IMMEDIATE';
    throw e;
  }
}

function resolveChromeExe() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const p1 = path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const p2 = path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const p3 = path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe');
  if (fs.existsSync(p1)) return p1;
  if (fs.existsSync(p2)) return p2;
  if (fs.existsSync(p3)) return p3;
  return '';
}

export function createUltraJobStore() {
  /** @type {Map<string, any>} */
  const jobs = new Map();

  return {
    create(job) {
      const id = crypto.randomUUID();
      jobs.set(id, { id, status: 'queued', createdAt: Date.now(), ...job });
      return jobs.get(id);
    },
    get(id) {
      return jobs.get(id) || null;
    },
    update(id, patch) {
      const cur = jobs.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      jobs.set(id, next);
      return next;
    },
  };
}

/**
 * Best-effort automation for Gemini web (Veo).
 * - Requires: user already logged into Gemini + Veo enabled inside the portable profile.
 * - Returns: downloaded mp4 file path if a download is triggered.
 */
function resolveUltraAutomationTimeoutMs(override) {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 120_000) return override;
  const fromEnv = Number.parseInt(String(process.env.ULTRA_VEO_AUTOMATION_TIMEOUT_MS || '').trim(), 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 120_000) return fromEnv;
  return 60 * 60 * 1000;
}

export async function runUltraVeoAutomation({
  userId,
  profileSlug,
  prompt,
  outDir,
  headless = false,
  timeoutMs: timeoutMsArg,
}) {
  const timeoutMs = resolveUltraAutomationTimeoutMs(timeoutMsArg);
  const chromeExe = resolveChromeExe();
  if (!chromeExe) {
    const err = new Error('Không tìm thấy Google Chrome (chrome.exe).');
    // @ts-ignore
    err.code = 'CHROME_NOT_FOUND';
    throw err;
  }

  const slug = safeSlug(profileSlug);
  if (!slug) throw new Error('Thiếu profileSlug.');
  const userDataDir = path.join(os.homedir(), 'Veo3Pro-ChromeProfiles', slug);
  ensureDir(userDataDir);

  const downloadsPath = ensureDir(path.join(outDir, safeSlug(userId), slug));
  const debugPath = ensureDir(path.join(downloadsPath, '_debug'));

  // Dọn khóa Singleton để tránh crash trước đó khiến Playwright báo "browser has been closed".
  bestEffortRemoveProfileSingletonLocks(userDataDir);

  async function launchCtx(variant) {
    const commonArgs = buildUltraChromeArgs({ headless: variant.headless });
    const base = {
      headless: variant.headless,
      acceptDownloads: true,
      downloadsPath,
      args: commonArgs,
      timeout: 120_000,
    };

    if (variant.mode === 'channel_chrome') {
      return chromium.launchPersistentContext(userDataDir, { ...base, channel: 'chrome' });
    }
    if (variant.mode === 'system_exe') {
      return chromium.launchPersistentContext(userDataDir, { ...base, executablePath: chromeExe });
    }
    return chromium.launchPersistentContext(userDataDir, base);
  }

  async function tryLaunchVariants() {
    const isWin = process.platform === 'win32';
    const headlessVariants = isWin
      ? [
          // Windows headless: chrome.exe tường minh thường ổn định hơn channel.
          { mode: 'system_exe', headless: true },
          { mode: 'channel_chrome', headless: true },
          { mode: 'bundled', headless: true },
        ]
      : [
          { mode: 'channel_chrome', headless: true },
          { mode: 'system_exe', headless: true },
          { mode: 'bundled', headless: true },
        ];

    const variants = headless
      ? headlessVariants
      : [
          { mode: 'channel_chrome', headless: false },
          { mode: 'system_exe', headless: false },
          { mode: 'channel_chrome', headless: true },
          { mode: 'system_exe', headless: true },
          { mode: 'bundled', headless: false },
          { mode: 'bundled', headless: true },
        ];

    let lastErr = null;
    for (const v of variants) {
      let ctxTry = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        ctxTry = await launchCtx(v);
        // eslint-disable-next-line no-await-in-loop
        await stabilizePersistentContext(ctxTry);
        return ctxTry;
      } catch (e) {
        lastErr = e;
        if (ctxTry) {
          // eslint-disable-next-line no-await-in-loop
          await ctxTry.close().catch(() => {});
        }
        const msg = String(e?.message || e || '');
        if (/Browser\.getWindowForTarget/i.test(msg) && /Browser window not found/i.test(msg)) {
          continue;
        }
        if (/has been closed|Target page, context or browser|Browser closed|disconnected during startup/i.test(msg)) {
          // eslint-disable-next-line no-await-in-loop
          bestEffortRemoveProfileSingletonLocks(userDataDir);
          continue;
        }
        if (/user data directory|profile|cannot create/i.test(msg)) break;
      }
    }
    throw lastErr || new Error('Không khởi chạy được Chrome/Chromium.');
  }

  let ctx;
  try {
    ctx = await tryLaunchVariants();
  } catch (e) {
    const msg = String(e?.message || e || '');
    const err = new Error(
      [
        'Không khởi chạy được Chrome/Chromium để chạy Ultra.',
        'Nguyên nhân thường gặp: file khóa profile (Singleton*) sau crash, antivirus/EDR, policy Chrome, hoặc GPU/driver.',
        `Chi tiết: ${msg.slice(0, 260)}`,
        'Đã thử: xóa khóa Singleton best-effort, ổn định sau launch; Windows mặc định thêm --no-sandbox (tắt: ULTRA_DISABLE_WIN_SANDBOX_RELAX=1).',
        'Thêm: ULTRA_NO_SANDBOX=1, ULTRA_CHROME_EXTRA_ARGS (phân tách bởi |), đóng chrome.exe, profile slug mới.',
      ].join(' '),
    );
    // @ts-ignore
    err.code = 'ULTRA_LAUNCH_FAILED';
    throw err;
  }

  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(30_000);

  async function writeDebugSnapshot(tag, err) {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const base = path.join(debugPath, `${ts}-${safeSlug(tag || 'ultra') || 'ultra'}`);
      await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
      const html = await page.content().catch(() => '');
      if (html) fs.writeFileSync(`${base}.html`, html, 'utf8');
      const meta = {
        url: page.url(),
        title: await page.title().catch(() => ''),
        error: err ? { message: err.message || String(err), code: err.code || '' } : null,
      };
      fs.writeFileSync(`${base}.json`, JSON.stringify(meta, null, 2), 'utf8');
      return { screenshot: `${base}.png`, html: `${base}.html`, meta: `${base}.json` };
    } catch {
      return null;
    }
  }

  try {
    await page.goto('https://gemini.google.com/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(1500);

    const composer = page.locator(
      [
        'textarea[aria-label*="rompt" i]',
        'textarea[placeholder*="rompt" i]',
        'textarea[placeholder*="Enter" i]',
        'textarea',
        'div[role="textbox"][contenteditable="true"]',
        'rich-textarea textarea',
      ].join(', '),
    );

    /** Chỉ báo chưa đăng nhập khi thật sự đang ở luồng đăng nhập Google (tránh false positive từ link "Sign in" trong footer). */
    async function isGoogleAccountSignInWall() {
      const url = page.url();
      if (!/accounts\.google\.com/i.test(url)) return false;
      const id = page.locator('input#identifierId, input[name="identifier"][type="email"], input[type="email"][autocomplete="username"]').first();
      const pass = page.locator('input[type="password"][name="Passwd"], input[name="password"]').first();
      if (await id.isVisible().catch(() => false)) return true;
      if (await pass.isVisible().catch(() => false)) return true;
      return /signin|ServiceLogin|InteractiveLogin/i.test(url);
    }

    const deadline = Date.now() + 55_000;
    let composerOk = false;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      if (await isGoogleAccountSignInWall()) {
        const err = new Error('Profile này chưa đăng nhập Gemini. Hãy đăng nhập Gmail Ultra trong profile trước.');
        // @ts-ignore
        err.code = 'ULTRA_NOT_LOGGED_IN';
        await writeDebugSnapshot('not-logged-in', err);
        throw err;
      }
      // eslint-disable-next-line no-await-in-loop
      if (await composer.first().isVisible().catch(() => false)) {
        composerOk = true;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(600);
    }

    if (!composerOk) {
      // Thử /app (một số phiên bản UI chỉ mở composer ổn định hơn sau redirect).
      // eslint-disable-next-line no-await-in-loop
      await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // eslint-disable-next-line no-await-in-loop
      if (await isGoogleAccountSignInWall()) {
        const err = new Error('Profile này chưa đăng nhập Gemini. Hãy đăng nhập Gmail Ultra trong profile trước.');
        // @ts-ignore
        err.code = 'ULTRA_NOT_LOGGED_IN';
        await writeDebugSnapshot('not-logged-in', err);
        throw err;
      }
      // eslint-disable-next-line no-await-in-loop
      await composer.first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});
      if (!(await composer.first().isVisible().catch(() => false))) {
        const err = new Error(
          'Không thấy ô nhập prompt trên Gemini (đã chờ). Nếu đã đăng nhập, thử mở profile bằng Chrome portable một lần rồi thử lại.',
        );
        // @ts-ignore
        err.code = 'ULTRA_COMPOSER_NOT_FOUND';
        await writeDebugSnapshot('composer-not-found', err);
        throw err;
      }
    }

    // Best-effort: bật chế độ video / Veo nếu có nút (UI thay đổi theo ngôn ngữ).
    const videoModeHints = page.locator(
      [
        'button:has-text("Video")',
        'a:has-text("Video")',
        '[role="tab"]:has-text("Video")',
        'button:has-text("Veo")',
        '[aria-label*="Video" i]',
        '[aria-label*="Veo" i]',
      ].join(', '),
    );
    const vm = videoModeHints.first();
    if (await vm.isVisible().catch(() => false)) {
      await vm.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }

    const extraVideoEntry = page.locator(
      [
        'button:has-text("Create video")',
        'button:has-text("Create a video")',
        'button:has-text("Tạo video")',
        '[role="menuitem"]:has-text("Video")',
        'a:has-text("Create video")',
      ].join(', '),
    );
    if (await extraVideoEntry.first().isVisible().catch(() => false)) {
      await extraVideoEntry.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(900);
    }

    /** @type {import('playwright').Download | null} */
    let download = null;

    const directDownloadBtn = page.locator(
      [
        'button:has-text("Download")',
        'button:has-text("Tải xuống")',
        'button:has-text("Tải về")',
        'a:has-text("Download")',
        'a:has-text("Tải xuống")',
        'a:has-text("Tải về")',
        'button[aria-label*="Download" i]',
        'button[aria-label*="Tải xuống" i]',
        'button[aria-label*="Tải về" i]',
        'div[role="button"][aria-label*="Download" i]',
        'div[role="button"][aria-label*="Tải xuống" i]',
        'div[role="button"][aria-label*="Tải về" i]',
        '[role="menuitem"]:has-text("Download")',
        '[role="menuitem"]:has-text("Tải")',
        'a[download]',
        '[data-testid*="download" i]',
        'mat-icon:has-text("download")',
        '[jsname][aria-label*="download" i]',
      ].join(', '),
    );

    async function tryClickDownloadViaMenu() {
      const more = page.locator(
        [
          'button[aria-label*="More" i]',
          'button[aria-label*="Thêm" i]',
          'button[aria-label*="Menu" i]',
          'button[aria-label*="Tùy chọn" i]',
          'button[aria-label*="Options" i]',
          'button:has-text("⋮")',
          'button[aria-label*="Open menu" i]',
        ].join(', '),
      );
      const n = await more.count().catch(() => 0);
      for (let k = 0; k < Math.min(n, 8); k++) {
        const i = n - 1 - k;
        const m = more.nth(i);
        // eslint-disable-next-line no-await-in-loop
        if (!(await m.isVisible().catch(() => false))) continue;
        // eslint-disable-next-line no-await-in-loop
        await m.click().catch(() => {});
        const menuDownload = page.locator(
          [
            'role=menuitem[name=/download/i]',
            'role=menuitem[name=/tải/i]',
            'text=/^Download$/i',
            'text=/Tải xuống/i',
            'text=/Tải về/i',
          ].join(', '),
        ).first();
        // eslint-disable-next-line no-await-in-loop
        if (await menuDownload.isVisible().catch(() => false)) {
          const [dl] = await Promise.all([
            page.waitForEvent('download', { timeout: 120_000 }),
            menuDownload.click().catch(() => {}),
          ]).catch(() => [null]);
          if (dl) return dl;
        }
        // eslint-disable-next-line no-await-in-loop
        await page.keyboard.press('Escape').catch(() => {});
      }
      return null;
    }

    const sniffer = attachUltraMp4ResponseSniffer(ctx, downloadsPath);
    try {
      const captureSince = Date.now() - 2000;
      const minBytesDisk = Math.max(
        3_000,
        Number.parseInt(String(process.env.ULTRA_MIN_VIDEO_BYTES || '8000'), 10) || 8_000,
      );

      async function tryPickStableDiskMp4() {
        if (!fs.existsSync(downloadsPath)) return null;
        /** @type {{ full: string, size: number, mtime: number }[]} */
        const candidates = [];
        for (const name of fs.readdirSync(downloadsPath)) {
          if (name === '_debug' || name.startsWith('.')) continue;
          if (/\.crdownload$/i.test(name)) continue;
          if (!/\.mp4$/i.test(name)) continue;
          const full = path.join(downloadsPath, name);
          let st;
          try {
            st = fs.statSync(full);
          } catch {
            continue;
          }
          if (st.mtimeMs < captureSince - 4000) continue;
          if (st.size < minBytes) continue;
          let head;
          try {
            const fd = fs.openSync(full, 'r');
            head = Buffer.alloc(65536);
            const nread = fs.readSync(fd, head, 0, 65536, 0);
            fs.closeSync(fd);
            head = head.subarray(0, nread);
          } catch {
            continue;
          }
          if (!bufLooksLikeMp4(head)) continue;
          candidates.push({ full, size: st.size, mtime: st.mtimeMs });
        }
        candidates.sort((a, b) => b.size - a.size);
        const top = candidates[0];
        if (!top) return null;
        const s1 = top.size;
        await new Promise((r) => setTimeout(r, 2200));
        let s2;
        try {
          s2 = fs.statSync(top.full).size;
        } catch {
          return null;
        }
        if (s1 === s2 && s2 >= minBytesDisk) return top.full;
        return null;
      }

      const box = composer.first();
      await box.click();
      const promptOut = appendUltraGeminiWebVideoHint(
        appendPhotorealLiveActionWhenImplied(String(prompt || '').trim()),
      );
      await box.fill(promptOut);
      await page.keyboard.press('Enter');

      const t0 = Date.now();

      while (Date.now() - t0 < timeoutMs) {
        const title = await page.title().catch(() => '');
        if (/empty object message received/i.test(title)) {
          const err = new Error(
            'Gemini báo lỗi giao diện (Empty Object). Mở gemini.google.com trong profile Ultra, tải lại trang (F5) hoặc đăng xuất/đăng nhập lại, rồi thử tạo video.',
          );
          // @ts-ignore
          err.code = 'ULTRA_GEMINI_EMPTY_OBJECT';
          await writeDebugSnapshot('gemini-empty-object', err);
          throw err;
        }

        for (const fr of page.frames()) {
          // eslint-disable-next-line no-await-in-loop
          await fr.locator('video').last().scrollIntoViewIfNeeded().catch(() => {});
        }

        // eslint-disable-next-line no-await-in-loop
        await sniffer.flush().catch(() => {});
        const sniffed = sniffer.getCapturedPath();
        if (sniffed && fs.existsSync(sniffed)) {
          return { filePath: sniffed, downloadsPath };
        }

        // eslint-disable-next-line no-await-in-loop
        const fromVideo = await saveFromVideoElementAnyFrame(page, downloadsPath);
        if (fromVideo && fs.existsSync(fromVideo)) {
          return { filePath: fromVideo, downloadsPath };
        }

        // eslint-disable-next-line no-await-in-loop
        const fromDisk = await tryPickStableDiskMp4();
        if (fromDisk && fs.existsSync(fromDisk)) {
          return { filePath: fromDisk, downloadsPath };
        }

        const genBtn = page.locator(
          [
            'button:has-text("Generate")',
            'button:has-text("Tạo")',
            'button:has-text("Generate video")',
            'button:has-text("Tạo video")',
            '[role="button"]:has-text("Generate")',
          ].join(', '),
        );
        const g0 = genBtn.first();
        if (await g0.isVisible().catch(() => false)) {
          await g0.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(800);
        }

        const n = await directDownloadBtn.count().catch(() => 0);
        for (let j = 0; j < Math.min(n, 20); j++) {
          const i = n - 1 - j;
          const btn = directDownloadBtn.nth(i);
          // eslint-disable-next-line no-await-in-loop
          if (await btn.isVisible().catch(() => false)) {
            const [dl] = await Promise.all([
              page.waitForEvent('download', { timeout: 120_000 }),
              btn.click({ timeout: 5000 }).catch(() => {}),
            ]).catch(() => [null]);
            if (dl) {
              download = dl;
              break;
            }
          }
        }
        if (download) break;

        const roleLocators = [
          page.getByRole('button', { name: /download|tải xuống|tải về|save video|export/i }),
          page.getByRole('menuitem', { name: /download|tải xuống|tải về/i }),
        ];
        for (const loc of roleLocators) {
          // eslint-disable-next-line no-await-in-loop
          const c = await loc.count().catch(() => 0);
          for (let j = 0; j < Math.min(c, 10); j++) {
            const btn = loc.nth(c - 1 - j);
            // eslint-disable-next-line no-await-in-loop
            if (!(await btn.isVisible().catch(() => false))) continue;
            const [dl] = await Promise.all([
              page.waitForEvent('download', { timeout: 120_000 }),
              btn.click({ timeout: 5000 }).catch(() => {}),
            ]).catch(() => [null]);
            if (dl) {
              download = dl;
              break;
            }
          }
          if (download) break;
        }
        if (download) break;

        // eslint-disable-next-line no-await-in-loop
        download = await tryClickDownloadViaMenu().catch(() => null);
        if (download) break;

        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(2500);
      }

      // eslint-disable-next-line no-await-in-loop
      await sniffer.flush().catch(() => {});
      const sniffedFinal = sniffer.getCapturedPath();
      if (sniffedFinal && fs.existsSync(sniffedFinal)) {
        return { filePath: sniffedFinal, downloadsPath };
      }

      const fromVideoFinal = await saveFromVideoElementAnyFrame(page, downloadsPath);
      if (fromVideoFinal && fs.existsSync(fromVideoFinal)) {
        return { filePath: fromVideoFinal, downloadsPath };
      }

      const fromDiskFinal = await tryPickStableDiskMp4();
      if (fromDiskFinal && fs.existsSync(fromDiskFinal)) {
        return { filePath: fromDiskFinal, downloadsPath };
      }

      if (!download) {
        const err = new Error(
          [
            'Không lấy được file video sau khi đã chờ (nút Download / thẻ video / tải mạng / file trong thư mục tải).',
            'Gợi ý: bật Veo trên tài khoản Gemini; prompt rõ «tạo video Veo»; mở Chrome Ultra và F5 nếu gặp Empty Object;',
            `tăng chờ: ULTRA_VEO_AUTOMATION_TIMEOUT_MS (mặc định ${Math.round(resolveUltraAutomationTimeoutMs() / 60000)} phút);`,
            'giảm ngưỡng byte: ULTRA_MIN_VIDEO_BYTES=4000 nếu clip rất ngắn.',
          ].join(' '),
        );
        // @ts-ignore
        err.code = 'ULTRA_DOWNLOAD_NOT_FOUND';
        await writeDebugSnapshot('download-not-found', err);
        throw err;
      }

      const suggested = download.suggestedFilename() || `ultra-veo-${Date.now()}.mp4`;
      const filename = suggested.toLowerCase().endsWith('.mp4') ? suggested : `${suggested}.mp4`;
      const saveTo = path.join(downloadsPath, filename);
      await download.saveAs(saveTo);

      return { filePath: saveTo, downloadsPath };
    } finally {
      await sniffer.flush().catch(() => {});
      sniffer.dispose();
    }
  } finally {
    // Keep the browser open only for the automation run; close to avoid leaking processes.
    await ctx.close().catch(() => {});
  }
}

