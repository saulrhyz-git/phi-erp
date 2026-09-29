import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { assertCan } from '../lib/permissions.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';

const r = Router();

r.get('/overview', async (req, res) => {
  const [meta, effort, items, gaps, obs, app, re] = await Promise.all([
    q('SELECT key, value FROM sow_meta'),
    q('SELECT * FROM sow_effort ORDER BY sort'),
    q('SELECT section, sum(dev_days)::float AS dev_days, count(*)::int AS n FROM sow_items GROUP BY section'),
    q(`SELECT kind, rating, status, priority, count(*)::int AS n FROM sow_gaps GROUP BY kind, rating, status, priority`),
    q('SELECT status, count(*)::int AS n FROM sow_observations GROUP BY status'),
    q('SELECT part, status, count(*)::int AS n FROM sow_appendix GROUP BY part, status'),
    q(`SELECT impact_type, count(*)::int AS n, sum(effort_low)::float AS lo, sum(effort_high)::float AS hi,
              sum(offset_low)::float AS olo, sum(offset_high)::float AS ohi FROM reengineering GROUP BY impact_type`),
  ]);
  res.json({
    meta: Object.fromEntries(meta.rows.map((m) => [m.key, m.value])),
    effort: effort.rows.map((e) => ({ ...e, ...Object.fromEntries(['lead', 'ba', 'dev_lead', 'dev', 'qa', 'infra', 'stated_total'].map((k) => [k, e[k] === null ? null : Number(e[k])])) })),
    sections: items.rows, gaps: gaps.rows, observations: obs.rows, appendix: app.rows, reengineering: re.rows,
  });
});

r.get('/items', async (req, res) => {
  const { rows } = await q(
    `SELECT i.*, i.dev_days::float AS dev_days,
            COALESCE((SELECT json_agg(r.id ORDER BY r.id) FROM reengineering r WHERE r.sow_items @> to_jsonb(i.no)), '[]') AS reengineering,
            COALESCE((SELECT json_agg(json_build_object('ref', m.ref, 'process_id', m.process_id) ORDER BY m.sort) FROM matrix_steps m WHERE m.sow_items @> to_jsonb(i.no)), '[]') AS steps
       FROM sow_items i ORDER BY i.no`);
  res.json(rows);
});

r.get('/gaps', async (req, res) => {
  const { rows } = await q(
    `SELECT s.*, p.name AS process_name, g.color, u.name AS updated_by_name,
            (SELECT count(*)::int FROM comments c WHERE c.entity_type='gap' AND c.entity_id=s.id::text) AS comment_count
       FROM sow_gaps s LEFT JOIN processes p ON p.id=s.process_id LEFT JOIN process_groups g ON g.id=p.group_id
       LEFT JOIN users u ON u.id=s.updated_by ORDER BY s.sort`);
  res.json(rows);
});

r.get('/observations', async (req, res) => {
  const { rows } = await q(
    `SELECT o.*, u.name AS updated_by_name,
            (SELECT count(*)::int FROM comments c WHERE c.entity_type='observation' AND c.entity_id=o.id::text) AS comment_count
       FROM sow_observations o LEFT JOIN users u ON u.id=o.updated_by ORDER BY o.sort`);
  res.json(rows);
});

r.get('/appendix', async (req, res) => {
  const { rows } = await q(
    `SELECT a.*, a.vendor_estimate::float AS vendor_estimate, u.name AS updated_by_name
       FROM sow_appendix a LEFT JOIN users u ON u.id=a.updated_by ORDER BY a.sort`);
  res.json(rows);
});

const t = z.string().trim().max(4000);
const TABLES = {
  gaps: { table: 'sow_gaps', entity: 'gap', label: 'ref', schema: z.object({ phi_response: t, vendor_response: t, status: z.string().trim().max(60), rating: z.enum(['Covered', 'Partial', 'Not covered']), priority: z.string().max(20), action: t }).partial() },
  observations: { table: 'sow_observations', entity: 'observation', label: 'code', schema: z.object({ owner: t, vendor_response: t, status: z.string().trim().max(60) }).partial() },
  appendix: { table: 'sow_appendix', entity: 'appendix', label: 'code', schema: z.object({ vendor_response: t, status: z.string().trim().max(60), vendor_estimate: z.union([z.number().min(0).max(10000), z.null()]) }).partial() },
};

for (const [path, cfg] of Object.entries(TABLES)) {
  r.put(`/${path}/:id`, async (req, res) => {
    assertCan(req.user, 'sow', 'edit');
    const b = parse(cfg.schema, req.body);
    const { sets, values } = buildUpdate(b);
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    values.push(req.user.id, req.params.id);
    const u = await q(`UPDATE ${cfg.table} SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length} RETURNING ${cfg.label} AS label`, values);
    if (!u.rowCount) throw notFound('Record');
    await logActivity({ query: q }, req.user.id, 'updated', cfg.entity, u.rows[0].label, b.status ? `Status → ${b.status}` : `Updated ${Object.keys(b).join(', ')}`);
    res.json({ ok: true });
  });
}

export default r;
