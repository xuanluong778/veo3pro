import { issueOAuthState } from './oauthStateStore.js';

export function assertGoogleOAuthConfigured() {
  if (process.env.GOOGLE_AUTH_ENABLED === 'false') {
    const err = new Error('Google OAuth is disabled');
    err.code = 'GOOGLE_DISABLED';
    throw err;
  }
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    const err = new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    err.code = 'GOOGLE_NOT_CONFIGURED';
    throw err;
  }
}

export function getGoogleRedirectUri() {
  const fromEnv = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const port = Number(process.env.PORT || 8787);
  return `http://127.0.0.1:${port}/api/auth/google/callback`;
}

/** Frontend URL sau đăng nhập (Vite dev hoặc cùng origin production). */
export function getAppOrigin() {
  const raw = process.env.APP_ORIGIN?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return 'http://localhost:5173';
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const SCOPES = ['openid', 'email', 'profile'].join(' ');

export function buildGoogleAuthorizeRedirect() {
  assertGoogleOAuthConfigured();
  const state = issueOAuthState();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID.trim(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * @param {string} code
 * @returns {Promise<{ access_token: string }>}
 */
export async function exchangeGoogleCode(code) {
  assertGoogleOAuthConfigured();
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    redirect_uri: getGoogleRedirectUri(),
    grant_type: 'authorization_code',
  });

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error_description || data.error || `Google token exchange failed (${r.status})`);
  }
  if (!data.access_token) {
    throw new Error('Google token response missing access_token');
  }
  return data;
}

/**
 * @param {string} accessToken
 * @returns {Promise<{ sub: string, email: string, email_verified?: boolean }>}
 */
export async function fetchGoogleUserInfo(accessToken) {
  const r = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error_description || data.error || `Google userinfo failed (${r.status})`);
  }
  if (!data.sub || !data.email) {
    throw new Error('Google profile missing sub or email');
  }
  return data;
}
