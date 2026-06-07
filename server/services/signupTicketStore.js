import { randomBytes } from 'crypto';

/** @type {Map<string, { email: string, exp: number }>} */
const tickets = new Map();

const TTL_MS = 15 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [k, v] of tickets) {
    if (v.exp < now) tickets.delete(k);
  }
}

/**
 * Sau khi xác minh OTP mà chưa có tài khoản — cho phép một lần đăng ký khớp email.
 * @param {string} email normalized lowercase
 */
export function issueSignupTicket(email) {
  sweep();
  const ticket = randomBytes(24).toString('base64url');
  tickets.set(ticket, { email: email.toLowerCase().trim(), exp: Date.now() + TTL_MS });
  return ticket;
}

/**
 * @param {string} ticket
 * @returns {string|null} verified email (lowercase)
 */
export function consumeSignupTicket(ticket) {
  sweep();
  if (!ticket || typeof ticket !== 'string') return null;
  const row = tickets.get(ticket);
  if (!row || Date.now() > row.exp) return null;
  tickets.delete(ticket);
  return row.email;
}
