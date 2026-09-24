import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCanEditProcess, requireRole } from '../lib/auth.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';

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
  ref: z.string().trim().min(1).max(20),
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
  assertCanEditProcess(req.user, b.process_id);
  const row = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO matrix_steps(ref,process_id,step,trigger_event,data_fields,handoff,exceptions,fit,sort,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(max(sort),0)+1 FROM matrix_steps),$9) RETURNING *`,
      [b.ref, b.process_id, b.step, b.trigger_event, b.data_fields, b.handoff, b.exceptions, b.fit, req.user.id]);
    await logActivity(c, req.user.id, 'created', 'step', b.ref, b.step);
    return rows[0];
  });
  res.status(201).json(row);
});

r.put('/:id', async (req, res) => {
  const step = await getStep(req.params.id);
  assertCanEditProcess(req.user, step.process_id);
  const b = parse(StepBody.omit({ process_id: true }).partial(), req.body);
  const { sets, values } = buildUpdate(b);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  await tx(async (c) => {
    values.push(req.user.id, step.id);
    await c.query(`UPDATE matrix_steps SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length}`, values);
    await logActivity(c, req.user.id, 'updated', 'step', step.ref, `Edited ${Object.keys(b).join(', ')}`);
  });
  res.json({ ok: true });
});

r.post('/:id/validate', async (req, res) => {
  const step = await getStep(req.params.id);
  assertCanEditProcess(req.user, step.process_id);
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

r.delete('/:id', requireRole('admin'), async (req, res) => {
  const step = await getStep(req.params.id);
  await tx(async (c) => {
    await c.query('DELETE FROM matrix_steps WHERE id=$1', [step.id]);
    await logActivity(c, req.user.id, 'deleted', 'step', step.ref, step.step);
  });
  res.json({ ok: true });
});

export default r;
