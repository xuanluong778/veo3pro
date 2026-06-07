/** @typedef {{ code: string, expiresAt: number }} OtpRow */

const otpByEmail = new Map();
const cooldownByEmail = new Map();

const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;

function norm(email) {
  return email.toLowerCase().trim();
}

export function saveOtp(email, code) {
  otpByEmail.set(norm(email), { code: String(code), expiresAt: Date.now() + TTL_MS });
}

export function clearOtp(email) {
  otpByEmail.delete(norm(email));
}

/**
 * @param {string} email
 * @param {string} rawCode
 */
export function consumeOtp(email, rawCode) {
  const key = norm(email);
  const row = otpByEmail.get(key);
  const code = String(rawCode).replace(/\D/g, '');
  if (!row) return false;
  if (Date.now() > row.expiresAt) {
    otpByEmail.delete(key);
    return false;
  }
  if (code !== row.code) return false;
  otpByEmail.delete(key);
  return true;
}

export function checkOtpCooldown(email) {
  const key = norm(email);
  const last = cooldownByEmail.get(key);
  if (!last) return { ok: true };
  const elapsed = Date.now() - last;
  if (elapsed >= COOLDOWN_MS) return { ok: true };
  return { ok: false, retryAfterSec: Math.ceil((COOLDOWN_MS - elapsed) / 1000) };
}

export function touchOtpCooldown(email) {
  cooldownByEmail.set(norm(email), Date.now());
}
