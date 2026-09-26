import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan, can } from '../lib/permissions.js';
import { parse, notFound, logActivity, auditEvent } from '../lib/util.js';

const r = Router();
const MAX = 25 * 1024 * 1024;
const raw = express.raw({ type: () => true, limit: MAX });
export const CATEGORIES = ['Vendor proposal & SOW', 'Correspondence', 'Analysis workbooks', 'Re-engineering', 'Process diagrams', 'Reference', 'Meeting notes', 'Other'];

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT d.id, d.title, d.category, d.description, d.confidential, d.current_version, d.created_at,
            v.file_name, v.mime, v.size_bytes, v.uploaded_at, u.name AS uploaded_by_name,
            (SELECT count(*)::int FROM comments c WHERE c.entity_type='document' AND c.entity_id=d.id::text) AS comment_count
       FROM documents d
       JOIN document_files v ON v.document_id=d.id AND v.version=d.current_version
       LEFT JOIN users u ON u.id=v.uploaded_by
      WHERE (NOT d.confidential OR $1)
      ORDER BY d.category, d.title`, [can(req.user, 'documents_confidential', 'view')]);
  res.json({ categories: CATEGORIES, documents: rows });
});

async function getDoc(id, user) {
  const { rows } = await q('SELECT * FROM documents WHERE id=$1', [id]);
  if (!rows[0] || (rows[0].confidential && !can(user, 'documents_confidential', 'view'))) throw notFound('Document');
  return rows[0];
}

r.get('/:id', async (req, res) => {
  const d = await getDoc(req.params.id, req.user);
  const versions = await q(
    `SELECT v.version, v.file_name, v.mime, v.size_bytes, v.note, v.uploaded_at, u.name AS uploaded_by_name
       FROM document_files v LEFT JOIN users u ON u.id=v.uploaded_by WHERE v.document_id=$1 ORDER BY v.version DESC`, [d.id]);
  res.json({ ...d, versions: versions.rows });
});

r.get('/:id/download', async (req, res) => {
  const d = await getDoc(req.params.id, req.user);
  const v = req.query.v ? Number(req.query.v) : d.current_version;
  const { rows } = await q('SELECT file_name, mime, data FROM document_files WHERE document_id=$1 AND version=$2', [d.id, v]);
  if (!rows[0]) throw notFound('Version');
  await auditEvent('DOWNLOAD', { table: 'documents', recordId: `${d.id}/${v}`, summary: `${d.title} v${v}${d.confidential ? ' (confidential)' : ''} — ${rows[0].file_name}` });
  const inline = req.query.inline === '1' && /^(application\/pdf|image\/)/.test(rows[0].mime);
  res.setHeader('Content-Type', rows[0].mime);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(rows[0].file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(rows[0].data);
});

const hdr = (req, name) => {
  const v = req.get(name);
  try { return v ? decodeURIComponent(v) : ''; } catch { return v || ''; }
};
function fileFrom(req) {
  const name = hdr(req, 'X-File-Name').replace(/[\\/]/g, '_').slice(0, 200);
  if (!name) { const e = new Error('File name missing.'); e.status = 400; throw e; }
  if (!Buffer.isBuffer(req.body) || !req.body.length) { const e = new Error('The file is empty.'); e.status = 400; throw e; }
  const mime = (req.get('Content-Type') || 'application/octet-stream').split(';')[0].slice(0, 120);
  return { name, mime, data: req.body };
}

// Create a document with its first file. Metadata travels in headers so the body can be the raw file.
r.post('/', raw, async (req, res) => {
  assertCan(req.user, 'documents', 'add');
  const f = fileFrom(req);
  const meta = parse(z.object({
    title: z.string().trim().min(1).max(200), category: z.enum(CATEGORIES), description: z.string().trim().max(2000),
    confidential: z.boolean(),
  }), { title: hdr(req, 'X-Doc-Title') || f.name, category: hdr(req, 'X-Doc-Category') || 'Other',
    description: hdr(req, 'X-Doc-Description'), confidential: hdr(req, 'X-Doc-Confidential') === 'true' });
  const doc = await tx(async (c) => {
    const d = await c.query('INSERT INTO documents(title,category,description,confidential,current_version,created_by) VALUES ($1,$2,$3,$4,1,$5) RETURNING *',
      [meta.title, meta.category, meta.description, meta.confidential, req.user.id]);
    await c.query('INSERT INTO document_files(document_id,version,file_name,mime,size_bytes,data,note,uploaded_by) VALUES ($1,1,$2,$3,$4,$5,$6,$7)',
      [d.rows[0].id, f.name, f.mime, f.data.length, f.data, 'Initial upload', req.user.id]);
    await logActivity(c, req.user.id, 'uploaded', 'document', d.rows[0].id, `${meta.title} (${f.name})`);
    return d.rows[0];
  });
  res.status(201).json(doc);
});

r.post('/:id/versions', raw, async (req, res) => {
  assertCan(req.user, 'documents', 'edit');
  const d = await getDoc(req.params.id, req.user);
  const f = fileFrom(req);
  const note = hdr(req, 'X-Version-Note').slice(0, 500);
  const version = await tx(async (c) => {
    const { rows } = await c.query('SELECT current_version FROM documents WHERE id=$1 FOR UPDATE', [d.id]);
    const next = rows[0].current_version + 1;
    await c.query('INSERT INTO document_files(document_id,version,file_name,mime,size_bytes,data,note,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [d.id, next, f.name, f.mime, f.data.length, f.data, note, req.user.id]);
    await c.query('UPDATE documents SET current_version=$1 WHERE id=$2', [next, d.id]);
    await logActivity(c, req.user.id, 'uploaded_version', 'document', d.id, `${d.title} v${next}${note ? `: ${note}` : ''}`);
    return next;
  });
  res.status(201).json({ version });
});

r.put('/:id', async (req, res) => {
  assertCan(req.user, 'documents', 'edit');
  const d = await getDoc(req.params.id, req.user);
  const b = parse(z.object({
    title: z.string().trim().min(1).max(200), category: z.enum(CATEGORIES), description: z.string().trim().max(2000), confidential: z.boolean(),
  }).partial(), req.body);
  await q(`UPDATE documents SET title=COALESCE($1,title), category=COALESCE($2,category), description=COALESCE($3,description),
           confidential=COALESCE($4,confidential) WHERE id=$5`, [b.title ?? null, b.category ?? null, b.description ?? null, b.confidential ?? null, d.id]);
  await logActivity({ query: q }, req.user.id, 'updated', 'document', d.id, d.title);
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  assertCan(req.user, 'documents', 'delete');
  const d = await getDoc(req.params.id, req.user);
  await q('DELETE FROM documents WHERE id=$1', [d.id]);
  await q("DELETE FROM comments WHERE entity_type='document' AND entity_id=$1", [String(d.id)]);
  await logActivity({ query: q }, req.user.id, 'deleted', 'document', d.id, d.title);
  res.json({ ok: true });
});

export default r;
