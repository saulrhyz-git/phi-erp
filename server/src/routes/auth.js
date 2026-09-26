import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { q, pool } from '../db/pool.js';
import { requireAuth, setAuthCookie, clearAuthCookie } from '../lib/auth.js';
import { parse, logActivity, auditEvent } from '../lib/util.js';
import { MODULE_GROUPS } from '../lib/permissions.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });

r.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().trim().email(), password: z.string().min(1) }), req.body);
  const { rows } = await q('SELECT id, name, email, password_hash, active FROM users WHERE lower(email)=lower($1)', [email]);
  const u = rows[0];
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) {
    await auditEvent('LOGIN_FAILED', { table: 'users', recordId: u?.id ?? null, summary: `Failed sign-in for ${email}${u && !u.active ? ' (inactive account)' : ''}`, user: u ? { id: u.id, name: u.name, email: u.email } : null });
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  // last_login_at is bookkeeping; the LOGIN event below is the audit record.
  await pool.query('UPDATE users SET last_login_at = now() WHERE id=$1', [u.id]);
  await auditEvent('LOGIN', { table: 'users', recordId: u.id, summary: `Signed in (${req.get('user-agent')?.slice(0, 150) || 'unknown client'})`, user: { id: u.id, name: u.name, email: u.email } });
  setAuthCookie(res, u.id);
  res.json({ ok: true });
});

r.post('/logout', async (req, res) => {
  try {
    const jwt = (await import('jsonwebtoken')).default;
    const { config } = await import('../config.js');
    const p = jwt.verify(req.cookies?.phi_token || '', config.jwtSecret);
    const { rows } = await q('SELECT id, name, email FROM users WHERE id=$1', [p.sub]);
    if (rows[0]) await auditEvent('LOGOUT', { table: 'users', recordId: rows[0].id, summary: 'Signed out', user: rows[0] });
  } catch { /* not signed in */ }
  clearAuthCookie(res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json(req.user));
r.get('/modules', requireAuth, (req, res) => res.json(MODULE_GROUPS));

r.post('/password', requireAuth, async (req, res) => {
  const { current, next } = parse(z.object({
    current: z.string().min(1),
    next: z.string().min(10, 'New password must be at least 10 characters'),
  }), req.body);
  const { rows } = await q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  if (current === next) return res.status(400).json({ error: 'Choose a password different from the current one.' });
  await q('UPDATE users SET password_hash=$1, must_change_password=FALSE WHERE id=$2', [await bcrypt.hash(next, 12), req.user.id]);
  await logActivity({ query: q }, req.user.id, 'password_changed', 'user', req.user.id, 'Changed own password');
  res.json({ ok: true });
});

export default r;
