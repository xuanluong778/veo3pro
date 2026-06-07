import { verifyAuthToken, AUTH_COOKIE_NAME } from '../services/authService.js';
import { findUserById } from '../services/userStore.js';

/**
 * Requires valid JWT in httpOnly cookie. Sets req.user and req.flowUserKey (for quotas).
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
    }

    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' });
    }

    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists', code: 'AUTH_INVALID' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      plan: user.plan,
      createdAt: user.createdAt,
    };
    req.flowUserKey = user.id;
    next();
  } catch (e) {
    next(e);
  }
}
