import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCanEditProcess } from '../lib/auth.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';

const r = Router();

const LIST_SQL = `
  SELECT p.*, g.name AS group_name, g.color, s.name AS stage_name, s.sort AS stage_sort,
    (SELECT count(*)::int FROM matrix_steps m WHERE m.process_id=p.id) AS step_count,
    (SELECT count(*)::int FROM matrix_steps m WHERE m.process_id=p.id AND m.validation_status='approved') AS approved_count,
    (SELECT count(*)::int FROM matrix_steps m WHERE m.process_id=p.id AND m.validation_status IN ('changes','rework')) AS flagged_count,
    COALESCE((SELECT json_agg(json_build_object('id',u.id,'name',u.name) ORDER BY u.name)
                FROM process_owners po JOIN users u ON u.id=po.user_id WHERE po.process_id=p.id), '[]') AS owners,
    uu.name AS updated_by_name
  FROM processes p
  JOIN process_groups g ON g.id=p.group_id
  LEFT JOIN stages s ON s.id=p.stage_id
  LEFT JOIN users uu ON uu.id=p.updated_by`;

r.get('/', async (req, res) => {
  const { rows } = await q(`${LIST_SQL} ORDER BY p.sort`);
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  const { rows } = await q(`${LIST_SQL} WHERE p.id=$1`, [req.params.id]);
  if (!rows[0]) throw notFound('Process');
  const steps = await q(
    `SELECT m.*, u.name AS validated_by_name FROM matrix_steps m LEFT JOIN users u ON u.id=m.validated_by
      WHERE m.process_id=$1 ORDER BY m.sort, m.ref`, [req.params.id]);
  const diagrams = await q(`SELECT id, title FROM diagrams WHERE covers ~ ('(^|[^0-9A-Z])' || $1 || '([^0-9]|$)') ORDER BY sort`, [req.params.id]);
  const reeng = await q(
    `SELECT id, title, wave, impact_type, phi_decision FROM reengineering
      WHERE $1 = ANY(string_to_array(replace(process_refs,' ',''), ',')) OR process_refs='All' ORDER BY sort`, [req.params.id]);
  const gap = await q('SELECT id, rating, gaps, action, priority, status FROM sow_gaps WHERE process_id=$1', [req.params.id]);
  res.json({ ...rows[0], matrix: steps.rows, diagrams: diagrams.rows, reengineering: reeng.rows, sow_gap: gap.rows[0] || null });
});

const list = z.array(z.string().trim().min(1).max(500)).max(40);
const ProcessUpdate = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  owner_dept: z.string().trim().max(200).optional(),
  odoo_home: z.string().trim().max(1000).optional(),
  fit: z.enum(['Standard', 'Configure', 'Extend']).optional(),
  suppliers: list.optional(), inputs: list.optional(), steps: list.optional(), outputs: list.optional(), customers: list.optional(),
});

r.put('/:id', async (req, res) => {
  assertCanEditProcess(req.user, req.params.id);
  const body = parse(ProcessUpdate, req.body);
  const { sets, values } = buildUpdate(body, 1, ['suppliers', 'inputs', 'steps', 'outputs', 'customers']);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  await tx(async (c) => {
    values.push(req.user.id, req.params.id);
    const u = await c.query(
      `UPDATE processes SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length} RETURNING id`, values);
    if (!u.rowCount) throw notFound('Process');
    await logActivity(c, req.user.id, 'updated', 'process', req.params.id, `Updated ${Object.keys(body).join(', ')}`);
  });
  res.json({ ok: true });
});

export default r;
