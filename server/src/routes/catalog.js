import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan, requireAction, requireView } from '../lib/permissions.js';
import { parse, notFound, logActivity, buildUpdate } from '../lib/util.js';

const r = Router();
r.use(requireView('master_data'));
const t = z.string().trim().max(2000);

// ---- Master data (admin edits) ----
const MD = z.object({ object: z.string().trim().min(1).max(200), owning_process: t, key_fields: t, odoo_home: t, used_by: t });

r.get('/master-data', async (req, res) => {
  res.json((await q('SELECT * FROM master_data ORDER BY sort, id')).rows);
});
r.post('/master-data', requireAction('master_data', 'add'), async (req, res) => {
  const b = parse(MD.partial({ owning_process: true, key_fields: true, odoo_home: true, used_by: true }), req.body);
  const row = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO master_data(object,owning_process,key_fields,odoo_home,used_by,sort)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(max(sort),0)+1 FROM master_data)) RETURNING *`,
      [b.object, b.owning_process ?? '', b.key_fields ?? '', b.odoo_home ?? '', b.used_by ?? '']);
    await logActivity(c, req.user.id, 'created', 'master_data', rows[0].id, b.object);
    return rows[0];
  });
  res.status(201).json(row);
});
r.put('/master-data/:id', requireAction('master_data', 'edit'), async (req, res) => {
  const b = parse(MD.partial(), req.body);
  const { sets, values } = buildUpdate(b);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  values.push(req.params.id);
  const u = await q(`UPDATE master_data SET ${sets.join(', ')} WHERE id=$${values.length} RETURNING object`, values);
  if (!u.rowCount) throw notFound('Master data object');
  await logActivity({ query: q }, req.user.id, 'updated', 'master_data', req.params.id, u.rows[0].object);
  res.json({ ok: true });
});
r.delete('/master-data/:id', requireAction('master_data', 'delete'), async (req, res) => {
  const u = await q('DELETE FROM master_data WHERE id=$1 RETURNING object', [req.params.id]);
  if (!u.rowCount) throw notFound('Master data object');
  await logActivity({ query: q }, req.user.id, 'deleted', 'master_data', req.params.id, u.rows[0].object);
  res.json({ ok: true });
});

// ---- Lot touchpoints (admins and owners respond) ----
const LT = z.object({ process_label: z.string().trim().min(1).max(200), effect: t, fields_needed: t, vendor_response: t });

r.get('/lot-touchpoints', async (req, res) => {
  res.json((await q('SELECT * FROM lot_touchpoints ORDER BY sort, id')).rows);
});
r.put('/lot-touchpoints/:id', async (req, res) => {
  const b = parse(LT.partial(), req.body);
  if (b.process_label !== undefined || b.effect !== undefined) assertCan(req.user, 'master_data', 'edit', {}, 'Your role can only change the Lot fields and vendor responses, not the process or effect columns.');
  if (b.fields_needed !== undefined || b.vendor_response !== undefined) assertCan(req.user, 'lot_responses', 'edit');
  const { sets, values } = buildUpdate(b);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  values.push(req.params.id);
  const u = await q(`UPDATE lot_touchpoints SET ${sets.join(', ')} WHERE id=$${values.length} RETURNING process_label`, values);
  if (!u.rowCount) throw notFound('Lot touchpoint');
  await logActivity({ query: q }, req.user.id, 'updated', 'lot_touchpoint', req.params.id, u.rows[0].process_label);
  res.json({ ok: true });
});
r.post('/lot-touchpoints', requireAction('master_data', 'add'), async (req, res) => {
  const b = parse(LT.partial({ effect: true, fields_needed: true, vendor_response: true }), req.body);
  const { rows } = await q(
    `INSERT INTO lot_touchpoints(process_label,effect,fields_needed,vendor_response,sort)
     VALUES ($1,$2,$3,$4,(SELECT COALESCE(max(sort),0)+1 FROM lot_touchpoints)) RETURNING *`,
    [b.process_label, b.effect ?? '', b.fields_needed ?? '', b.vendor_response ?? '']);
  await logActivity({ query: q }, req.user.id, 'created', 'lot_touchpoint', rows[0].id, b.process_label);
  res.status(201).json(rows[0]);
});

export default r;
