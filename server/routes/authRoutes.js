import crypto from 'node:crypto';
import { Router } from 'express';
import {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  toPublicUser,
  AUTH_COOKIE_NAME,
} from '../services/authService.js';
import {
  findUserById,
  createUserRecord,
  findUserByEmail,
  findUserByGoogleId,
  createOAuthUserRecord,
  linkGoogleToUser,
  updateUserPasswordHash,
  updateUserProfileFields,
} from '../services/userStore.js';
import {
  sendWelcomeEmail,
  sendMail,
  isSmtpConfigured,
  escapeHtml,
  formatSmtpSendError,
} from '../services/smtpMailer.js';
import { saveOtp, clearOtp, consumeOtp, checkOtpCooldown, touchOtpCooldown } from '../services/otpStore.js';
import { issueSignupTicket, consumeSignupTicket } from '../services/signupTicketStore.js';
import {
  assertGoogleOAuthConfigured,
  buildGoogleAuthorizeRedirect,
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getAppOrigin,
} from '../services/googleOAuth.js';
import { consumeOAuthState } from '../services/oauthStateStore.js';
import { issueOAuthTicket, consumeOAuthTicket } from '../services/oauthTicketStore.js';

async function readSessionUser(req) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = verifyAuthToken(token);
    const user = await findUserById(payload.sub);
    return user ? toPublicUser(user) : null;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cookieOptions() {
  const maxAge = Math.round(Number(process.env.JWT_COOKIE_DAYS || 7) * 24 * 3600 * 1000);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

function googleOAuthEnabled() {
  return (
    process.env.GOOGLE_AUTH_ENABLED !== 'false' &&
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
  );
}

function redirectOAuthErr(res, code) {
  const u = new URL(`${getAppOrigin()}/`);
  u.searchParams.set('auth_error', code);
  return res.redirect(302, u.toString());
}

/**
 * @returns {Promise<{ user: import('../services/userStore.js').UserRow, isNew: boolean }>}
 */
async function upsertUserFromGoogleProfile(profile) {
  const email = profile.email.toLowerCase().trim();
  if (profile.email_verified === false) {
    const err = new Error('Google account email is not verified');
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }

  let user = await findUserByGoogleId(profile.sub);
  if (user) return { user, isNew: false };

  const byEmail = await findUserByEmail(email);
  if (byEmail) {
    await linkGoogleToUser(byEmail.id, profile.sub);
    user = await findUserById(byEmail.id);
    return { user, isNew: false };
  }

  user = await createOAuthUserRecord({ email, googleId: profile.sub });
  return { user, isNew: true };
}

export function createAuthRouter() {
  const router = Router();

  router.get('/google/config', (_req, res) => {
    res.json({ googleOAuthEnabled: googleOAuthEnabled() });
  });

  router.get('/google', (_req, res) => {
    try {
      const url = buildGoogleAuthorizeRedirect();
      res.redirect(302, url);
    } catch (e) {
      if (e.code === 'GOOGLE_NOT_CONFIGURED' || e.code === 'GOOGLE_DISABLED') {
        return res.status(503).json({
          error: 'Đăng nhập Google chưa bật. Cấu hình GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong .env.',
          code: e.code,
        });
      }
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/google/callback', async (req, res) => {
    try {
      if (req.query.error) {
        return redirectOAuthErr(res, String(req.query.error));
      }

      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';

      if (!code || !consumeOAuthState(state)) {
        return redirectOAuthErr(res, 'invalid_state');
      }

      const tokens = await exchangeGoogleCode(code);
      const profile = await fetchGoogleUserInfo(tokens.access_token);

      const { user, isNew } = await upsertUserFromGoogleProfile(profile);
      if (isNew) void sendWelcomeEmail(user.email);

      const ticket = issueOAuthTicket(user.id);
      const next = new URL(`${getAppOrigin()}/`);
      next.searchParams.set('oauth_ticket', ticket);
      res.redirect(302, next.toString());
    } catch (e) {
      console.error('[google oauth]', e);
      return redirectOAuthErr(res, 'oauth_failed');
    }
  });

  router.post('/google/finish', async (req, res) => {
    try {
      const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
      const userId = consumeOAuthTicket(ticket);
      if (!userId) {
        return res.status(400).json({ error: 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.', code: 'INVALID_TICKET' });
      }

      const user = await findUserById(userId);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      const token = signAuthToken(user);
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());

      res.json({ user: toPublicUser(user) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/me', async (req, res) => {
    try {
      const user = await readSessionUser(req);
      res.json({ user });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/register', async (req, res) => {
    try {
      const emailRaw = req.body?.email;
      const password = req.body?.password;
      const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';

      if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const signupTicketRaw = req.body?.signupTicket;
      const signupTicket = typeof signupTicketRaw === 'string' ? signupTicketRaw.trim() : '';

      if (signupTicket) {
        const verifiedEmail = consumeSignupTicket(signupTicket);
        if (!verifiedEmail || verifiedEmail !== email) {
          return res.status(400).json({
            error:
              'Phiên đăng ký sau OTP không hợp lệ hoặc đã hết hạn (15 phút). Nhận mã OTP lại và xác nhận trước khi tạo tài khoản.',
          });
        }
      }

      const passwordHash = await hashPassword(password);

      const user = await createUserRecord({ email, passwordHash, plan: 'free' });
      const token = signAuthToken(user);
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());

      res.status(201).json({ user: toPublicUser(user) });

      void sendWelcomeEmail(user.email);
    } catch (e) {
      if (e.code === 'EMAIL_TAKEN') {
        return res.status(409).json({ error: e.message });
      }
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const emailRaw = req.body?.email;
      const password = req.body?.password;
      const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const user = await findUserByEmail(email);
      if (!user || !user.passwordHash) {
        if (user && !user.passwordHash) {
          return res.status(401).json({
            error: 'Tài khoản này đăng nhập bằng Google. Dùng «Đăng nhập với Google».',
            code: 'USE_GOOGLE',
          });
        }
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!(await verifyPassword(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = signAuthToken(user);
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());

      res.json({ user: toPublicUser(user) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ ok: true });
  });

  router.post('/otp/request', async (req, res) => {
    try {
      const emailRaw = req.body?.email;
      const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';

      if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email không hợp lệ.' });
      }
      if (!isSmtpConfigured()) {
        return res.status(503).json({ error: 'Gửi OTP cần cấu hình SMTP trên server (SMTP_HOST, SMTP_USER, SMTP_PASS).' });
      }

      const cool = checkOtpCooldown(email);
      if (!cool.ok) {
        return res.status(429).json({
          error: `Vui lòng thử lại sau ${cool.retryAfterSec} giây.`,
          retryAfterSec: cool.retryAfterSec,
        });
      }

      const generic = {
        ok: true,
        message:
          'Nếu SMTP đã bật đúng, mã OTP đã được gửi đến email của bạn (kiểm tra cả thư mục Spam).',
      };

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      saveOtp(email, code);

      try {
        await sendMail({
          to: email,
          subject: process.env.SMTP_OTP_SUBJECT || 'Mã đăng nhập Veo3 Pro',
          text: `Mã OTP của bạn: ${code}\n\nMã có hiệu lực trong 10 phút.`,
          html: `<p>Mã OTP của bạn: <strong>${escapeHtml(code)}</strong></p><p>Mã có hiệu lực trong 10 phút.</p>`,
        });
      } catch (e) {
        console.error('[otp] send failed:', e.message, e.code || '', e.responseCode || '');
        clearOtp(email);
        return res.status(500).json({ error: formatSmtpSendError(e) });
      }

      touchOtpCooldown(email);
      return res.json(generic);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/otp/verify', async (req, res) => {
    try {
      const emailRaw = req.body?.email;
      const codeRaw = req.body?.code;
      const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
      const code = typeof codeRaw === 'string' ? codeRaw.replace(/\s/g, '') : '';

      if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email không hợp lệ.' });
      }
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Nhập mã OTP gồm 6 chữ số.' });
      }

      if (!consumeOtp(email, code)) {
        return res.status(401).json({ error: 'Mã OTP không đúng hoặc đã hết hạn.' });
      }

      const user = await findUserByEmail(email);
      if (!user) {
        const signupTicket = issueSignupTicket(email);
        return res.json({
          ok: true,
          needsSignup: true,
          signupTicket,
          email,
          message: 'Email đã xác minh. Đặt mật khẩu và nhấn Tạo tài khoản (trong 15 phút).',
        });
      }

      const token = signAuthToken(user);
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());

      res.json({ user: toPublicUser(user) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/profile', async (req, res) => {
    try {
      const session = await readSessionUser(req);
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      const { displayName, phone, contactEmail, avatarUrl } = req.body || {};
      const fields = {};
      if (displayName !== undefined) {
        fields.displayName = typeof displayName === 'string' ? displayName : null;
      }
      if (phone !== undefined) {
        fields.phone = typeof phone === 'string' ? phone : null;
      }
      if (contactEmail !== undefined) {
        fields.contactEmail = typeof contactEmail === 'string' ? contactEmail : null;
      }
      if (avatarUrl !== undefined) {
        fields.avatarUrl = typeof avatarUrl === 'string' ? avatarUrl : null;
      }
      if (!Object.keys(fields).length) {
        return res.status(400).json({ error: 'Không có trường nào để cập nhật.' });
      }
      const updated = await updateUserProfileFields(session.id, fields);
      res.json({ user: toPublicUser(updated) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/password/change', async (req, res) => {
    try {
      const session = await readSessionUser(req);
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      const full = await findUserById(session.id);
      if (!full?.passwordHash) {
        return res.status(400).json({
          error: 'Tài khoản đăng nhập Google không có mật khẩu trên app — không đổi được từ đây.',
        });
      }
      const currentPassword = req.body?.currentPassword;
      const newPassword = req.body?.newPassword;
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'Gửi mật khẩu hiện tại và mật khẩu mới.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 8 ký tự.' });
      }
      if (!(await verifyPassword(currentPassword, full.passwordHash))) {
        return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
      }
      const hash = await hashPassword(newPassword);
      const updated = await updateUserPasswordHash(full.id, hash);
      res.json({ user: toPublicUser(updated) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/password/reset-with-otp', async (req, res) => {
    try {
      const emailRaw = req.body?.email;
      const codeRaw = req.body?.code;
      const newPassword = req.body?.newPassword;
      const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
      const code = typeof codeRaw === 'string' ? codeRaw.replace(/\s/g, '') : '';
      if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Email không hợp lệ.' });
      }
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Mã OTP gồm 6 chữ số.' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 8 ký tự.' });
      }
      if (!consumeOtp(email, code)) {
        return res.status(401).json({ error: 'Mã OTP không đúng hoặc đã hết hạn.' });
      }
      const user = await findUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'Không tìm thấy tài khoản với email này.' });
      }
      const hash = await hashPassword(newPassword);
      const updated = await updateUserPasswordHash(user.id, hash);
      const token = signAuthToken(updated);
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
      res.json({ user: toPublicUser(updated) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
