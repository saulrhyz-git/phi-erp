// Toolkit configuration, edited in the app by roles with "Toolkit configuration: edit" (Project Manager by default):
// register definitions, schedule phases, domains and the guide page.
import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan, MODULES, requireView } from '../lib/permissions.js';
import { parse, notFound, logActivity } from '../lib/util.js';
import { bump, getGuide, getPhases, getRegisters, refresh } from '../lib/registry.js';

const r = Router();
r.use(requireView('toolkit_config'));
const bad = (msg) => { const e = new Error(msg); e.status = 400; return e; };
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

r.get('/', async (req, res) => {
  const [domains, taskPhases, recCounts, domUse] = await Promise.all([
    q('SELECT * FROM domains ORDER BY sort, id'),
    q('SELECT phase, count(*)::int AS n FROM tk_tasks GROUP BY phase'),
    q('SELECT register, count(*)::int AS n FROM tk_records GROUP BY register'),
    q(`SELECT d, sum(n)::int AS n FROM (
         SELECT domain_id AS d, count(*) AS n FROM tk_records WHERE domain_id IS NOT NULL GROUP BY 1
         UNION ALL SELECT domain_id, count(*) FROM tk_tasks WHERE domain_id IS NOT NULL GROUP BY 1
         UNION ALL SELECT domain_id, count(*) FROM user_domains GROUP BY 1) x GROUP BY d`),
  ]);
  res.json({
    registers: getRegisters(true), phases: getPhases(), guide: getGuide(), domains: domains.rows,
    groups: [...new Set(getRegisters(true).map((x) => x.group))],
    usage: {
      phases: Object.fromEntries(taskPhases.rows.map((x) => [x.phase, x.n])),
      registers: Object.fromEntries(recCounts.rows.map((x) => [x.register, x.n])),
      domains: Object.fromEntries(domUse.rows.map((x) => [x.d, x.n])),
    },
  });
});

// ------------------------------------------------------------------ registers
const Column = z.object({
  key: z.string().trim().max(40).optional().default(''),
  label: z.string().trim().min(1, 'Every column needs a label').max(80),
  type: z.enum(['text', 'textarea', 'date', 'select']),
  options: z.array(z.string().trim().max(120)).max(60).optional(),
  detail: z.boolean().optional(),      // true = shown only in the record dialog, not the list
  wide: z.boolean().optional(),
  badge: z.boolean().optional(),
  status: z.boolean().optional(),      // quick status updates allowed on this column
  archived: z.boolean().optional(),    // hidden; existing values kept
});
const Form = z.object({
  title: z.string().trim().min(1).max(160), fields: z.array(z.string().trim().min(1).max(120)).max(30),
  statement: z.string().trim().max(1000).default(''), signatories: z.array(z.string().trim().min(1).max(120)).max(20),
});
const RegisterBody = z.object({
  label: z.string().trim().min(2).max(60),
  title: z.string().trim().min(2).max(120),
  group: z.string().trim().min(2).max(40),
  description: z.string().trim().max(1000).default(''),
  howTo: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  codePrefix: z.string().trim().max(8).regex(/^([A-Z]{1,6}-)?$/, 'Code prefix looks like "R-" or "CR-"').nullable().optional(),
  codeField: z.string().max(40).nullable().optional(),
  titleField: z.string().max(40),
  columns: z.array(Column).min(1).max(40),
  forms: z.array(Form).max(12).optional(),
  archived: z.boolean().optional(),
});

function normaliseColumns(cols, previous = []) {
  const prevKeys = new Set(previous.map((c) => c.key));
  const used = new Set();
  const out = cols.map((c) => {
    let key = c.key && prevKeys.has(c.key) ? c.key : '';           // existing keys never change
    if (!key) {
      const base = slug(c.label) || 'field';
      key = base; let i = 2;
      while (used.has(key) || prevKeys.has(key)) key = `${base}_${i++}`;
    }
    used.add(key);
    const col = { key, label: c.label, type: c.type };
    if (c.type === 'select') {
      const opts = [...new Set((c.options || []).map((o) => o.trim()).filter(Boolean))];
      if (!opts.length) throw bad(`${c.label}: a pick-list needs at least one option`);
      col.options = ['', ...opts];
      if (c.badge) col.badge = true;
      if (c.status) col.status = true;
    }
    if (c.detail) col.detail = true;
    if (c.wide) col.wide = true;
    if (c.archived) col.archived = true;
    return col;
  });
  // Columns dropped from the list are kept as archived so their data survives.
  for (const p of previous) if (!used.has(p.key)) out.push({ ...p, archived: true });
  if (!out.some((c) => !c.archived)) throw bad('A register needs at least one visible column.');
  return out;
}

async function saveRegister(c, key, def, sort, archived, userId) {
  await c.query(
    `INSERT INTO tk_registers(key, def, sort, archived, updated_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (key) DO UPDATE SET def=EXCLUDED.def, sort=EXCLUDED.sort, archived=EXCLUDED.archived, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [key, JSON.stringify(def), sort, archived, userId]);
  await bump(c);
}

r.put('/registers/:key', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const cur = getRegisters(true).find((x) => x.key === req.params.key);
  if (!cur) throw notFound('Register');
  const b = parse(RegisterBody, req.body);
  const columns = normaliseColumns(b.columns, cur.columns);
  const live = columns.filter((c) => !c.archived);
  if (!live.some((c) => c.key === b.titleField)) throw bad('Choose a visible column as the record title.');
  const codeField = b.codeField && live.some((c) => c.key === b.codeField) ? b.codeField : null;
  const def = {
    label: b.label, title: b.title, group: b.group, description: b.description, howTo: b.howTo,
    columns, titleField: b.titleField, codeField, codePrefix: codeField ? (b.codePrefix || null) : null,
    ...(cur.special ? { special: cur.special } : {}), ...(b.forms ? { forms: b.forms } : cur.forms ? { forms: cur.forms } : {}),
  };
  await tx(async (c) => {
    await saveRegister(c, cur.key, def, cur.sort, b.archived ?? cur.archived, req.user.id);
    await logActivity(c, req.user.id, 'configured', 'tk_register', cur.key, b.archived !== undefined && b.archived !== cur.archived
      ? (b.archived ? `Archived register ${b.label}` : `Restored register ${b.label}`) : `Updated register ${b.label}`);
  });
  await refresh(true);
  res.json({ ok: true });
});

r.post('/registers', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const b = parse(z.object({
    label: z.string().trim().min(2).max(60), group: z.string().trim().min(2).max(40),
    description: z.string().trim().max(1000).default(''), copyPermissionsFrom: z.string().max(40).optional(),
  }), req.body);
  let key = slug(b.label);
  if (!key) throw bad('Use letters or numbers in the register name.');
  const taken = new Set([...Object.keys(MODULES), ...getRegisters(true).map((x) => x.key)]);
  let i = 2; const base = key;
  while (taken.has(key)) key = `${base}_${i++}`;
  const def = {
    label: b.label, title: b.label, group: b.group, description: b.description, howTo: [],
    columns: [
      { key: 'item', label: 'Item', type: 'text' },
      { key: 'details', label: 'Details', type: 'textarea', wide: true },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'due', label: 'Due', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['', 'Not Started', 'In Progress', 'Complete', 'At Risk', 'Blocked'], badge: true, status: true },
    ],
    titleField: 'item', codeField: null, codePrefix: null,
  };
  const from = b.copyPermissionsFrom || 'raid';
  await tx(async (c) => {
    const sort = (await c.query('SELECT COALESCE(max(sort),0)+1 AS n FROM tk_registers')).rows[0].n;
    await saveRegister(c, key, def, sort, false, req.user.id);
    // Custom roles get the same access to the new register as they have to the one it was modelled on.
    await c.query(
      `UPDATE roles SET permissions = permissions || jsonb_build_object($1::text, permissions -> $2::text)
        WHERE NOT is_system AND permissions ? $2::text`, [key, from]);
    await logActivity(c, req.user.id, 'configured', 'tk_register', key, `Created register ${b.label}`);
  });
  await refresh(true);
  res.status(201).json({ key });
});

r.post('/registers/order', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const { keys } = parse(z.object({ keys: z.array(z.string().max(40)).max(200) }), req.body);
  await tx(async (c) => {
    for (const [i, k] of keys.entries()) await c.query('UPDATE tk_registers SET sort=$1 WHERE key=$2 AND sort<>$1', [i, k]);
    await bump(c);
    await logActivity(c, req.user.id, 'configured', 'tk_register', 'order', 'Reordered registers');
  });
  await refresh(true);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ phases
const Phase = z.object({
  code: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, 'Phase codes are 1–8 capital letters or digits'),
  label: z.string().trim().min(2).max(120),
  dark: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colour must be like #3F6C95'),
  light: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  custom: z.boolean().optional(),   // true = use this colour instead of the theme's
});
r.put('/phases', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const { phases } = parse(z.object({ phases: z.array(Phase).min(1).max(40) }), req.body);
  const codes = phases.map((p) => p.code);
  if (new Set(codes).size !== codes.length) throw bad('Each phase needs its own code.');
  const used = await q('SELECT DISTINCT phase FROM tk_tasks');
  const missing = used.rows.map((x) => x.phase).filter((c) => !codes.includes(c));
  if (missing.length) throw bad(`Phase ${missing.join(', ')} still has schedule items. Move them to another phase first.`);
  await tx(async (c) => {
    await c.query(`UPDATE tk_settings SET value=$1, updated_at=now(), updated_by=$2 WHERE key='phases'`, [JSON.stringify(phases), req.user.id]);
    await bump(c);
    await logActivity(c, req.user.id, 'configured', 'tk_phases', 'phases', `Saved ${phases.length} phases`);
  });
  await refresh(true);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ domains
const Domain = z.object({ id: z.string().trim().regex(/^[A-Z]{2,4}$/, 'Domain codes are 2–4 capital letters'), name: z.string().trim().min(2).max(80) });
r.post('/domains', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const b = parse(Domain, req.body);
  await tx(async (c) => {
    await c.query('INSERT INTO domains(id, name, sort) VALUES ($1,$2,(SELECT COALESCE(max(sort),0)+1 FROM domains))', [b.id, b.name]);
    await logActivity(c, req.user.id, 'configured', 'domain', b.id, `Added domain ${b.id} — ${b.name}`);
  });
  res.status(201).json({ ok: true });
});
r.put('/domains/:id', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const b = parse(Domain.pick({ name: true }), req.body);
  const u = await q('UPDATE domains SET name=$1 WHERE id=$2', [b.name, req.params.id]);
  if (!u.rowCount) throw notFound('Domain');
  await logActivity({ query: q }, req.user.id, 'configured', 'domain', req.params.id, `Renamed domain to ${b.name}`);
  res.json({ ok: true });
});
r.delete('/domains/:id', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const use = await q(`SELECT (SELECT count(*) FROM tk_records WHERE domain_id=$1) + (SELECT count(*) FROM tk_tasks WHERE domain_id=$1)
                             + (SELECT count(*) FROM user_domains WHERE domain_id=$1) AS n`, [req.params.id]);
  if (Number(use.rows[0].n) > 0) throw bad('This domain is still used by records, schedule items or users. Reassign them first.');
  const d = await q('DELETE FROM domains WHERE id=$1', [req.params.id]);
  if (!d.rowCount) throw notFound('Domain');
  await logActivity({ query: q }, req.user.id, 'configured', 'domain', req.params.id, 'Deleted domain');
  res.json({ ok: true });
});

// ------------------------------------------------------------------ guide
const lines = z.array(z.string().trim().min(1).max(600)).max(30);
r.put('/guide', async (req, res) => {
  assertCan(req.user, 'toolkit_config', 'edit');
  const b = parse(z.object({
    intro: z.string().trim().max(1500), rules: lines, confirm: lines, schedule_note: z.string().trim().max(3000),
    folders: lines, naming: z.string().trim().max(1000),
  }), req.body);
  await tx(async (c) => {
    await c.query(`UPDATE tk_settings SET value=$1, updated_at=now(), updated_by=$2 WHERE key='guide'`, [JSON.stringify(b), req.user.id]);
    await bump(c);
    await logActivity(c, req.user.id, 'configured', 'tk_guide', 'guide', 'Updated the toolkit guide');
  });
  await refresh(true);
  res.json({ ok: true });
});

export default r;
