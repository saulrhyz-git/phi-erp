// Reports register: every report, dashboard, statement and alert the business needs — defined before it
// is built, tied to the KPIs it shows, the processes that produce its data, and the UAT that proves it.
import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan, can } from '../lib/permissions.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';
import { LINK_TYPES, linkOptions, nextCode, resolveLinks, setLinks } from '../lib/trace.js';

const r = Router();
export const REPORT_TYPES = ['Dashboard', 'Report', 'Statement', 'Statutory form', 'Export', 'Alert'];
export const REPORT_STATUSES = ['Proposed', 'Specified', 'Built', 'Tested', 'Live', 'Retired'];

const SQL = `SELECT r.*, d.name AS domain_name, u.name AS updated_by_name,
  (SELECT count(*)::int FROM comments c WHERE c.entity_type='report' AND c.entity_id=r.id) AS comment_count
  FROM reports r LEFT JOIN domains d ON d.id=r.domain_id LEFT JOIN users u ON u.id=r.updated_by`;

// KPIs shown by each report (stored on the KPI side of trace_links).
async function kpisOf(ids) {
  const out = Object.fromEntries(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const { rows } = await q(
    `SELECT t.to_id AS report_id, k.id, k.name, k.status FROM trace_links t JOIN kpis k ON k.id=t.from_id
      WHERE t.from_type='kpi' AND t.to_type='report' AND t.to_id = ANY($1::text[]) ORDER BY k.sort, k.id`, [ids]);
  for (const x of rows) out[x.report_id].push({ id: x.id, label: x.name, hint: x.status });
  return out;
}

async function decorate(req, rows) {
  const ids = rows.map((x) => x.id);
  const [links, kpis] = await Promise.all([resolveLinks({ query: q }, req.user, 'report', ids), kpisOf(ids)]);
  return rows.map((x) => ({ ...x, links: { ...links[x.id], kpi: kpis[x.id] } }));
}

r.get('/', async (req, res) => {
  const { rows } = await q(`${SQL} ORDER BY r.sort, r.id`);
  res.json(await decorate(req, rows));
});

r.get('/options', async (req, res) => {
  const [opts, kpis, domains] = await Promise.all([
    linkOptions({ query: q }, req.user, LINK_TYPES.report),
    q('SELECT id AS value, name AS label, customer AS hint FROM kpis ORDER BY sort, id'),
    q('SELECT id, name FROM domains ORDER BY sort, id'),
  ]);
  res.json({ ...opts, kpi: kpis.rows, domains: domains.rows, types: REPORT_TYPES, statuses: REPORT_STATUSES });
});

r.get('/:id', async (req, res) => {
  const { rows } = await q(`${SQL} WHERE r.id=$1`, [req.params.id]);
  if (!rows[0]) throw notFound('Report');
  const [rep] = await decorate(req, rows);
  res.json({ ...rep, can_edit: can(req.user, 'reports', 'edit', { domain: rep.domain_id }), can_delete: can(req.user, 'reports', 'delete', { domain: rep.domain_id }) });
});

const txt = (n) => z.string().trim().max(n);
const Fields = {
  name: z.string().trim().min(2, 'Name the report').max(200),
  type: z.enum(REPORT_TYPES), purpose: txt(2000), audience: txt(300), frequency: txt(100), format: txt(200),
  contents: txt(4000), data_sources: txt(2000), owner: txt(200), domain_id: z.union([z.string().max(10), z.null()]),
  status: z.enum(REPORT_STATUSES), notes: txt(4000),
};
const ids = z.array(z.union([z.string(), z.number()])).max(200);
const Links = z.object({ ...Object.fromEntries(LINK_TYPES.report.map((t) => [t, ids.optional()])), kpi: ids.optional() }).partial();

// Report ↔ KPI is stored from the KPI side; editing it from the report replaces this report's KPIs.
async function setKpis(c, reportId, kpiIds) {
  const want = [...new Set(kpiIds.map(String))];
  if (want.length && (await c.query('SELECT count(*)::int AS n FROM kpis WHERE id = ANY($1::text[])', [want])).rows[0].n !== want.length) {
    const e = new Error('One of the selected KPIs does not exist.'); e.status = 400; throw e;
  }
  await c.query("DELETE FROM trace_links WHERE from_type='kpi' AND to_type='report' AND to_id=$1 AND NOT (from_id = ANY($2::text[]))", [reportId, want]);
  for (const k of want) await c.query("INSERT INTO trace_links(from_type, from_id, to_type, to_id) VALUES ('kpi',$1,'report',$2) ON CONFLICT DO NOTHING", [k, reportId]);
}

async function assertDomain(c, domainId) {
  if (domainId && !(await c.query('SELECT 1 FROM domains WHERE id=$1', [domainId])).rowCount) { const e = new Error('That domain does not exist.'); e.status = 400; throw e; }
}

r.post('/', async (req, res) => {
  const b = parse(z.object({
    ...Object.fromEntries(Object.entries(Fields).map(([k, v]) => [k, k === 'name' ? v : v.optional()])), links: Links.default({}),
  }), req.body);
  const f = { type: 'Report', purpose: '', audience: '', frequency: '', format: '', contents: '', data_sources: '', owner: '', domain_id: null, status: 'Proposed', notes: '', ...b };
  assertCan(req.user, 'reports', 'add', { domain: f.domain_id },
    f.domain_id ? `You can only add reports in your own domain — ${f.domain_id} is not.` : 'Choose one of your domains for this report. Only a Project Manager can add project-wide reports.');
  const out = await tx(async (c) => {
    await assertDomain(c, f.domain_id);
    const id = await nextCode(c, 'reports', 'RPT');
    const sort = (await c.query('SELECT COALESCE(max(sort),0)+1 AS n FROM reports')).rows[0].n;
    await c.query(
      `INSERT INTO reports(id, name, type, purpose, audience, frequency, format, contents, data_sources, owner, domain_id, status, notes, sort, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
      [id, f.name, f.type, f.purpose, f.audience, f.frequency, f.format, f.contents, f.data_sources, f.owner, f.domain_id, f.status, f.notes, sort, req.user.id]);
    const { kpi, ...links } = f.links;
    await setLinks(c, req.user, 'report', id, links);
    if (kpi) await setKpis(c, id, kpi);
    await logActivity(c, req.user.id, 'created', 'report', id, `Added ${id} ${f.name}`);
    return { id };
  });
  res.status(201).json(out);
});

r.put('/:id', async (req, res) => {
  const b = parse(z.object({ ...Fields, links: Links }).partial(), req.body);
  await tx(async (c) => {
    const cur = (await c.query('SELECT domain_id FROM reports WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!cur) throw notFound('Report');
    assertCan(req.user, 'reports', 'edit', { domain: cur.domain_id },
      cur.domain_id ? `You can only edit reports in your own domain — ${req.params.id} is in ${cur.domain_id}.` : 'Only a Project Manager can edit project-wide reports.');
    if (b.domain_id !== undefined && b.domain_id !== cur.domain_id) {
      assertCan(req.user, 'reports', 'edit', { domain: b.domain_id }, 'You can only move a report into one of your own domains.');
      await assertDomain(c, b.domain_id);
    }
    const { links, ...f } = b;
    const { sets, values } = buildUpdate(f, 1);
    if (!sets.length && !links) { const e = new Error('Nothing to update.'); e.status = 400; throw e; }
    if (sets.length) {
      values.push(req.user.id, req.params.id);
      await c.query(`UPDATE reports SET ${sets.join(', ')}, updated_at=now(), updated_by=$${values.length - 1} WHERE id=$${values.length}`, values);
    }
    if (links) {
      const { kpi, ...rest } = links;
      await setLinks(c, req.user, 'report', req.params.id, rest);
      if (kpi) await setKpis(c, req.params.id, kpi);
    }
    await logActivity(c, req.user.id, 'updated', 'report', req.params.id, f.status ? `Status → ${f.status}` : `Updated ${[...Object.keys(f), ...(links ? ['links'] : [])].join(', ')}`);
  });
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  await tx(async (c) => {
    const cur = (await c.query('SELECT domain_id, name FROM reports WHERE id=$1', [req.params.id])).rows[0];
    if (!cur) throw notFound('Report');
    assertCan(req.user, 'reports', 'delete', { domain: cur.domain_id });
    await c.query('DELETE FROM reports WHERE id=$1', [req.params.id]);
    await logActivity(c, req.user.id, 'deleted', 'report', req.params.id, `Removed ${req.params.id} ${cur.name}`);
  });
  res.json({ ok: true });
});

export default r;
