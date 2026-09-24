import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { parse, notFound } from '../lib/util.js';

const r = Router();
const Type = z.enum(['process', 'step', 'diagram', 'open_item']);

r.get('/', async (req, res) => {
  const { type, id } = parse(z.object({ type: Type, id: z.string().min(1) }), req.query);
  const { rows } = await q(
    `SELECT c.id, c.body, c.created_at, c.user_id, u.name AS user_name
       FROM comments c LEFT JOIN users u ON u.id=c.user_id
      WHERE c.entity_type=$1 AND c.entity_id=$2 ORDER BY c.created_at`, [type, id]);
  res.json(rows);
});

r.post('/', async (req, res) => {
  const b = parse(z.object({ entity_type: Type, entity_id: z.string().min(1).max(40), body: z.string().trim().min(1).max(4000) }), req.body);
  const { rows } = await q(
    'INSERT INTO comments(entity_type,entity_id,user_id,body) VALUES ($1,$2,$3,$4) RETURNING *',
    [b.entity_type, b.entity_id, req.user.id, b.body]);
  await q('INSERT INTO activity_log(user_id,action,entity_type,entity_id,summary) VALUES ($1,$2,$3,$4,$5)',
    [req.user.id, 'commented', b.entity_type, b.entity_id, b.body.slice(0, 200)]);
  res.status(201).json({ ...rows[0], user_name: req.user.name });
});

r.delete('/:id', async (req, res) => {
  const { rows } = await q('SELECT user_id FROM comments WHERE id=$1', [req.params.id]);
  if (!rows[0]) throw notFound('Comment');
  if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }
  await q('DELETE FROM comments WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default r;
