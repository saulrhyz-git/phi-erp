import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { q, currentContext } from '../db/pool.js';
import { effectivePermissions } from './permissions.js';

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
    `SELECT u.id, u.email, u.name, u.active, u.must_change_password,
            r.id AS role_id, r.key AS role_key, r.name AS role_name, r.is_system AS role_is_system, r.permissions AS role_permissions,
            COALESCE((SELECT array_agg(po.process_id ORDER BY po.process_id) FROM process_owners po WHERE po.user_id=u.id), '{}') AS assigned_process_ids,
            -- Processes this user may act on as "own": assigned to them, or in one of their domains.
            COALESCE((SELECT array_agg(x.id ORDER BY x.id) FROM (
                SELECT po.process_id AS id FROM process_owners po WHERE po.user_id=u.id
                UNION SELECT p.id FROM processes p JOIN user_domains ud ON ud.domain_id=p.domain_id WHERE ud.user_id=u.id) x), '{}') AS process_ids,
            COALESCE((SELECT array_agg(ud.domain_id ORDER BY ud.domain_id) FROM user_domains ud WHERE ud.user_id=u.id), '{}') AS domains
       FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.id = $1`, [id]);
  const u = rows[0];
  if (!u) return undefined;
  const permissions = effectivePermissions({ key: u.role_key, is_system: u.role_is_system, permissions: u.role_permissions });
  delete u.role_permissions;
  return { ...u, permissions };
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
  const ctx = currentContext();
  if (ctx) ctx.user = { id: user.id, name: user.name, email: user.email };
  next();
}

// Blocks everything except the password change until a forced password change is done.
export function requirePasswordFresh(req, res, next) {
  if (req.user.must_change_password) {
    return res.status(403).json({ error: 'Change your password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}
