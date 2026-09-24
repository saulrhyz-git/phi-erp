import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertEditor } from '../lib/auth.js';
import { parse, notFound, logActivity } from '../lib/util.js';

const r = Router();

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT d.id, d.title, d.covers, d.description, d.file_name, d.current_version,
            v.created_at AS updated_at, u.name AS updated_by_name
       FROM diagrams d
       LEFT JOIN diagram_versions v ON v.diagram_id=d.id AND v.version=d.current_version
       LEFT JOIN users u ON u.id=v.created_by
      ORDER BY d.sort`);
  res.json(rows);
});

async function getDiagram(id) {
  const { rows } = await q('SELECT * FROM diagrams WHERE id=$1', [id]);
  if (!rows[0]) throw notFound('Diagram');
  return rows[0];
}
async function getXml(id, version) {
  const { rows } = await q('SELECT xml FROM diagram_versions WHERE diagram_id=$1 AND version=$2', [id, version]);
  if (!rows[0]) throw notFound('Diagram version');
  return rows[0].xml;
}

r.get('/:id', async (req, res) => {
  const d = await getDiagram(req.params.id);
  const versions = await q(
    `SELECT v.version, v.note, v.created_at, u.name AS created_by_name
       FROM diagram_versions v LEFT JOIN users u ON u.id=v.created_by
      WHERE v.diagram_id=$1 ORDER BY v.version DESC`, [d.id]);
  res.json({ ...d, xml: await getXml(d.id, d.current_version), versions: versions.rows });
});

r.get('/:id/versions/:version', async (req, res) => {
  const d = await getDiagram(req.params.id);
  res.json({ id: d.id, version: Number(req.params.version), xml: await getXml(d.id, Number(req.params.version)) });
});

r.get('/:id/download', async (req, res) => {
  const d = await getDiagram(req.params.id);
  const version = req.query.v ? Number(req.query.v) : d.current_version;
  const xml = await getXml(d.id, version);
  const name = d.file_name.replace(/\.bpmn$/, version === d.current_version ? '.bpmn' : `_v${version}.bpmn`);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(xml);
});

async function addVersion(userId, d, xml, note) {
  return tx(async (c) => {
    const { rows } = await c.query('SELECT current_version FROM diagrams WHERE id=$1 FOR UPDATE', [d.id]);
    const next = rows[0].current_version + 1;
    await c.query('INSERT INTO diagram_versions(diagram_id,version,xml,note,created_by) VALUES ($1,$2,$3,$4,$5)', [d.id, next, xml, note, userId]);
    await c.query('UPDATE diagrams SET current_version=$1 WHERE id=$2', [next, d.id]);
    await logActivity(c, userId, 'saved_version', 'diagram', d.id, `v${next}${note ? `: ${note}` : ''}`);
    return next;
  });
}

r.post('/:id/versions', async (req, res) => {
  assertEditor(req.user);
  const d = await getDiagram(req.params.id);
  const b = parse(z.object({
    xml: z.string().min(50).max(5_000_000).refine((x) => /<([a-zA-Z0-9]+:)?definitions[\s>]/.test(x), 'Not a BPMN 2.0 document'),
    note: z.string().trim().max(500).default(''),
  }), req.body);
  const version = await addVersion(req.user.id, d, b.xml, b.note);
  res.status(201).json({ version });
});

r.post('/:id/restore/:version', async (req, res) => {
  assertEditor(req.user);
  const d = await getDiagram(req.params.id);
  const from = Number(req.params.version);
  const xml = await getXml(d.id, from);
  const version = await addVersion(req.user.id, d, xml, `Restored from v${from}`);
  res.status(201).json({ version });
});

export default r;
