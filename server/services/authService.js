import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'veo3pro_auth';

const BCRYPT_ROUNDS = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS) || 12));
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function assertJwtConfigured() {
  const s = process.env.JWT_SECRET;
  if (!s || String(s).length < 16) {
    throw new Error(
      'JWT_SECRET must be set (min 16 characters). Example: openssl rand -hex 32',
    );
  }
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * @param {{ id: string, email: string, plan: string }} user
 */
export function signAuthToken(user) {
  assertJwtConfigured();
  return jwt.sign(
    { sub: user.id, email: user.email, plan: user.plan },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

/**
 * @param {string} token
 * @returns {{ sub: string, email: string, plan: string }}
 */
export function verifyAuthToken(token) {
  assertJwtConfigured();
  return jwt.verify(token, process.env.JWT_SECRET);
}

/** @param {import('./userStore.js').UserRow} u */
export function toPublicUser(u) {
  return {
    id: u.id,
    email: u.email,
    plan: u.plan,
    createdAt: u.createdAt,
    displayName: u.displayName ?? null,
    phone: u.phone ?? null,
    contactEmail: u.contactEmail ?? null,
    avatarUrl: u.avatarUrl ?? null,
    hasPassword: Boolean(u.passwordHash),
    googleLinked: Boolean(u.googleId),
  };
}
