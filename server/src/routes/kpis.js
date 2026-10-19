// Customer Requirements (KPI): the end in mind. Each KPI is defined first, then every process, output,
// hand-off step, data object and report is mapped back to it.
import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan, can, forbidden } from '../lib/permissions.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';
import { LINK_TYPES, kpiHealth, linkOptions, nextCode, resolveLinks, setLinks } from '../lib/trace.js';
import { buildKpiSwimlane } from '../lib/kpiSwimlane.js';

const r = Router();

const PROC_SQL = `
  SELECT kp.kpi_id, kp.process_id, kp.role, kp.outputs, p.name, p.outputs AS process_outputs, p.domain_id, g.color
    FROM kpi_processes kp JOIN processes p ON p.id=kp.process_id JOIN process_groups g ON g.id=p.group_id`;

async function loadProcesses(db, kpiIds) {
  const { rows } = await db.query(`${PROC_SQL} WHERE kp.kpi_id = ANY($1::text[]) ORDER BY kp.role DESC, p.sort`, [kpiIds]);
  const out = Object.fromEntries(kpiIds.map((id) => [id, []]));
  for (const x of rows) {
    // An output renamed or removed on the process since it was chosen is reported, not silently dropped.
    const stale = (x.outputs || []).filter((o) => !(x.process_outputs || []).includes(o));
    out[x.kpi_id].push({ process_id: x.process_id, name: x.name, color: x.color, domain_id: x.domain_id, role: x.role, outputs: x.outputs || [], stale_outputs: stale });
  }
  return out;
}

const KPI_SQL = `SELECT k.*, d.name AS domain_name, u.name AS updated_by_name,
  (SELECT count(*)::int FROM comments c WHERE c.entity_type='kpi' AND c.entity_id=k.id) AS comment_count
  FROM kpis k LEFT JOIN domains d ON d.id=k.domain_id LEFT JOIN users u ON u.id=k.updated_by`;

r.get('/', async (req, res) => {
  const { rows } = await q(`${KPI_SQL} ORDER BY k.sort, k.id`);
  const ids = rows.map((k) => k.id);
  const [procs, links] = await Promise.all([loadProcesses({ query: q }, ids), resolveLinks({ query: q }, req.user, 'kpi', ids)]);
  res.json(rows.map((k) => ({ ...k, processes: procs[k.id], links: links[k.id], health: kpiHealth(k, procs[k.id], links[k.id]) })));
});

// Everything a KPI can be mapped to, plus the processes with their COPIS outputs and the domains.
r.get('/options', async (req, res) => {
  const [opts, procs, domains, customers] = await Promise.all([
    linkOptions({ query: q }, req.user, LINK_TYPES.kpi),
    q(`SELECT p.id, p.name, p.outputs, p.customers, p.domain_id, g.color, COALESCE(s.name, 'Cross-cutting') AS stage
         FROM processes p JOIN process_groups g ON g.id=p.group_id LEFT JOIN stages s ON s.id=p.stage_id ORDER BY p.sort`),
    q('SELECT id, name FROM domains ORDER BY sort, id'),
    q(`SELECT DISTINCT x AS name FROM (SELECT customer AS x FROM kpis UNION SELECT jsonb_array_elements_text(customers) FROM processes) c WHERE x <> '' ORDER BY 1`),
  ]);
  res.json({ ...opts, processes: procs.rows, domains: domains.rows, customers: customers.rows.map((c) => c.name) });
});

r.get('/:id', async (req, res) => {
  const { rows } = await q(`${KPI_SQL} WHERE k.id=$1`, [req.params.id]);
  if (!rows[0]) throw notFound('KPI');
  const k = rows[0];
  const db = { query: q };
  const [procs, links] = await Promise.all([loadProcesses(db, [k.id]), resolveLinks(db, req.user, 'kpi', [k.id])]);
  const pids = procs[k.id].map((p) => p.process_id);
  // The COPIS of every mapped process, read under the KPI, plus its hand-off steps.
  const [copis, steps, reportProcs] = await Promise.all([
    q(`SELECT p.id, p.owner_dept, p.customers, p.outputs, p.steps, p.inputs, p.suppliers, COALESCE(s.name, 'Cross-cutting') AS stage,
              COALESCE((SELECT json_agg(u.name ORDER BY u.name) FROM process_owners po JOIN users u ON u.id=po.user_id WHERE po.process_id=p.id), '[]') AS owners
         FROM processes p LEFT JOIN stages s ON s.id=p.stage_id WHERE p.id = ANY($1::text[])`, [pids]),
    q('SELECT id::text AS id, ref, step, process_id, validation_status, fit FROM matrix_steps WHERE process_id = ANY($1::text[]) ORDER BY sort, ref', [pids]),
    q(`SELECT t.from_id AS report_id, t.to_id AS process_id FROM trace_links t
        WHERE t.from_type='report' AND t.to_type='process' AND t.from_id = ANY($1::text[])`, [(links[k.id].report || []).map((x) => x.id)]),
  ]);
  // `outputs` on a mapped process means the proving outputs; its full COPIS outputs go in copis_outputs.
  const byId = Object.fromEntries(copis.rows.map(({ outputs, ...p }) => [p.id, { ...p, copis_outputs: outputs }]));
  const linkedSteps = new Set((links[k.id].step || []).map((s) => s.id));
  const processes = procs[k.id].map((p) => ({
    ...byId[p.process_id], ...p,
    hand_off_steps: steps.rows.filter((s) => s.process_id === p.process_id).map((s) => ({ ...s, linked: linkedSteps.has(s.id) })),
  }));
  const reports = (links[k.id].report || []).map((rep) => ({ ...rep, processes: reportProcs.rows.filter((x) => x.report_id === rep.id).map((x) => x.process_id) }));
  res.json({
    ...k, processes, links: { ...links[k.id], report: reports }, health: kpiHealth(k, procs[k.id], links[k.id]),
    can_edit: can(req.user, 'kpis', 'edit', { domain: k.domain_id }), can_delete: can(req.user, 'kpis', 'delete', { domain: k.domain_id }),
  });
});

const txt = (n) => z.string().trim().max(n);
const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'), z.literal(''), z.null()]).transform((v) => v || null);
const Fields = {
  customer: z.string().trim().min(1, 'Name the customer who requires it').max(200),
  requirement: z.string().trim().min(1, 'Describe what the customer requires').max(1000),
  name: z.string().trim().min(1, 'Name the KPI (how the requirement is measured)').max(300),
  definition: txt(2000), unit: txt(60), direction: z.enum(['', 'Lower is better', 'Higher is better', 'Hit the target']),
  baseline: txt(200), baseline_date: date, target: txt(200), frequency: txt(100), data_source: txt(1000), owner: txt(200),
  domain_id: z.union([z.string().max(10), z.null()]),
  priority: z.enum(['High', 'Medium', 'Low']), status: z.enum(['Draft', 'Validated', 'Retired']), notes: txt(4000),
};
const ProcLink = z.object({
  process_id: z.string().max(10),
  role: z.enum(['Produces', 'Contributes']).default('Produces'),
  outputs: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
});
const Links = z.object(Object.fromEntries(LINK_TYPES.kpi.map((t) => [t, z.array(z.union([z.string(), z.number()])).max(200).optional()]))).partial();

// Proving outputs must be outputs of that process, as written in its COPIS.
function assertOutputs(processId, processOutputs, chosen) {
  const missing = chosen.filter((o) => !(processOutputs || []).includes(o));
  if (missing.length) {
    const e = new Error(`“${missing[0]}” is not an output of process ${processId}. Add it to the process's COPIS outputs first.`); e.status = 400; throw e;
  }
}

async function setProcesses(c, kpiId, list) {
  const ids = [...new Set(list.map((p) => p.process_id))];
  if (ids.length) {
    const { rows } = await c.query('SELECT id, outputs FROM processes WHERE id = ANY($1::text[])', [ids]);
    if (rows.length !== ids.length) { const e = new Error('One of the selected processes does not exist.'); e.status = 400; throw e; }
    const outs = Object.fromEntries(rows.map((p) => [p.id, p.outputs]));
    for (const p of list) assertOutputs(p.process_id, outs[p.process_id], p.outputs);
  }
  await c.query('DELETE FROM kpi_processes WHERE kpi_id=$1 AND NOT (process_id = ANY($2::text[]))', [kpiId, ids]);
  for (const p of list) {
    await c.query(
      `INSERT INTO kpi_processes(kpi_id, process_id, role, outputs) VALUES ($1,$2,$3,$4)
       ON CONFLICT (kpi_id, process_id) DO UPDATE SET role=EXCLUDED.role, outputs=EXCLUDED.outputs`,
      [kpiId, p.process_id, p.role, JSON.stringify([...new Set(p.outputs)])]);
  }
}

async function assertDomain(c, domainId) {
  if (domainId && !(await c.query('SELECT 1 FROM domains WHERE id=$1', [domainId])).rowCount) {
    const e = new Error('That domain does not exist.'); e.status = 400; throw e;
  }
}

r.post('/', async (req, res) => {
  const b = parse(z.object({
    ...Fields,
    definition: Fields.definition.default(''), unit: Fields.unit.default(''), direction: Fields.direction.default(''),
    baseline: Fields.baseline.default(''), baseline_date: date.default(null), target: Fields.target.default(''), frequency: Fields.frequency.default(''),
    data_source: Fields.data_source.default(''), owner: Fields.owner.default(''), domain_id: Fields.domain_id.default(null),
    priority: Fields.priority.default('Medium'), status: Fields.status.default('Draft'), notes: Fields.notes.default(''),
    processes: z.array(ProcLink).max(40).default([]), links: Links.default({}),
  }), req.body);
  assertCan(req.user, 'kpis', 'add', { domain: b.domain_id },
    b.domain_id ? `You can only add KPIs in your own domain — ${b.domain_id} is not.` : 'Choose one of your domains for this KPI. Only a Project Manager can add project-wide KPIs.');
  const out = await tx(async (c) => {
    await assertDomain(c, b.domain_id);
    const id = await nextCode(c, 'kpis', 'KPI');
    const { processes, links, ...f } = b;
    const sort = (await c.query('SELECT COALESCE(max(sort),0)+1 AS n FROM kpis')).rows[0].n;
    await c.query(
      `INSERT INTO kpis(id, customer, requirement, name, definition, unit, direction, baseline, baseline_date, target, frequency, data_source,
                        owner, domain_id, priority, status, notes, sort, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)`,
      [id, f.customer, f.requirement, f.name, f.definition, f.unit, f.direction, f.baseline, f.baseline_date, f.target, f.frequency, f.data_source,
        f.owner, f.domain_id, f.priority, f.status, f.notes, sort, req.user.id]);
    await setProcesses(c, id, processes);
    await setLinks(c, req.user, 'kpi', id, links);
    await logActivity(c, req.user.id, 'created', 'kpi', id, `Added ${id} ${f.name} (${f.customer})`);
    return { id };
  });
  res.status(201).json(out);
});

r.put('/:id', async (req, res) => {
  const b = parse(z.object({ ...Fields, processes: z.array(ProcLink).max(40), links: Links }).partial(), req.body);
  await tx(async (c) => {
    const cur = (await c.query('SELECT id, domain_id, name FROM kpis WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!cur) throw notFound('KPI');
    assertCan(req.user, 'kpis', 'edit', { domain: cur.domain_id },
      cur.domain_id ? `You can only edit KPIs in your own domain — ${req.params.id} is in ${cur.domain_id}.` : 'Only a Project Manager can edit project-wide KPIs.');
    if (b.domain_id !== undefined && b.domain_id !== cur.domain_id) {
      assertCan(req.user, 'kpis', 'edit', { domain: b.domain_id }, 'You can only move a KPI into one of your own domains.');
      await assertDomain(c, b.domain_id);
    }
    const { processes, links, ...f } = b;
    const { sets, values } = buildUpdate(f, 1);
    if (sets.length) {
      values.push(req.user.id, req.params.id);
      await c.query(`UPDATE kpis SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length}`, values);
    }
    if (processes) await setProcesses(c, req.params.id, processes);
    if (links) await setLinks(c, req.user, 'kpi', req.params.id, links);
    if (!sets.length && !processes && !links) { const e = new Error('Nothing to update.'); e.status = 400; throw e; }
    const what = [...Object.keys(f), ...(processes ? ['processes'] : []), ...(links ? Object.keys(links).map((t) => `${t} links`) : [])];
    await logActivity(c, req.user.id, 'updated', 'kpi', req.params.id, f.status ? `Status → ${f.status}` : `Updated ${what.join(', ')}`);
  });
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  await tx(async (c) => {
    const cur = (await c.query('SELECT domain_id, name FROM kpis WHERE id=$1', [req.params.id])).rows[0];
    if (!cur) throw notFound('KPI');
    assertCan(req.user, 'kpis', 'delete', { domain: cur.domain_id });
    await c.query('DELETE FROM kpis WHERE id=$1', [req.params.id]);
    await logActivity(c, req.user.id, 'deleted', 'kpi', req.params.id, `Removed ${req.params.id} ${cur.name}`);
  });
  res.json({ ok: true });
});

// From the process page: which KPIs this process serves, its role and the outputs that prove each one.
// Process owners decide this for their own processes, whichever domain the KPI sits in.
r.put('/by-process/:processId', async (req, res) => {
  const pid = req.params.processId;
  if (!can(req.user, 'processes', 'edit', { processId: pid })) throw forbidden(`You can only map KPIs to processes assigned to you or in your domain(s) — ${pid} is not.`);
  const { kpis } = parse(z.object({ kpis: z.array(z.object({
    kpi_id: z.string().max(20), role: ProcLink.shape.role, outputs: ProcLink.shape.outputs,
  })).max(60) }), req.body);
  await tx(async (c) => {
    const proc = (await c.query('SELECT outputs FROM processes WHERE id=$1', [pid])).rows[0];
    if (!proc) throw notFound('Process');
    for (const k of kpis) assertOutputs(pid, proc.outputs, k.outputs);
    const ids = [...new Set(kpis.map((k) => k.kpi_id))];
    if (ids.length && (await c.query('SELECT count(*)::int AS n FROM kpis WHERE id = ANY($1::text[])', [ids])).rows[0].n !== ids.length) {
      const e = new Error('One of the selected KPIs does not exist.'); e.status = 400; throw e;
    }
    await c.query('DELETE FROM kpi_processes WHERE process_id=$1 AND NOT (kpi_id = ANY($2::text[]))', [pid, ids]);
    for (const k of kpis) {
      await c.query(
        `INSERT INTO kpi_processes(kpi_id, process_id, role, outputs) VALUES ($1,$2,$3,$4)
         ON CONFLICT (kpi_id, process_id) DO UPDATE SET role=EXCLUDED.role, outputs=EXCLUDED.outputs`,
        [k.kpi_id, pid, k.role, JSON.stringify([...new Set(k.outputs)])]);
    }
    await logActivity(c, req.user.id, 'updated', 'process', pid, `KPIs served: ${ids.join(', ') || 'none'}`);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Swimlanes from the KPI: one BPMN diagram per KPI (diagram id = KPI id), built from the mapped processes'
// COPIS steps in value-chain order, a lane per accountable department, the proving outputs as data objects
// and the measurement steps as annotations. Regenerating saves a new version; older versions can be restored.
async function generateSwimlane(c, user, kpiId) {
  const k = (await c.query('SELECT * FROM kpis WHERE id=$1', [kpiId])).rows[0];
  if (!k) throw notFound('KPI');
  const { rows: procs } = await c.query(
    `SELECT p.id, p.name, p.owner_dept, p.steps, p.outputs AS copis_outputs, kp.role, kp.outputs
       FROM kpi_processes kp JOIN processes p ON p.id=kp.process_id WHERE kp.kpi_id=$1 ORDER BY p.sort`, [kpiId]);
  if (!procs.length) { const e = new Error(`Map ${kpiId} to at least one process first — the swimlane is built from their steps.`); e.status = 400; throw e; }
  const { rows: measured } = await c.query(
    `SELECT m.process_id, m.ref, m.step FROM trace_links t JOIN matrix_steps m ON m.id::text=t.to_id
      WHERE t.from_type='kpi' AND t.from_id=$1 AND t.to_type='step' ORDER BY m.sort, m.ref`, [kpiId]);
  const processes = procs.map((p) => ({
    id: p.id, name: p.name, owner_dept: p.owner_dept, role: p.role, steps: p.steps || [],
    proving: (p.outputs || []).filter((o) => (p.copis_outputs || []).includes(o)),
    measured: measured.filter((m) => m.process_id === p.id).map((m) => `${m.ref} ${m.step}`),
  }));
  const xml = buildKpiSwimlane(k, processes);
  const title = `${k.id} · ${k.name}`.slice(0, 200);
  const covers = processes.map((p) => `${p.id} ${p.name}`).join(' · ');
  const description = `Generated from ${k.id}: ${k.customer} requires “${k.requirement}”. Lanes are the departments of the mapped processes; regenerate from the KPI after the mapping changes.`;
  const cur = (await c.query('SELECT current_version FROM diagrams WHERE id=$1 FOR UPDATE', [k.id])).rows[0];
  let version;
  if (cur) {
    version = cur.current_version + 1;
    await c.query('UPDATE diagrams SET title=$1, covers=$2, description=$3, current_version=$4 WHERE id=$5', [title, covers, description, version, k.id]);
  } else {
    version = 1;
    await c.query(
      `INSERT INTO diagrams(id, title, covers, description, file_name, sort, current_version)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(max(sort),0)+1 FROM diagrams),1)`,
      [k.id, title, covers, description, `PHI_${k.id}_swimlane.bpmn`]);
  }
  await c.query('INSERT INTO diagram_versions(diagram_id, version, xml, note, created_by) VALUES ($1,$2,$3,$4,$5)',
    [k.id, version, xml, cur ? `Regenerated from ${k.id} (${processes.length} process${processes.length === 1 ? '' : 'es'})` : `Generated from ${k.id}`, user.id]);
  for (const p of processes) await c.query('INSERT INTO process_diagrams(process_id, diagram_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [p.id, k.id]);
  await c.query("INSERT INTO trace_links(from_type, from_id, to_type, to_id) VALUES ('kpi',$1,'diagram',$1) ON CONFLICT DO NOTHING", [k.id]);
  await logActivity(c, user.id, cur ? 'saved_version' : 'created', 'diagram', k.id, `${cur ? `v${version} regenerated` : 'Generated'} from ${k.id} ${k.name}`);
  return { diagram_id: k.id, version, created: !cur, processes: processes.length };
}

// All active KPIs that have at least one process (Project Manager / anyone who may edit every diagram).
r.post('/swimlanes/generate', async (req, res) => {
  assertCan(req.user, 'diagrams', 'edit');
  const ids = (await q(`SELECT k.id FROM kpis k WHERE k.status <> 'Retired' AND EXISTS (SELECT 1 FROM kpi_processes kp WHERE kp.kpi_id=k.id) ORDER BY k.sort, k.id`)).rows.map((x) => x.id);
  const done = [];
  for (const id of ids) done.push(await tx((c) => generateSwimlane(c, req.user, id)));
  res.json({ generated: done.length, created: done.filter((d) => d.created).length, diagrams: done });
});

r.post('/:id/swimlane', async (req, res) => {
  assertCan(req.user, 'diagrams', 'edit', {}, 'Your role cannot create or edit swimlane diagrams.');
  res.json(await tx((c) => generateSwimlane(c, req.user, req.params.id)));
});

export default r;
