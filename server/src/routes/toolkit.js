// Project toolkit: key dates, master schedule and the registers (RAID, pain points, UAT scripts…).
// Every record can belong to a domain. Users whose role grants 'own' can only add, change or
// delete records in their own domain(s); project-wide records (no domain) need 'all'.
import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { parse, notFound, logActivity } from '../lib/util.js';
import { TASK_STATUSES, TOOLKIT_PHASES, TOOLKIT_REGISTERS, assertCan, can, requireView } from '../lib/permissions.js';

const r = Router();
const REG = Object.fromEntries(TOOLKIT_REGISTERS.map((x) => [x.key, x]));

r.get('/meta', async (req, res) => {
  const domains = await q('SELECT * FROM domains ORDER BY sort');
  res.json({ registers: TOOLKIT_REGISTERS, phases: TOOLKIT_PHASES, domains: domains.rows });
});

r.get('/summary', async (req, res) => {
  const { rows } = await q(`SELECT register, count(*)::int AS n, max(updated_at) AS updated_at FROM tk_records GROUP BY register`);
  const tasks = await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE status='Complete')::int AS done FROM tk_tasks WHERE type IN ('Task','Milestone')`);
  res.json({ registers: Object.fromEntries(rows.map((x) => [x.register, x])), tasks: tasks.rows[0] });
});

// ---------------------------------------------------------------- key dates
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const Settings = z.object({
  anchors: z.object({ PRE: ymd, BRD: ymd, GL: ymd }),
  hypercare_days: z.number().int().min(0).max(365),
  gantt_start: ymd, gantt_end: ymd,
  awb_baseline_weeks: z.number().int().min(1).max(104),
  anchor_notes: z.record(z.string(), z.string().max(500)).optional(),
});

async function readSettings() {
  const { rows } = await q("SELECT value, updated_at FROM tk_settings WHERE key='schedule'");
  return rows[0] ? { ...rows[0].value, updated_at: rows[0].updated_at } : null;
}

r.get('/settings', requireView('key_dates'), async (req, res) => res.json(await readSettings()));

r.put('/settings', async (req, res) => {
  assertCan(req.user, 'key_dates', 'edit');
  const b = parse(Settings, req.body);
  if (new Date(b.gantt_start).getUTCDay() !== 1) return res.status(400).json({ error: 'The Gantt start date must be a Monday.' });
  const before = await readSettings();
  await tx(async (c) => {
    await c.query(`INSERT INTO tk_settings(key,value,updated_by) VALUES ('schedule',$1,$2)
                   ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`, [JSON.stringify(b), req.user.id]);
    const moved = before ? Object.keys(b.anchors).filter((k) => before.anchors?.[k] !== b.anchors[k]).map((k) => `${k} ${before.anchors?.[k]} → ${b.anchors[k]}`) : [];
    await logActivity(c, req.user.id, 'updated', 'key_dates', 'schedule', moved.length ? `Moved anchor ${moved.join(', ')}` : 'Updated schedule settings');
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- schedule
const PHASE_CODES = TOOLKIT_PHASES.map((p) => p.code);
const Task = z.object({
  code: z.string().trim().min(1).max(20),
  phase: z.enum(PHASE_CODES),
  name: z.string().trim().min(1).max(300),
  type: z.enum(['Task', 'Milestone', 'Workstream', 'Blackout']),
  owner: z.string().trim().max(200).default(''),
  domain_id: z.string().max(10).nullable().default(null),
  anchor: z.enum(['PRE', 'BRD', 'GL']),
  offset_days: z.number().int().min(-1000).max(2000),
  duration_days: z.number().int().min(0).max(1000),
  use_hypercare: z.boolean().default(false),
  notes: z.string().trim().max(2000).default(''),
  status: z.enum(['', ...TASK_STATUSES]).default('Not Started'),
});

const TASK_SQL = `SELECT t.*, d.name AS domain_name, u.name AS updated_by_name,
  (SELECT count(*)::int FROM comments c WHERE c.entity_type='tk_task' AND c.entity_id=t.id::text) AS comment_count
  FROM tk_tasks t LEFT JOIN domains d ON d.id=t.domain_id LEFT JOIN users u ON u.id=t.updated_by`;

r.get('/tasks', requireView('schedule'), async (req, res) => {
  res.json((await q(`${TASK_SQL} ORDER BY t.sort, t.id`)).rows);
});

async function getTask(id) {
  const { rows } = await q('SELECT * FROM tk_tasks WHERE id=$1', [id]);
  if (!rows[0]) throw notFound('Schedule task');
  return rows[0];
}

r.post('/tasks', async (req, res) => {
  const b = parse(Task, req.body);
  assertCan(req.user, 'schedule', 'add', { domain: b.domain_id });
  const row = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO tk_tasks(code,phase,name,type,owner,domain_id,anchor,offset_days,duration_days,use_hypercare,notes,status,sort,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(SELECT COALESCE(max(sort),0)+1 FROM tk_tasks WHERE phase=$2),$13) RETURNING *`,
      [b.code, b.phase, b.name, b.type, b.owner, b.domain_id, b.anchor, b.offset_days, b.type === 'Milestone' ? 0 : b.duration_days,
        b.use_hypercare, b.notes, b.status, req.user.id]);
    await logActivity(c, req.user.id, 'created', 'tk_task', b.code, b.name);
    return rows[0];
  });
  res.status(201).json(row);
});

r.put('/tasks/:id', async (req, res) => {
  const t = await getTask(req.params.id);
  const b = parse(Task.partial(), req.body);
  const keys = Object.keys(b).filter((k) => b[k] !== undefined);
  const statusOnly = keys.length > 0 && keys.every((k) => k === 'status');
  // Changing only the status needs 'status' rights; anything else needs 'edit'.
  if (!(statusOnly && can(req.user, 'schedule', 'edit', { domain: t.domain_id }))) {
    assertCan(req.user, 'schedule', statusOnly ? 'status' : 'edit', { domain: t.domain_id });
  }
  if (b.domain_id !== undefined && b.domain_id !== t.domain_id) assertCan(req.user, 'schedule', 'edit', { domain: b.domain_id });
  const next = { ...t, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
  if (next.type === 'Milestone') next.duration_days = 0;
  await tx(async (c) => {
    await c.query(
      `UPDATE tk_tasks SET code=$1,phase=$2,name=$3,type=$4,owner=$5,domain_id=$6,anchor=$7,offset_days=$8,duration_days=$9,
              use_hypercare=$10,notes=$11,status=$12,updated_at=now(),updated_by=$13 WHERE id=$14`,
      [next.code, next.phase, next.name, next.type, next.owner, next.domain_id, next.anchor, next.offset_days, next.duration_days,
        next.use_hypercare, next.notes, next.status, req.user.id, t.id]);
    await logActivity(c, req.user.id, 'updated', 'tk_task', next.code,
      statusOnly ? `Status: ${t.status || '—'} → ${b.status || '—'}` : `Edited ${keys.join(', ')}`);
  });
  res.json({ ok: true });
});

r.delete('/tasks/:id', async (req, res) => {
  const t = await getTask(req.params.id);
  assertCan(req.user, 'schedule', 'delete', { domain: t.domain_id });
  await tx(async (c) => {
    await c.query('DELETE FROM tk_tasks WHERE id=$1', [t.id]);
    await logActivity(c, req.user.id, 'deleted', 'tk_task', t.code, t.name);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- registers
function register(key) {
  const reg = REG[key];
  if (!reg) throw notFound('Register');
  return reg;
}

function cleanData(reg, raw) {
  const out = {};
  for (const col of reg.columns) {
    let v = raw?.[col.key];
    if (v === undefined || v === null) v = '';
    v = String(v).trim().slice(0, 8000);
    if (col.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { const e = new Error(`${col.label}: use YYYY-MM-DD`); e.status = 400; throw e; }
    if (col.type === 'select' && v && !col.options.includes(v)) { const e = new Error(`${col.label}: "${v}" is not one of the allowed values`); e.status = 400; throw e; }
    out[col.key] = v;
  }
  return out;
}

const PAD = { 'CR-': 3, 'REQ-': 3, 'DEF-': 3 };
async function nextCode(c, reg) {
  const { rows } = await c.query(
    `SELECT COALESCE(max(substring(data->>$1 from $2)::int), 0) + 1 AS n FROM tk_records WHERE register=$3 AND data->>$1 ~ $4`,
    [reg.codeField, `^${reg.codePrefix}([0-9]+)$`, reg.key, `^${reg.codePrefix}[0-9]+$`]);
  return `${reg.codePrefix}${String(rows[0].n).padStart(PAD[reg.codePrefix] || 2, '0')}`;
}

const label = (reg, data) => (reg.codeField && data[reg.codeField] ? `${data[reg.codeField]} ` : '') + String(data[reg.titleField] || '').slice(0, 120);

const RecordBody = z.object({ data: z.record(z.string(), z.any()), domain_id: z.string().max(10).nullable().optional() });

r.get('/r/:register', async (req, res, next) => {
  const reg = register(req.params.register);
  requireView(reg.key)(req, res, async (err) => {
    if (err) return next(err);
    const { rows } = await q(
      `SELECT t.id, t.domain_id, d.name AS domain_name, t.data, t.sort, t.created_at, t.updated_at, u.name AS updated_by_name,
              (SELECT count(*)::int FROM comments c WHERE c.entity_type='tk_record' AND c.entity_id=t.id::text) AS comment_count
         FROM tk_records t LEFT JOIN domains d ON d.id=t.domain_id LEFT JOIN users u ON u.id=t.updated_by
        WHERE t.register=$1 ORDER BY t.sort, t.id`, [reg.key]);
    res.json(rows);
  });
});

r.post('/r/:register', async (req, res) => {
  const reg = register(req.params.register);
  const b = parse(RecordBody, req.body);
  const domain = b.domain_id ?? null;
  assertCan(req.user, reg.key, 'add', { domain });
  const data = cleanData(reg, b.data);
  const row = await tx(async (c) => {
    if (reg.codeField && reg.codePrefix && !data[reg.codeField]) data[reg.codeField] = await nextCode(c, reg);
    const { rows } = await c.query(
      `INSERT INTO tk_records(register,domain_id,data,sort,created_by,updated_by)
       VALUES ($1,$2,$3,(SELECT COALESCE(max(sort),0)+1 FROM tk_records WHERE register=$1),$4,$4) RETURNING *`,
      [reg.key, domain, JSON.stringify(data), req.user.id]);
    await logActivity(c, req.user.id, 'created', `tk_${reg.key}`, rows[0].id, label(reg, data));
    return rows[0];
  });
  res.status(201).json(row);
});

async function getRecord(reg, id) {
  const { rows } = await q('SELECT * FROM tk_records WHERE id=$1 AND register=$2', [id, reg.key]);
  if (!rows[0]) throw notFound('Record');
  return rows[0];
}

r.put('/r/:register/:id', async (req, res) => {
  const reg = register(req.params.register);
  const cur = await getRecord(reg, req.params.id);
  const b = parse(RecordBody.partial(), req.body);
  const domain = b.domain_id === undefined ? cur.domain_id : b.domain_id;
  const data = cleanData(reg, { ...cur.data, ...(b.data || {}) });
  const changedCols = reg.columns.filter((c) => (cur.data[c.key] ?? '') !== data[c.key]);
  const changed = changedCols.map((c) => c.label);
  const statusOnly = domain === cur.domain_id && changedCols.length > 0 && changedCols.every((c) => reg.statusFields.includes(c.key));
  if (!(statusOnly && can(req.user, reg.key, 'edit', { domain: cur.domain_id }))) {
    assertCan(req.user, reg.key, statusOnly ? 'status' : 'edit', { domain: cur.domain_id });
  }
  if (domain !== cur.domain_id) assertCan(req.user, reg.key, 'edit', { domain });
  await tx(async (c) => {
    await c.query('UPDATE tk_records SET data=$1, domain_id=$2, updated_at=now(), updated_by=$3 WHERE id=$4',
      [JSON.stringify(data), domain, req.user.id, cur.id]);
    const summary = statusOnly
      ? changedCols.map((col) => `${col.label}: ${cur.data[col.key] || '—'} → ${data[col.key] || '—'}`).join('; ')
      : changed.length ? changed.join(', ') : 'domain';
    await logActivity(c, req.user.id, 'updated', `tk_${reg.key}`, cur.id, `${label(reg, data)} — ${summary}`);
  });
  res.json({ ok: true });
});

r.delete('/r/:register/:id', async (req, res) => {
  const reg = register(req.params.register);
  const cur = await getRecord(reg, req.params.id);
  assertCan(req.user, reg.key, 'delete', { domain: cur.domain_id });
  await tx(async (c) => {
    await c.query('DELETE FROM tk_records WHERE id=$1', [cur.id]);
    await c.query("DELETE FROM comments WHERE entity_type='tk_record' AND entity_id=$1", [String(cur.id)]);
    await logActivity(c, req.user.id, 'deleted', `tk_${reg.key}`, cur.id, label(reg, cur.data));
  });
  res.json({ ok: true });
});

export default r;
