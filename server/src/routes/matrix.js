import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan } from '../lib/permissions.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';
import { assertLinkTargets } from '../lib/links.js';

const r = Router();

r.get('/', async (req, res) => {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.process) add('m.process_id = ?', String(req.query.process));
  if (req.query.fit) add('m.fit = ?', String(req.query.fit));
  if (req.query.status) add('m.validation_status = ?', String(req.query.status));
  if (req.query.q) add(`concat_ws(' ', m.ref, m.step, m.trigger_event, m.data_fields, m.handoff, m.exceptions, m.validation_comment) ILIKE ?`, `%${req.query.q}%`);
  const { rows } = await q(
    `SELECT m.*, p.name AS process_name, p.owner_dept, g.color, u.name AS validated_by_name
       FROM matrix_steps m JOIN processes p ON p.id=m.process_id JOIN process_groups g ON g.id=p.group_id
       LEFT JOIN users u ON u.id=m.validated_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.sort, m.sort, m.ref`, params);
  res.json(rows);
});

const text = z.string().trim().max(4000);
const StepBody = z.object({
  ref: z.string().trim().max(20).optional(),          // blank = next number for the process, e.g. 09.4
  // Links that tie the step to the rest of the blueprint.
  sow_items: z.array(z.number().int().positive()).max(60).default([]),
  reengineering: z.array(z.string().max(10)).max(30).default([]),
  diagrams: z.array(z.string().max(10)).max(20).default([]),
  process_id: z.string().trim().min(1).max(10),
  step: z.string().trim().min(1).max(300),
  trigger_event: text.default(''), data_fields: text.default(''), handoff: text.default(''), exceptions: text.default(''),
  fit: z.enum(['Standard', 'Configure', 'Extend']),
});

async function getStep(id) {
  const { rows } = await q('SELECT * FROM matrix_steps WHERE id=$1', [id]);
  if (!rows[0]) throw notFound('Matrix step');
  return rows[0];
}

r.post('/', async (req, res) => {
  const b = parse(StepBody, req.body);
  assertCan(req.user, 'matrix', 'add', { processId: b.process_id });
  const row = await tx(async (c) => {
    if (!(await c.query('SELECT 1 FROM processes WHERE id=$1', [b.process_id])).rowCount) throw notFound('Process');
    await assertLinkTargets(c, b);
    let ref = b.ref;
    if (!ref) {   // next free number within the process
      const { rows } = await c.query(
        `SELECT COALESCE(max(NULLIF(substring(ref from '\\.([0-9]+)$'), '')::int), 0) + 1 AS n FROM matrix_steps WHERE process_id=$1`, [b.process_id]);
      ref = `${b.process_id}.${rows[0].n}`;
    }
    // Sits after the process's last step, before the next process's steps.
    const sort = (await c.query(`SELECT COALESCE(max(sort), (SELECT COALESCE(max(sort),0) FROM matrix_steps)) + 1 AS n FROM matrix_steps WHERE process_id=$1`, [b.process_id])).rows[0].n;
    await c.query('UPDATE matrix_steps SET sort = sort + 1 WHERE sort >= $1', [sort]);
    const { rows } = await c.query(
      `INSERT INTO matrix_steps(ref,process_id,step,trigger_event,data_fields,handoff,exceptions,fit,sort,updated_by,sow_items,reengineering,diagrams,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual') RETURNING *`,
      [ref, b.process_id, b.step, b.trigger_event, b.data_fields, b.handoff, b.exceptions, b.fit, sort, req.user.id,
        JSON.stringify(b.sow_items), JSON.stringify(b.reengineering), JSON.stringify(b.diagrams)]);
    await logActivity(c, req.user.id, 'created', 'step', ref, b.step);
    return rows[0];
  });
  res.status(201).json(row);
});

r.put('/:id', async (req, res) => {
  const step = await getStep(req.params.id);
  assertCan(req.user, 'matrix', 'edit', { processId: step.process_id });
  const b = parse(StepBody.omit({ process_id: true }).partial(), req.body);
  if (b.ref !== undefined && !b.ref) delete b.ref;
  const { sets, values } = buildUpdate(b, 1, ['sow_items', 'reengineering', 'diagrams']);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  await tx(async (c) => {
    await assertLinkTargets(c, b);
    values.push(req.user.id, step.id);
    await c.query(`UPDATE matrix_steps SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length}`, values);
    await logActivity(c, req.user.id, 'updated', 'step', step.ref, `Edited ${Object.keys(b).join(', ')}`);
  });
  res.json({ ok: true });
});

r.post('/:id/validate', async (req, res) => {
  const step = await getStep(req.params.id);
  assertCan(req.user, 'matrix', 'edit', { processId: step.process_id });
  const b = parse(z.object({
    status: z.enum(['pending', 'approved', 'changes', 'rework']),
    comment: z.string().trim().max(4000).default(''),
  }), req.body);
  if (b.status !== 'approved' && b.status !== 'pending' && !b.comment) {
    return res.status(400).json({ error: 'Say what needs to change so the team can act on it.' });
  }
  await tx(async (c) => {
    await c.query(
      `UPDATE matrix_steps SET validation_status=$1, validation_comment=$2, validated_by=$3, validated_at=now() WHERE id=$4`,
      [b.status, b.comment, req.user.id, step.id]);
    await logActivity(c, req.user.id, 'validated', 'step', step.ref, `${b.status}${b.comment ? `: ${b.comment}` : ''}`);
  });
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  const step = await getStep(req.params.id);
  assertCan(req.user, 'matrix', 'delete', { processId: step.process_id });
  await tx(async (c) => {
    await c.query('DELETE FROM matrix_steps WHERE id=$1', [step.id]);
    await logActivity(c, req.user.id, 'deleted', 'step', step.ref, step.step);
  });
  res.json({ ok: true });
});

export default r;
