import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan } from '../lib/permissions.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';

const r = Router();

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT r.id, r.title, r.process_refs, r.benefits, r.wave, r.continues, r.impact_type, r.sow_status, r.appendix_ref,
            r.effort_low, r.effort_high, r.offset_low, r.offset_high, r.awb_estimate, r.phi_decision, r.phi_owner, r.target_date,
            r.negotiation_status, r.agreed_treatment, r.kpi, r.target, r.kpi_baseline, r.current_process, r.proposed,
            jsonb_array_length(r.before_steps) AS steps_before, jsonb_array_length(r.after_steps) AS steps_after,
            (SELECT count(*)::int FROM jsonb_array_elements(r.before_steps) s WHERE s->>'tag' IN ('Manual','Paper','Rekey','Wait')) AS manual_before,
            (SELECT count(*)::int FROM jsonb_array_elements(r.after_steps) s WHERE s->>'tag' IN ('Auto','Rule')) AS auto_after,
            (SELECT count(*)::int FROM comments c WHERE c.entity_type='reengineering' AND c.entity_id=r.id) AS comment_count
       FROM reengineering r ORDER BY r.sort, r.id`);
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT r.*, u.name AS updated_by_name FROM reengineering r LEFT JOIN users u ON u.id=r.updated_by WHERE r.id=$1`, [req.params.id]);
  if (!rows[0]) throw notFound('Opportunity');
  const items = rows[0].sow_items.length
    ? (await q('SELECT no, section, feature, dev_days FROM sow_items WHERE no = ANY($1::int[]) ORDER BY no', [rows[0].sow_items])).rows : [];
  const refs = rows[0].process_refs.split(',').map((s) => s.trim()).filter(Boolean);
  const processes = (await q('SELECT p.id, p.name, g.color FROM processes p JOIN process_groups g ON g.id=p.group_id WHERE p.id = ANY($1::text[]) ORDER BY p.sort', [refs])).rows;
  const appendix = rows[0].appendix_ref && rows[0].appendix_ref !== '—'
    ? (await q('SELECT code, title, status FROM sow_appendix WHERE code = ANY($1::text[]) ORDER BY sort',
      [rows[0].appendix_ref.split(',').map((s) => s.trim())])).rows : [];
  const steps = (await q(`SELECT id, ref, step, process_id FROM matrix_steps WHERE reengineering ? $1 ORDER BY sort`, [rows[0].id])).rows;
  res.json({ ...rows[0], items, processes, appendix, steps });
});

const txt = z.string().trim().max(4000);
const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).transform((v) => v || null);
// PHI decision and tracking fields: admins and process owners.
const Decision = z.object({
  phi_decision: z.enum(['', 'Accept', 'Accept with changes', 'Needs discussion', 'Defer', 'Reject']).optional(),
  phi_owner: txt.optional(), target_date: date.optional(), phi_comments: txt.optional(),
  kpi_baseline: txt.optional(), kpi_baseline_date: date.optional(), kpi_agreed_target: txt.optional(), kpi_owner: txt.optional(),
  awb_estimate: z.union([z.number().min(0).max(10000), z.null()]).optional(),
  agreed_treatment: txt.optional(), negotiation_status: txt.optional(),
});
// Content fields: admins only.
const step = z.object({ tag: z.string().max(20), text: z.string().trim().min(1).max(500) });
const Content = z.object({
  title: z.string().trim().min(1).max(200).optional(), process_refs: txt.optional(), current_process: txt.optional(), pain_points: txt.optional(),
  proposed: txt.optional(), justification: txt.optional(), controls: txt.optional(), benefits: txt.optional(), wave: txt.optional(),
  kpi: txt.optional(), target: txt.optional(), why_problem: txt.optional(), how_fixes: txt.optional(), control_effect: txt.optional(),
  what_changes: txt.optional(), roles_affected: txt.optional(), awb_change: txt.optional(), sow_wording: txt.optional(), risk: txt.optional(),
  before_steps: z.array(step).max(30).optional(), after_steps: z.array(step).max(30).optional(),
  effort_low: z.number().min(0).max(1000).optional(), effort_high: z.number().min(0).max(1000).optional(),
});

r.put('/:id', async (req, res) => {
  const decision = parse(Decision, pick(req.body, Object.keys(Decision.shape)));
  const content = parse(Content, pick(req.body, Object.keys(Content.shape)));
  if (Object.keys(decision).length) assertCan(req.user, 'reengineering', 'edit');
  if (Object.keys(content).length) assertCan(req.user, 'reengineering_content', 'edit', {}, 'Your role can update the decision and tracking fields, not the opportunity content.');
  const fields = { ...decision, ...content };
  const { sets, values } = buildUpdate(fields, 1, ['before_steps', 'after_steps']);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  await tx(async (c) => {
    values.push(req.user.id, req.params.id);
    const u = await c.query(`UPDATE reengineering SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length}`, values);
    if (!u.rowCount) throw notFound('Opportunity');
    const summary = decision.phi_decision ? `Decision → ${decision.phi_decision}` : `Updated ${Object.keys(fields).join(', ')}`;
    await logActivity(c, req.user.id, 'updated', 'reengineering', req.params.id, summary);
  });
  res.json({ ok: true });
});

function pick(obj, keys) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keys.includes(k)));
}

export default r;
