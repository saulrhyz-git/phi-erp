import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan, can } from '../lib/permissions.js';
import { assertLinkTargets, currentLinks, setProcessLinks } from '../lib/links.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';

const r = Router();

const LIST_SQL = `
  SELECT p.*, g.name AS group_name, g.color, s.name AS stage_name, s.sort AS stage_sort,
    (SELECT count(*)::int FROM matrix_steps m WHERE m.process_id=p.id) AS step_count,
    (SELECT count(*)::int FROM matrix_steps m WHERE m.process_id=p.id AND m.validation_status='approved') AS approved_count,
    (SELECT count(*)::int FROM matrix_steps m WHERE m.process_id=p.id AND m.validation_status IN ('changes','rework')) AS flagged_count,
    COALESCE((SELECT json_agg(json_build_object('id',u.id,'name',u.name) ORDER BY u.name)
                FROM process_owners po JOIN users u ON u.id=po.user_id WHERE po.process_id=p.id), '[]') AS owners,
    uu.name AS updated_by_name, dm.name AS domain_name
  FROM processes p
  LEFT JOIN domains dm ON dm.id=p.domain_id
  JOIN process_groups g ON g.id=p.group_id
  LEFT JOIN stages s ON s.id=p.stage_id
  LEFT JOIN users uu ON uu.id=p.updated_by`;

r.get('/', async (req, res) => {
  const { rows } = await q(`${LIST_SQL} ORDER BY p.sort`);
  res.json(rows);
});

// Everything a process or hand-off step can be mapped to (for the pickers).
r.get('/options', async (req, res) => {
  const [groups, stages, domains, diagrams, reeng, items] = await Promise.all([
    q('SELECT id, name, color FROM process_groups ORDER BY sort'),
    q('SELECT id, name FROM stages ORDER BY sort'),
    q('SELECT id, name FROM domains ORDER BY sort, id'),
    q('SELECT id, title FROM diagrams ORDER BY sort'),
    q('SELECT id, title FROM reengineering ORDER BY sort'),
    q('SELECT no, section, feature FROM sow_items ORDER BY no'),
  ]);
  res.json({ groups: groups.rows, stages: stages.rows, domains: domains.rows, diagrams: diagrams.rows, reengineering: reeng.rows, sow_items: items.rows });
});

r.get('/:id', async (req, res) => {
  const { rows } = await q(`${LIST_SQL} WHERE p.id=$1`, [req.params.id]);
  if (!rows[0]) throw notFound('Process');
  const steps = await q(
    `SELECT m.*, u.name AS validated_by_name FROM matrix_steps m LEFT JOIN users u ON u.id=m.validated_by
      WHERE m.process_id=$1 ORDER BY m.sort, m.ref`, [req.params.id]);
  const diagrams = await q(`SELECT d.id, d.title FROM process_diagrams pd JOIN diagrams d ON d.id=pd.diagram_id WHERE pd.process_id=$1 ORDER BY d.sort`, [req.params.id]);
  const links = await currentLinks({ query: q }, req.params.id);
  const reeng = await q(
    `SELECT id, title, wave, impact_type, phi_decision FROM reengineering
      WHERE $1 = ANY(string_to_array(replace(process_refs,' ',''), ',')) OR process_refs='All' ORDER BY sort`, [req.params.id]);
  const gap = await q('SELECT id, rating, gaps, action, priority, status FROM sow_gaps WHERE process_id=$1', [req.params.id]);
  const items = await q('SELECT no, section, feature FROM sow_items WHERE no = ANY($1::int[]) ORDER BY no', [links.sow_items]);
  res.json({ ...rows[0], matrix: steps.rows, diagrams: diagrams.rows, reengineering: reeng.rows, sow_gap: gap.rows[0] || null,
    links, sow_items: items.rows, can_manage: can(req.user, 'processes', 'add') });
});

const list = z.array(z.string().trim().min(1).max(500)).max(40);
const CustomerRequirement = z.object({
  customer: z.string().trim().min(1, 'Each requirement needs a customer').max(200),
  requirement: z.string().trim().min(1, 'Describe what the customer requires').max(600),
  measure: z.string().trim().max(300).default(''),
  target: z.string().trim().max(200).default(''),
  status: z.enum(['Draft', 'Validated']).default('Draft'),
  source: z.string().trim().max(60).default(''),
});
const Links = {
  diagrams: z.array(z.string().max(10)).max(20).optional(),
  reengineering: z.array(z.string().max(10)).max(50).optional(),
  sow_items: z.array(z.number().int().positive()).max(150).optional(),
};
// World-map placement: only Project Managers / Superadmins (the "add processes" right).
const Placement = {
  group_id: z.string().max(10).optional(),
  stage_id: z.union([z.number().int(), z.null()]).optional(),     // null = cross-cutting (below the stages)
  domain_id: z.union([z.string().max(10), z.null()]).optional(),
};
const ProcessUpdate = z.object({
  ...Links, ...Placement,
  customer_requirements: z.array(CustomerRequirement).max(30).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  owner_dept: z.string().trim().max(200).optional(),
  odoo_home: z.string().trim().max(1000).optional(),
  fit: z.enum(['Standard', 'Configure', 'Extend']).optional(),
  suppliers: list.optional(), inputs: list.optional(), steps: list.optional(), outputs: list.optional(), customers: list.optional(),
});

r.put('/:id', async (req, res) => {
  assertCan(req.user, 'processes', 'edit', { processId: req.params.id });
  const { diagrams, reengineering, sow_items: items, ...body } = parse(ProcessUpdate, req.body);
  if (['group_id', 'stage_id', 'domain_id'].some((k) => body[k] !== undefined)) {
    assertCan(req.user, 'processes', 'add', {}, 'Only the Project Manager or a Superadmin can move a process on the world map or change its domain.');
  }
  const links = { diagrams, reengineering, sow_items: items };
  const hasLinks = Object.values(links).some((v) => v !== undefined);
  const { sets, values } = buildUpdate(body, 1, ['suppliers', 'inputs', 'steps', 'outputs', 'customers', 'customer_requirements']);
  if (!sets.length && !hasLinks) return res.status(400).json({ error: 'Nothing to update.' });
  await tx(async (c) => {
    const cur = await c.query('SELECT 1 FROM processes WHERE id=$1', [req.params.id]);
    if (!cur.rowCount) throw notFound('Process');
    if (sets.length) {
      values.push(req.user.id, req.params.id);
      await c.query(`UPDATE processes SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length}`, values);
    }
    if (hasLinks) { await assertLinkTargets(c, links); await setProcessLinks(c, req.params.id, links); }
    await logActivity(c, req.user.id, 'updated', 'process', req.params.id,
      `Updated ${[...Object.keys(body), ...Object.keys(links).filter((k) => links[k] !== undefined).map((k) => `${k} links`)].join(', ')}`);
  });
  res.json({ ok: true });
});

// Add a process to the world map (Project Manager / Superadmin only).
r.post('/', async (req, res) => {
  assertCan(req.user, 'processes', 'add', {}, 'Only the Project Manager or a Superadmin can add processes to the world map.');
  const b = parse(z.object({
    id: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, 'Process ID: 1–4 letters or digits, e.g. 20 or X3'),
    name: z.string().trim().min(3).max(200),
    group_id: z.string().max(10),
    stage_id: z.union([z.number().int(), z.null()]),
    domain_id: z.union([z.string().max(10), z.null()]).default(null),
    owner_dept: z.string().trim().max(200).default(''),
    odoo_home: z.string().trim().max(1000).default(''),
    fit: z.enum(['Standard', 'Configure', 'Extend']).default('Configure'),
    customers: list.default([]), outputs: list.default([]), steps: list.default([]), inputs: list.default([]), suppliers: list.default([]),
    diagrams: Links.diagrams.default([]), reengineering: Links.reengineering.default([]), sow_items: Links.sow_items.default([]),
  }), req.body);
  const out = await tx(async (c) => {
    if ((await c.query('SELECT 1 FROM processes WHERE id=$1', [b.id])).rowCount) { const e = new Error(`Process ${b.id} already exists.`); e.status = 409; throw e; }
    if (!(await c.query('SELECT 1 FROM process_groups WHERE id=$1', [b.group_id])).rowCount) { const e = new Error('Choose a domain colour group.'); e.status = 400; throw e; }
    const links = { diagrams: b.diagrams, reengineering: b.reengineering, sow_items: b.sow_items };
    await assertLinkTargets(c, links);
    // Place it after the last process in the same stage so the world map keeps its order.
    const sort = (await c.query(
      `SELECT COALESCE(max(sort), (SELECT COALESCE(max(sort),0) FROM processes)) + 1 AS n FROM processes WHERE stage_id IS NOT DISTINCT FROM $1`, [b.stage_id])).rows[0].n;
    await c.query('UPDATE processes SET sort = sort + 1 WHERE sort >= $1', [sort]);
    await c.query(
      `INSERT INTO processes(id, group_id, stage_id, domain_id, name, owner_dept, odoo_home, fit, sort, suppliers, inputs, steps, outputs, customers,
                             source, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'manual',$15,$15)`,
      [b.id, b.group_id, b.stage_id, b.domain_id, b.name, b.owner_dept, b.odoo_home, b.fit, sort,
        JSON.stringify(b.suppliers), JSON.stringify(b.inputs), JSON.stringify(b.steps), JSON.stringify(b.outputs), JSON.stringify(b.customers), req.user.id]);
    await setProcessLinks(c, b.id, links);
    // Keep the SOW gap analysis complete: every process has a coverage row.
    await c.query(
      `INSERT INTO sow_gaps(ref, kind, process_id, requirement, sow_coverage, rating, gaps, action, priority, status, sort, updated_by)
       VALUES ($1,'process',$1,'','Not yet assessed','Not assessed','Added in the app — not yet assessed against the AWB SOW.',
               'Assess this process against SOW S343096 and record the coverage.','Medium','Open',
               (SELECT COALESCE(max(sort),0)+1 FROM sow_gaps WHERE kind='process'),$2)
       ON CONFLICT (ref) DO NOTHING`, [b.id, req.user.id]);
    await logActivity(c, req.user.id, 'created', 'process', b.id, `Added ${b.id} ${b.name} to the world map`);
    return { id: b.id };
  });
  res.status(201).json(out);
});

// Remove a process that was added in the app (Project Manager / Superadmin). Blueprint processes stay.
r.delete('/:id', async (req, res) => {
  assertCan(req.user, 'processes', 'delete', {}, 'Only the Project Manager or a Superadmin can remove processes.');
  await tx(async (c) => {
    const { rows } = await c.query('SELECT name, source FROM processes WHERE id=$1', [req.params.id]);
    if (!rows[0]) throw notFound('Process');
    if (rows[0].source !== 'manual') { const e = new Error('Only processes added in the app can be removed. Blueprint processes stay on the map.'); e.status = 400; throw e; }
    const n = (await c.query('SELECT count(*)::int AS n FROM matrix_steps WHERE process_id=$1', [req.params.id])).rows[0].n;
    if (n) { const e = new Error(`Remove its ${n} hand-off step(s) first.`); e.status = 400; throw e; }
    await setProcessLinks(c, req.params.id, { reengineering: [], sow_items: [] });
    await c.query('DELETE FROM sow_gaps WHERE process_id=$1', [req.params.id]);
    await c.query('DELETE FROM processes WHERE id=$1', [req.params.id]);
    await logActivity(c, req.user.id, 'deleted', 'process', req.params.id, `Removed ${req.params.id} ${rows[0].name} from the world map`);
  });
  res.json({ ok: true });
});

export default r;
