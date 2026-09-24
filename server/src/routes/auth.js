import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { requireAuth, setAuthCookie, clearAuthCookie } from '../lib/auth.js';
import { parse, logActivity } from '../lib/util.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });

r.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().trim().email(), password: z.string().min(1) }), req.body);
  const { rows } = await q('SELECT id, password_hash, active FROM users WHERE lower(email)=lower($1)', [email]);
  const u = rows[0];
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  await q('UPDATE users SET last_login_at = now() WHERE id=$1', [u.id]);
  setAuthCookie(res, u.id);
  res.json({ ok: true });
});

r.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json(req.user));

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
