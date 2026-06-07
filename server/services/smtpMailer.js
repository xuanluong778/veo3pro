import nodemailer from 'nodemailer';

/** @type {import('nodemailer').Transporter | null} */
let transporter = null;

/** Gmail app passwords are often copied with spaces — SMTP servers expect 16 chars without spaces. */
export function normalizeSmtpPass() {
  const p = process.env.SMTP_PASS;
  if (p === undefined || p === null) return '';
  return String(p).replace(/\s/g, '');
}

export function isSmtpConfigured() {
  if (process.env.SMTP_ENABLED === 'false') return false;
  const pass = normalizeSmtpPass();
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && pass.length > 0);
}

/**
 * Gmail rejects invalid From. If SMTP_FROM is only a display name, append SMTP_USER.
 * @returns {string}
 */
export function resolveMailFrom() {
  const user = process.env.SMTP_USER?.trim();
  if (!user) return '';
  const raw = process.env.SMTP_FROM?.trim();
  if (!raw) return user;
  if (raw.includes('@')) return raw;
  const safeName = raw.replace(/"/g, '').trim();
  return `"${safeName}" <${user}>`;
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function formatSmtpSendError(err) {
  const e = /** @type {{ code?: string, responseCode?: number }} */ (err || {});
  const code = e.code;
  const rc = e.responseCode;
  if (code === 'EAUTH' || rc === 535 || rc === 534) {
    return 'Đăng nhập SMTP thất bại. Kiểm tra SMTP_USER và SMTP_PASS (Gmail: bật xác minh 2 bước và tạo mật khẩu ứng dụng 16 ký tự).';
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
    return 'Không kết nối được máy chủ SMTP. Kiểm tra SMTP_HOST, cổng (587/465) và mạng/tường lửa.';
  }
  return 'Không gửi được email. Kiểm tra cấu hình SMTP và địa chỉ gửi (SMTP_FROM).';
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTransportOptions() {
  const host = (process.env.SMTP_HOST || '').trim().toLowerCase();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER.trim();
  const pass = normalizeSmtpPass();

  const useGmailPreset =
    process.env.SMTP_SERVICE === 'gmail' || host === 'smtp.gmail.com' || host.endsWith('.gmail.com');

  if (useGmailPreset) {
    return {
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 60_000,
      greetingTimeout: 30_000,
    };
  }

  const secure =
    process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || port === 465;

  return {
    host: process.env.SMTP_HOST.trim(),
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
    connectionTimeout: 60_000,
    greetingTimeout: 30_000,
  };
}

export function getMailer() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport(buildTransportOptions());
  }
  return transporter;
}

/**
 * @param {{ to: string, subject: string, text?: string, html?: string }} opts
 */
export async function sendMail(opts) {
  const mailer = getMailer();
  if (!mailer) {
    const err = new Error('SMTP chưa cấu hình (thiếu SMTP_HOST / SMTP_USER / SMTP_PASS hoặc SMTP_ENABLED=false)');
    err.code = 'SMTP_DISABLED';
    throw err;
  }

  const from = resolveMailFrom();
  if (!from) {
    const err = new Error('SMTP_USER chưa được cấu hình.');
    err.code = 'SMTP_DISABLED';
    throw err;
  }

  await mailer.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

/**
 * Gửi email chào mừng sau đăng ký. Không throw — chỉ log lỗi.
 * @param {string} email
 */
export async function sendWelcomeEmail(email) {
  if (!isSmtpConfigured()) return;

  const safe = escapeHtml(email);
  try {
    await sendMail({
      to: email,
      subject: process.env.SMTP_WELCOME_SUBJECT || 'Chào mừng đến Veo3 Pro',
      text: `Xin chào,\n\nTài khoản ${email} đã được tạo trên Veo3 Pro.\n\nĐăng nhập và bắt đầu tạo video với Google Veo / Gemini.\n`,
      html: `<p>Xin chào,</p><p>Tài khoản <strong>${safe}</strong> đã được tạo trên <strong>Veo3 Pro</strong>.</p><p>Đăng nhập và bắt đầu tạo video với Google Veo / Gemini.</p>`,
    });
  } catch (e) {
    console.error('[smtp] welcome email failed:', e.message);
  }
}
