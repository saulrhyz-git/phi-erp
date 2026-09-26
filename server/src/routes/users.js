import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { parse, notFound, logActivity } from '../lib/util.js';
import { assertCan, requireView } from '../lib/permissions.js';

const r = Router();
r.use(requireView('users'));

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.email, u.name, u.active, u.must_change_password, u.created_at, u.last_login_at,
            u.role_id, ro.name AS role_name, ro.key AS role_key,
            COALESCE((SELECT array_agg(po.process_id ORDER BY po.process_id) FROM process_owners po WHERE po.user_id=u.id), '{}') AS process_ids,
            COALESCE((SELECT array_agg(ud.domain_id ORDER BY ud.domain_id) FROM user_domains ud WHERE ud.user_id=u.id), '{}') AS domains
       FROM users u JOIN roles ro ON ro.id=u.role_id ORDER BY u.name`);
  res.json(rows);
});

const ProcessIds = z.array(z.string().min(1).max(10)).max(40);
const Domains = z.array(z.string().min(1).max(10)).max(10);

async function setLinks(c, userId, processIds, domains) {
  if (processIds) {
    await c.query('DELETE FROM process_owners WHERE user_id=$1', [userId]);
    for (const pid of processIds) await c.query('INSERT INTO process_owners(process_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pid, userId]);
  }
  if (domains) {
    await c.query('DELETE FROM user_domains WHERE user_id=$1', [userId]);
    for (const d of domains) await c.query('INSERT INTO user_domains(user_id,domain_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, d]);
  }
}

// Never leave the project without an active Project Manager.
async function assertPmRemains(c, excludingUserId) {
  const { rows } = await c.query(
    `SELECT count(*)::int AS n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.key='project_manager' AND u.active AND u.id<>$1`, [excludingUserId]);
  if (!rows[0].n) { const e = new Error('At least one active Project Manager is required.'); e.status = 400; throw e; }
}

r.post('/', async (req, res) => {
  assertCan(req.user, 'users', 'add');
  const b = parse(z.object({
    email: z.string().trim().email(), name: z.string().trim().min(1).max(120), role_id: z.number().int(),
    password: z.string().min(10, 'Temporary password must be at least 10 characters'),
    process_ids: ProcessIds.default([]), domains: Domains.default([]),
  }), req.body);
  const exists = await q('SELECT 1 FROM users WHERE lower(email)=lower($1)', [b.email]);
  if (exists.rowCount) return res.status(409).json({ error: 'A user with that email already exists.' });
  const user = await tx(async (c) => {
    const role = await c.query('SELECT name FROM roles WHERE id=$1', [b.role_id]);
    if (!role.rowCount) throw notFound('Role');
    const { rows } = await c.query(
      `INSERT INTO users(email,name,password_hash,role_id,must_change_password) VALUES ($1,$2,$3,$4,TRUE) RETURNING id, email, name`,
      [b.email, b.name, await bcrypt.hash(b.password, 12), b.role_id]);
    await setLinks(c, rows[0].id, b.process_ids, b.domains);
    await logActivity(c, req.user.id, 'created', 'user', rows[0].id, `${b.name} (${role.rows[0].name})`);
    return rows[0];
  });
  res.status(201).json(user);
});

r.put('/:id', async (req, res) => {
  assertCan(req.user, 'users', 'edit');
  const id = Number(req.params.id);
  const b = parse(z.object({
    name: z.string().trim().min(1).max(120).optional(), role_id: z.number().int().optional(), active: z.boolean().optional(),
    process_ids: ProcessIds.optional(), domains: Domains.optional(),
  }), req.body);
  if (id === req.user.id && (b.active === false || (b.role_id && b.role_id !== req.user.role_id))) {
    return res.status(400).json({ error: "You can't deactivate your own account or change your own role." });
  }
  await tx(async (c) => {
    const cur = await c.query('SELECT u.name, r.key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1', [id]);
    if (!cur.rowCount) throw notFound('User');
    if (b.role_id) {
      const role = await c.query('SELECT key FROM roles WHERE id=$1', [b.role_id]);
      if (!role.rowCount) throw notFound('Role');
      if (cur.rows[0].key === 'project_manager' && role.rows[0].key !== 'project_manager') await assertPmRemains(c, id);
    }
    if (b.active === false && cur.rows[0].key === 'project_manager') await assertPmRemains(c, id);
    await c.query('UPDATE users SET name=COALESCE($1,name), role_id=COALESCE($2,role_id), active=COALESCE($3,active) WHERE id=$4',
      [b.name ?? null, b.role_id ?? null, b.active ?? null, id]);
    await setLinks(c, id, b.process_ids, b.domains);
    await logActivity(c, req.user.id, 'updated', 'user', id, `Updated ${cur.rows[0].name}: ${Object.keys(b).join(', ')}`);
  });
  res.json({ ok: true });
});

r.post('/:id/password', async (req, res) => {
  assertCan(req.user, 'users', 'edit');
  const b = parse(z.object({ password: z.string().min(10, 'Temporary password must be at least 10 characters') }), req.body);
  const u = await q('UPDATE users SET password_hash=$1, must_change_password=TRUE WHERE id=$2 RETURNING name',
    [await bcrypt.hash(b.password, 12), req.params.id]);
  if (!u.rowCount) throw notFound('User');
  await logActivity({ query: q }, req.user.id, 'reset_password', 'user', req.params.id, `Reset password for ${u.rows[0].name}`);
  res.json({ ok: true });
});

export default r;
