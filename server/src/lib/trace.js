// Traceability: KPIs and reports mapped to their counterparts everywhere else in the app.
// KPI ↔ process lives in kpi_processes (with the role and the proving outputs); every other mapping
// lives in trace_links. Nothing here refers to a vendor's SOW: the mapping survives a change of implementor.
import { can } from './permissions.js';

// Toolkit registers a KPI or report can be traced to, and how to label their rows.
export const TRACE_REGISTERS = {
  fit_gap: { label: 'Fit-gap', code: 'req_id', title: 'requirement' },
  uat: { label: 'UAT script', code: 'test_id', title: 'scenario' },
  pain_points: { label: 'Pain point', code: 'id', title: 'pain_point' },
};

// What each side may link to (besides KPI ↔ process, which has its own table).
export const LINK_TYPES = {
  kpi: ['report', 'step', 'diagram', 'reengineering', 'master_data', 'open_item', 'document', 'tk_record'],
  report: ['process', 'master_data', 'document', 'tk_record'],
};

const REG_KEYS = Object.keys(TRACE_REGISTERS);
const short = (s, n = 90) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

// One query per target type: { id, label, hint, extra } rows. `ids` narrows it down (null = all).
async function fetchTargets(db, type, ids, user) {
  const where = (col) => (ids ? `${col}::text = ANY($1::text[])` : 'TRUE');
  const args = ids ? [ids] : [];
  switch (type) {
    case 'report':
      return (await db.query(`SELECT id, name AS label, type || ' · ' || status AS hint, status AS extra FROM reports WHERE ${where('id')} ORDER BY sort, id`, args)).rows;
    case 'process':
      return (await db.query(`SELECT p.id, p.name AS label, COALESCE(s.name, 'Cross-cutting') AS hint, g.color AS extra
                                FROM processes p JOIN process_groups g ON g.id=p.group_id LEFT JOIN stages s ON s.id=p.stage_id
                               WHERE ${where('p.id')} ORDER BY p.sort`, args)).rows;
    case 'step':
      return (await db.query(`SELECT m.id::text AS id, m.ref || ' ' || m.step AS label, p.id || ' ' || p.name AS hint, m.process_id || '|' || m.ref AS extra
                                FROM matrix_steps m JOIN processes p ON p.id=m.process_id WHERE ${where('m.id')} ORDER BY p.sort, m.sort, m.ref`, args)).rows;
    case 'diagram':
      return (await db.query(`SELECT id, title AS label, covers AS hint FROM diagrams WHERE ${where('id')} ORDER BY sort`, args)).rows;
    case 'reengineering':
      return (await db.query(`SELECT id, title AS label, CASE WHEN kpi <> '' THEN 'KPI: ' || kpi ELSE '' END AS hint FROM reengineering WHERE ${where('id')} ORDER BY sort, id`, args)).rows
        .map((r) => ({ ...r, hint: short(r.hint, 70) }));
    case 'master_data':
      return (await db.query(`SELECT id::text AS id, object AS label, 'Owned by ' || owning_process AS hint FROM master_data WHERE ${where('id')} ORDER BY sort, id`, args)).rows;
    case 'open_item':
      return (await db.query(`SELECT id::text AS id, code || ' ' || title AS label, replace(status, '_', ' ') AS hint, code AS extra FROM open_items WHERE ${where('id')} ORDER BY sort, id`, args)).rows;
    case 'document': {
      const conf = can(user, 'documents_confidential', 'view');
      return (await db.query(`SELECT id::text AS id, title AS label, category AS hint FROM documents
                               WHERE ${where('id')} AND (NOT confidential OR ${conf ? 'TRUE' : 'FALSE'}) ORDER BY category, title`, args)).rows;
    }
    case 'tk_record': {
      const regs = REG_KEYS.filter((k) => can(user, k, 'view'));
      if (!regs.length) return [];
      const a = ids ? [regs, ids] : [regs];
      const { rows } = await db.query(
        `SELECT id::text AS id, register, data FROM tk_records WHERE register = ANY($1::text[]) ${ids ? 'AND id::text = ANY($2::text[])' : ''} ORDER BY register, sort, id`, a);
      return rows.map((x) => {
        const reg = TRACE_REGISTERS[x.register];
        const code = x.data?.[reg.code] || `#${x.id}`;
        return { id: x.id, label: `${code} ${short(x.data?.[reg.title] || '', 80)}`.trim(), hint: reg.label, extra: x.register };
      });
    }
    default:
      return [];
  }
}

// Everything a KPI or report can be mapped to (for the pickers).
export async function linkOptions(db, user, types) {
  const out = {};
  await Promise.all(types.map(async (t) => {
    // Internal row numbers mean nothing to people: for these types the label already carries the code.
    const hideId = ['step', 'master_data', 'open_item', 'document', 'tk_record'].includes(t);
    out[t] = (await fetchTargets(db, t, null, user)).map((x) => ({ value: x.id, label: x.label, hint: x.hint, ...(hideId ? { code: '' } : {}) }));
  }));
  return out;
}

// Resolved links of one or many KPIs/reports: { [fromId]: { [type]: [{ id, label, hint, extra }] } }.
// Rows the user can't see (e.g. confidential documents) are left out.
export async function resolveLinks(db, user, fromType, fromIds) {
  const out = Object.fromEntries(fromIds.map((id) => [id, {}]));
  if (!fromIds.length) return out;
  const { rows } = await db.query(
    'SELECT from_id, to_type, to_id FROM trace_links WHERE from_type=$1 AND from_id = ANY($2::text[])', [fromType, fromIds]);
  const byType = {};
  for (const r of rows) (byType[r.to_type] ??= new Set()).add(r.to_id);
  const found = {};
  await Promise.all(Object.entries(byType).map(async ([t, set]) => {
    found[t] = Object.fromEntries((await fetchTargets(db, t, [...set], user)).map((x) => [x.id, x]));
  }));
  for (const r of rows) {
    const t = found[r.to_type]?.[r.to_id];
    if (t) (out[r.from_id][r.to_type] ??= []).push(t);
  }
  return out;
}

const bad = (m) => { const e = new Error(m); e.status = 400; return e; };
const NAMES = { report: 'report', process: 'process', step: 'hand-off step', diagram: 'swimlane diagram', reengineering: 're-engineering opportunity',
  master_data: 'master-data object', open_item: 'open item', document: 'document', tk_record: 'toolkit record' };

// Replaces the given link lists (only the types present in `links` change).
export async function setLinks(c, user, fromType, fromId, links = {}) {
  for (const [type, raw] of Object.entries(links)) {
    if (raw === undefined) continue;
    if (!LINK_TYPES[fromType].includes(type)) throw bad(`A ${fromType} can't be linked to ${type}.`);
    const ids = [...new Set(raw.map(String))];
    if (ids.length) {
      const ok = await fetchTargets(c, type, ids, user);
      if (ok.length !== ids.length) throw bad(`One of the selected ${NAMES[type]}s does not exist or isn't visible to you.`);
    }
    // Keep links to rows this user can't see (e.g. confidential documents): they aren't theirs to remove.
    const visible = new Set((await fetchTargets(c, type, null, user)).map((x) => x.id));
    const cur = (await c.query('SELECT to_id FROM trace_links WHERE from_type=$1 AND from_id=$2 AND to_type=$3', [fromType, fromId, type])).rows.map((x) => x.to_id);
    for (const id of cur) {
      if (!ids.includes(id) && visible.has(id)) await c.query('DELETE FROM trace_links WHERE from_type=$1 AND from_id=$2 AND to_type=$3 AND to_id=$4', [fromType, fromId, type, id]);
    }
    for (const id of ids) {
      if (!cur.includes(id)) await c.query('INSERT INTO trace_links(from_type, from_id, to_type, to_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [fromType, fromId, type, id]);
    }
  }
}

// KPIs (ids) linked to the given targets: { [toId]: [{ id, name, status }] }.
export async function kpisLinkedTo(db, toType, toIds) {
  const out = {};
  if (!toIds.length) return out;
  const { rows } = await db.query(
    `SELECT t.to_id, k.id, k.name, k.status FROM trace_links t JOIN kpis k ON k.id=t.from_id
      WHERE t.from_type='kpi' AND t.to_type=$1 AND t.to_id = ANY($2::text[]) ORDER BY k.sort, k.id`, [toType, toIds.map(String)]);
  for (const r of rows) (out[r.to_id] ??= []).push({ id: r.id, name: r.name, status: r.status });
  return out;
}

// The end-in-mind check: what a KPI still needs before every process is proven to deliver it.
export function kpiHealth(k, processes, links) {
  const has = (t) => (links[t] || []).length > 0;
  const uat = (links.tk_record || []).some((x) => x.extra === 'uat');
  const checks = [
    ['validated', 'Agreed with the customer', k.status === 'Validated'],
    ['definition', 'Measure defined (how it is calculated)', !!k.definition?.trim()],
    ['baseline', 'Baseline recorded', !!k.baseline?.trim()],
    ['target', 'Target set', !!k.target?.trim() && !/^set after/i.test(k.target.trim())],
    ['owner', 'Owner named', !!k.owner?.trim()],
    ['process', 'A process produces it', processes.some((p) => p.role === 'Produces')],
    ['outputs', 'Proving outputs chosen on every process', processes.length > 0 && processes.every((p) => (p.outputs || []).some((o) => !(p.stale_outputs || []).includes(o)))],
    ['report', 'A report shows it', has('report')],
    ['data', 'Data source identified', !!k.data_source?.trim() || has('master_data') || has('step')],
    ['test', 'A UAT script proves it', uat],
  ].map(([key, label, ok]) => ({ key, label, ok }));
  return { checks, done: checks.filter((c) => c.ok).length, total: checks.length };
}

// Next free code: KPI-14, RPT-03…
export async function nextCode(c, table, prefix) {
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`phi:code:${table}`]);   // two server instances, one number
  const { rows } = await c.query(
    `SELECT COALESCE(max(substring(id from $1)::int), 0) + 1 AS n FROM ${table} WHERE id ~ $2`, [`^${prefix}-([0-9]+)$`, `^${prefix}-[0-9]+$`]);
  return `${prefix}-${String(rows[0].n).padStart(2, '0')}`;
}
