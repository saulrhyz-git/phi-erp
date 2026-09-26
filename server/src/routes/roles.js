import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { parse, notFound, logActivity } from '../lib/util.js';
import { ACTIONS, LEVELS, MODULE_GROUPS, assertCan, effectivePermissions, normalizePermissions, requireView } from '../lib/permissions.js';

const r = Router();

// The module catalog is needed by anyone who manages users or roles.
r.get('/modules', (req, res) => res.json({ groups: MODULE_GROUPS, actions: ACTIONS, levels: LEVELS }));

r.use(requireView('roles'));

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT r.*, (SELECT count(*)::int FROM users u WHERE u.role_id=r.id) AS user_count,
            (SELECT count(*)::int FROM users u WHERE u.role_id=r.id AND u.active) AS active_users
       FROM roles r ORDER BY r.is_system DESC, r.name`);
  res.json(rows.map((x) => ({ ...x, permissions: effectivePermissions(x) })));
});

const Perm = z.record(z.string(), z.object(Object.fromEntries(ACTIONS.map((a) => [a, z.enum(LEVELS).optional()]))));
const Body = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).default(''),
  permissions: Perm,
});

r.post('/', async (req, res) => {
  assertCan(req.user, 'roles', 'add');
  const b = parse(Body, req.body);
  const perms = normalizePermissions(b.permissions);
  const row = await tx(async (c) => {
    const { rows } = await c.query('INSERT INTO roles(name,description,permissions) VALUES ($1,$2,$3) RETURNING *', [b.name, b.description, JSON.stringify(perms)]);
    await logActivity(c, req.user.id, 'created', 'role', rows[0].id, b.name);
    return rows[0];
  });
  res.status(201).json(row);
});

async function getRole(id) {
  const { rows } = await q('SELECT * FROM roles WHERE id=$1', [id]);
  if (!rows[0]) throw notFound('Role');
  return rows[0];
}

r.put('/:id', async (req, res) => {
  assertCan(req.user, 'roles', 'edit');
  const role = await getRole(req.params.id);
  if (role.is_system) return res.status(400).json({ error: `${role.name} is a built-in role and can't be changed. Create a custom role instead.` });
  const b = parse(Body.partial(), req.body);
  const perms = b.permissions ? normalizePermissions(b.permissions) : null;
  await tx(async (c) => {
    await c.query('UPDATE roles SET name=COALESCE($1,name), description=COALESCE($2,description), permissions=COALESCE($3,permissions), updated_at=now() WHERE id=$4',
      [b.name ?? null, b.description ?? null, perms ? JSON.stringify(perms) : null, role.id]);
    await logActivity(c, req.user.id, 'updated', 'role', role.id, `${role.name}: ${Object.keys(b).join(', ')}`);
  });
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  assertCan(req.user, 'roles', 'delete');
  const role = await getRole(req.params.id);
  if (role.is_system) return res.status(400).json({ error: `${role.name} is a built-in role and can't be deleted.` });
  const used = await q('SELECT count(*)::int AS n FROM users WHERE role_id=$1', [role.id]);
  if (used.rows[0].n) return res.status(400).json({ error: `${used.rows[0].n} user(s) still have this role. Move them to another role first.` });
  await tx(async (c) => {
    await c.query('DELETE FROM roles WHERE id=$1', [role.id]);
    await logActivity(c, req.user.id, 'deleted', 'role', role.id, role.name);
  });
  res.json({ ok: true });
});

export default r;
