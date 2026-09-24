import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { parse, notFound, logActivity } from '../lib/util.js';

const r = Router(); // mounted behind requireRole('admin')

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.must_change_password, u.created_at, u.last_login_at,
            COALESCE(array_agg(po.process_id ORDER BY po.process_id) FILTER (WHERE po.process_id IS NOT NULL), '{}') AS process_ids
       FROM users u LEFT JOIN process_owners po ON po.user_id=u.id GROUP BY u.id ORDER BY u.name`);
  res.json(rows);
});

const Role = z.enum(['admin', 'owner', 'viewer']);
const ProcessIds = z.array(z.string().min(1).max(10)).max(40);

async function setOwnership(c, userId, processIds) {
  await c.query('DELETE FROM process_owners WHERE user_id=$1', [userId]);
  for (const pid of processIds) {
    await c.query('INSERT INTO process_owners(process_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pid, userId]);
  }
}

r.post('/', async (req, res) => {
  const b = parse(z.object({
    email: z.string().trim().email(), name: z.string().trim().min(1).max(120), role: Role,
    password: z.string().min(10, 'Temporary password must be at least 10 characters'), process_ids: ProcessIds.default([]),
  }), req.body);
  const exists = await q('SELECT 1 FROM users WHERE lower(email)=lower($1)', [b.email]);
  if (exists.rowCount) return res.status(409).json({ error: 'A user with that email already exists.' });
  const user = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO users(email,name,password_hash,role,must_change_password) VALUES ($1,$2,$3,$4,TRUE) RETURNING id, email, name, role`,
      [b.email, b.name, await bcrypt.hash(b.password, 12), b.role]);
    await setOwnership(c, rows[0].id, b.process_ids);
    await logActivity(c, req.user.id, 'created', 'user', rows[0].id, `${b.name} (${b.role})`);
    return rows[0];
  });
  res.status(201).json(user);
});

r.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({
    name: z.string().trim().min(1).max(120).optional(), role: Role.optional(), active: z.boolean().optional(), process_ids: ProcessIds.optional(),
  }), req.body);
  if (id === req.user.id && (b.active === false || (b.role && b.role !== 'admin'))) {
    return res.status(400).json({ error: "You can't deactivate or demote your own account." });
  }
  await tx(async (c) => {
    const cur = await c.query('SELECT name FROM users WHERE id=$1', [id]);
    if (!cur.rowCount) throw notFound('User');
    await c.query(
      `UPDATE users SET name=COALESCE($1,name), role=COALESCE($2,role), active=COALESCE($3,active) WHERE id=$4`,
      [b.name ?? null, b.role ?? null, b.active ?? null, id]);
    if (b.process_ids) await setOwnership(c, id, b.process_ids);
    await logActivity(c, req.user.id, 'updated', 'user', id, `Updated ${cur.rows[0].name}: ${Object.keys(b).join(', ')}`);
  });
  res.json({ ok: true });
});

r.post('/:id/password', async (req, res) => {
  const b = parse(z.object({ password: z.string().min(10, 'Temporary password must be at least 10 characters') }), req.body);
  const u = await q('UPDATE users SET password_hash=$1, must_change_password=TRUE WHERE id=$2 RETURNING name',
    [await bcrypt.hash(b.password, 12), req.params.id]);
  if (!u.rowCount) throw notFound('User');
  await logActivity({ query: q }, req.user.id, 'reset_password', 'user', req.params.id, `Reset password for ${u.rows[0].name}`);
  res.json({ ok: true });
});

export default r;
