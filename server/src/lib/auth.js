import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { q } from '../db/pool.js';

export const COOKIE = 'phi_token';

export function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure });
}

export async function loadUser(id) {
  const { rows } = await q(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.must_change_password,
            COALESCE(array_agg(po.process_id ORDER BY po.process_id) FILTER (WHERE po.process_id IS NOT NULL), '{}') AS process_ids
       FROM users u LEFT JOIN process_owners po ON po.user_id = u.id
      WHERE u.id = $1 GROUP BY u.id`, [id]);
  return rows[0];
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
  const user = await loadUser(payload.sub);
  if (!user || !user.active) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'This account is not active.' });
  }
  req.user = user;
  next();
}

// Blocks everything except the password change until a forced password change is done.
export function requirePasswordFresh(req, res, next) {
  if (req.user.must_change_password) {
    return res.status(403).json({ error: 'Change your password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "You don't have permission to do that." });

export const canEditProcess = (user, processId) =>
  user.role === 'admin' || (user.role === 'owner' && user.process_ids.includes(processId));

export function assertCanEditProcess(user, processId) {
  if (!canEditProcess(user, processId)) {
    const e = new Error(`Only an admin or an owner assigned to process ${processId} can change this.`);
    e.status = 403;
    throw e;
  }
}

export function assertEditor(user) {
  if (!['admin', 'owner'].includes(user.role)) {
    const e = new Error('Only admins and process owners can change this.');
    e.status = 403;
    throw e;
  }
}
