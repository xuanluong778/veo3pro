import { randomBytes } from 'crypto';

/** @type {Map<string, number>} */
const states = new Map();
const TTL_MS = 10 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [k, exp] of states) {
    if (exp < now) states.delete(k);
  }
}

export function issueOAuthState() {
  sweep();
  const state = randomBytes(24).toString('base64url');
  states.set(state, Date.now() + TTL_MS);
  return state;
}

/**
 * @param {string} state
 * @returns {boolean}
 */
export function consumeOAuthState(state) {
  sweep();
  if (!state || typeof state !== 'string') return false;
  const exp = states.get(state);
  if (!exp || Date.now() > exp) return false;
  states.delete(state);
  return true;
}
