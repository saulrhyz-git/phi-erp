// Read-only access to the immutable audit log. There are deliberately no write routes:
// entries are created by database triggers and by auditEvent(), and the table itself
// rejects UPDATE, DELETE and TRUNCATE.
import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { parse, notFound, auditEvent } from '../lib/util.js';
import { requireView } from '../lib/permissions.js';

const r = Router();
r.use(requireView('audit_log'));

const Filters = z.object({
  user_id: z.coerce.number().int().optional(),
  table: z.string().max(60).optional(),
  action: z.string().max(30).optional(),
  record: z.string().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().max(200).optional(),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function where(f) {
  const w = []; const p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replaceAll('?', `$${p.length}`)); };
  if (f.user_id) add('user_id = ?', f.user_id);
  if (f.table) add('table_name = ?', f.table);
  if (f.action) add('action = ?', f.action);
  if (f.record) add('record_id = ?', f.record);
  if (f.from) add(`at >= (?::date AT TIME ZONE 'Asia/Manila')`, f.from);
  if (f.to) add(`at < ((?::date + 1) AT TIME ZONE 'Asia/Manila')`, f.to);
  if (f.q) add(`concat_ws(' ', user_name, user_email, record_id, summary, old_data::text, new_data::text) ILIKE ?`, `%${f.q}%`);
  if (f.before) add('id < ?', f.before);
  return { sql: w.length ? `WHERE ${w.join(' AND ')}` : '', params: p };
}

const LIST_COLS = 'id, at, user_id, user_name, user_email, ip, action, table_name, record_id, changed_fields, summary';

r.get('/', async (req, res) => {
  const f = parse(Filters, req.query);
  const { sql, params } = where(f);
  params.push(f.limit);
  const { rows } = await q(`SELECT ${LIST_COLS} FROM audit_log ${sql} ORDER BY id DESC LIMIT $${params.length}`, params);
  res.json(rows);
});

r.get('/facets', async (req, res) => {
  const [tables, actions, users] = await Promise.all([
    q('SELECT DISTINCT table_name FROM audit_log WHERE table_name IS NOT NULL ORDER BY 1'),
    q('SELECT DISTINCT action FROM audit_log ORDER BY 1'),
    q('SELECT DISTINCT user_id, user_name FROM audit_log WHERE user_id IS NOT NULL ORDER BY user_name'),
  ]);
  res.json({ tables: tables.rows.map((x) => x.table_name), actions: actions.rows.map((x) => x.action), users: users.rows });
});

r.get('/verify', async (req, res) => {
  const t0 = Date.now();
  const { rows } = await q('SELECT * FROM audit_verify()');
  const v = rows[0];
  res.json({ ok: v.bad_id === null, checked: Number(v.checked), bad_id: v.bad_id, head_id: v.head_id, head_hash: v.head_hash, ms: Date.now() - t0, at: new Date().toISOString() });
});

const csv = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

r.get('/export.csv', async (req, res) => {
  const f = parse(Filters.omit({ limit: true, before: true }), req.query);
  const { sql, params } = where(f);
  const { rows } = await q(`SELECT * FROM audit_log ${sql} ORDER BY id LIMIT 200000`, params);
  await auditEvent('EXPORT', { table: 'audit_log', summary: `Exported ${rows.length} audit entries (${Object.entries(f).map(([k, v]) => `${k}=${v}`).join(', ') || 'no filters'})` });
  const cols = ['id', 'at', 'user_id', 'user_name', 'user_email', 'ip', 'action', 'table_name', 'record_id', 'changed_fields', 'old_data', 'new_data', 'summary', 'prev_hash', 'hash'];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="phi-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\uFEFF' + [cols.join(','), ...rows.map((x) => cols.map((c) => csv(c === 'at' ? x.at.toISOString() : x[c])).join(','))].join('\r\n'));
});

r.get('/:id', async (req, res) => {
  const { rows } = await q('SELECT * FROM audit_log WHERE id=$1', [req.params.id]);
  if (!rows[0]) throw notFound('Audit entry');
  res.json(rows[0]);
});

export default r;
