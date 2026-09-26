import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan } from '../lib/permissions.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';

const r = Router();
const Item = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(4000),
  owner: z.string().trim().max(200),
  decision: z.string().trim().max(4000),
  target_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'), z.literal(''), z.null()]).transform((v) => v || null),
  status: z.enum(['open', 'in_progress', 'closed']),
});

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT o.*, u.name AS updated_by_name,
            (SELECT count(*)::int FROM comments c WHERE c.entity_type='open_item' AND c.entity_id=o.id::text) AS comment_count
       FROM open_items o LEFT JOIN users u ON u.id=o.updated_by ORDER BY o.sort, o.id`);
  res.json(rows);
});

r.post('/', async (req, res) => {
  assertCan(req.user, 'open_items', 'add');
  const b = parse(Item.partial().required({ title: true }), req.body);
  const row = await tx(async (c) => {
    const n = await c.query(`SELECT COALESCE(max(substring(code from 2)::int),0)+1 AS n FROM open_items WHERE code ~ '^Q[0-9]+$'`);
    const { rows } = await c.query(
      `INSERT INTO open_items(code,title,detail,owner,decision,target_date,status,sort,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(sort),0)+1 FROM open_items),$8) RETURNING *`,
      [`Q${n.rows[0].n}`, b.title, b.detail ?? '', b.owner ?? '', b.decision ?? '', b.target_date ?? null, b.status ?? 'open', req.user.id]);
    await logActivity(c, req.user.id, 'created', 'open_item', rows[0].code, b.title);
    return rows[0];
  });
  res.status(201).json(row);
});

r.put('/:id', async (req, res) => {
  assertCan(req.user, 'open_items', 'edit');
  const b = parse(Item.partial(), req.body);
  const { sets, values } = buildUpdate(b);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  values.push(req.user.id, req.params.id);
  const u = await q(
    `UPDATE open_items SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length} RETURNING code`, values);
  if (!u.rowCount) throw notFound('Open item');
  await logActivity({ query: q }, req.user.id, 'updated', 'open_item', u.rows[0].code,
    b.status ? `Status → ${b.status}` : `Edited ${Object.keys(b).join(', ')}`);
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  assertCan(req.user, 'open_items', 'delete');
  const u = await q('DELETE FROM open_items WHERE id=$1 RETURNING code, title', [req.params.id]);
  if (!u.rowCount) throw notFound('Open item');
  await logActivity({ query: q }, req.user.id, 'deleted', 'open_item', u.rows[0].code, u.rows[0].title);
  res.json({ ok: true });
});

export default r;
