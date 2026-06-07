import { randomBytes } from 'crypto';

/** @type {Map<string, { userId: string, exp: number }>} */
const tickets = new Map();
const TTL_MS = 120 * 1000;

function sweep() {
  const now = Date.now();
  for (const [k, v] of tickets) {
    if (v.exp < now) tickets.delete(k);
  }
}

export function issueOAuthTicket(userId) {
  sweep();
  const ticket = randomBytes(24).toString('base64url');
  tickets.set(ticket, { userId, exp: Date.now() + TTL_MS });
  return ticket;
}

/**
 * @param {string} ticket
 * @returns {string|null} userId
 */
export function consumeOAuthTicket(ticket) {
  sweep();
  if (!ticket || typeof ticket !== 'string') return null;
  const row = tickets.get(ticket);
  if (!row || Date.now() > row.exp) return null;
  tickets.delete(ticket);
  return row.userId;
}
