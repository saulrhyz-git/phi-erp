import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { assertCan, can } from '../lib/permissions.js';
import { parse, notFound, logActivity, auditEvent } from '../lib/util.js';
import * as sp from '../storage/sharepoint.js';
import { CATEGORIES, migrateToSharePoint, storeFile, syncFromSharePoint } from '../storage/docsync.js';

export { CATEGORIES };
const r = Router();
const MAX = 25 * 1024 * 1024;
const raw = express.raw({ type: () => true, limit: MAX });

r.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT d.id, d.title, d.category, d.description, d.confidential, d.current_version, d.created_at,
            v.file_name, v.mime, v.size_bytes, v.uploaded_at, v.storage, v.sp_web_url, u.name AS uploaded_by_name,
            (SELECT count(*)::int FROM comments c WHERE c.entity_type='document' AND c.entity_id=d.id::text) AS comment_count
       FROM documents d
       JOIN document_files v ON v.document_id=d.id AND v.version=d.current_version
       LEFT JOIN users u ON u.id=v.uploaded_by
      WHERE (NOT d.confidential OR $1)
      ORDER BY d.category, d.title`, [can(req.user, 'documents_confidential', 'view')]);
  res.json({ categories: CATEGORIES, documents: rows, storage: sp.isEnabled() ? 'sharepoint' : 'db' });
});

// ---------------------------------------------------------------- storage admin (before /:id routes)
r.get('/storage/status', async (req, res) => {
  const counts = await q(`SELECT storage, count(*)::int AS files, COALESCE(sum(size_bytes),0)::bigint AS bytes FROM document_files GROUP BY storage`);
  res.json({ ...(await sp.status()), counts: counts.rows, canManage: can(req.user, 'documents', 'delete') });
});

r.post('/storage/migrate', async (req, res) => {
  assertCan(req.user, 'documents', 'delete', {}, 'Only document administrators can move files into SharePoint.');
  const out = await migrateToSharePoint();
  await logActivity({ query: q }, req.user.id, 'migrated', 'document', 'sharepoint', `Moved ${out.files} file(s) of ${out.documents} document(s) into SharePoint`);
  res.json(out);
});

r.post('/storage/sync', async (req, res) => {
  assertCan(req.user, 'documents', 'add');
  const out = await syncFromSharePoint(req.user.id);
  if (!out.skipped && (out.imported || out.updated)) {
    await logActivity({ query: q }, req.user.id, 'synced', 'document', 'sharepoint', `SharePoint sync: ${out.imported} new, ${out.updated} edited in SharePoint`);
  }
  res.json(out);
});

// ---------------------------------------------------------------- documents
async function getDoc(id, user) {
  const { rows } = await q('SELECT * FROM documents WHERE id=$1', [id]);
  if (!rows[0] || (rows[0].confidential && !can(user, 'documents_confidential', 'view'))) throw notFound('Document');
  return rows[0];
}

r.get('/:id', async (req, res) => {
  const d = await getDoc(req.params.id, req.user);
  const versions = await q(
    `SELECT v.version, v.file_name, v.mime, v.size_bytes, v.note, v.uploaded_at, v.storage, v.sp_web_url, u.name AS uploaded_by_name
       FROM document_files v LEFT JOIN users u ON u.id=v.uploaded_by WHERE v.document_id=$1 ORDER BY v.version DESC`, [d.id]);
  res.json({ ...d, versions: versions.rows });
});

r.get('/:id/download', async (req, res) => {
  const d = await getDoc(req.params.id, req.user);
  const v = req.query.v ? Number(req.query.v) : d.current_version;
  const { rows } = await q(
    `SELECT f.file_name, f.mime, f.data, f.storage, f.sp_item_id, f.sp_version_id,
            (f.version = (SELECT max(version) FROM document_files g WHERE g.sp_item_id = f.sp_item_id)) AS is_current
       FROM document_files f WHERE f.document_id=$1 AND f.version=$2`, [d.id, v]);
  const f = rows[0];
  if (!f) throw notFound('Version');
  await auditEvent('DOWNLOAD', { table: 'documents', recordId: `${d.id}/${v}`, summary: `${d.title} v${v}${d.confidential ? ' (confidential)' : ''} — ${f.file_name}` });
  const inline = req.query.inline === '1' && /^(application\/pdf|image\/)/.test(f.mime);
  const headers = () => {
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
  };
  if (f.storage === 'db') { headers(); return res.send(f.data); }
  // Pulled live from SharePoint, so edits made there are what people see.
  if (!f.is_current && !f.sp_version_id) {
    const e = new Error('SharePoint no longer has this earlier version.'); e.status = 404; throw e;
  }
  let file;
  try {
    file = await sp.download(f.sp_item_id, f.sp_version_id, f.is_current);
  } catch (e) {
    if (e.graphStatus === 404) { e.message = 'This file is no longer in SharePoint (it may have been moved or deleted there). Run "Sync with SharePoint" or upload it again.'; e.status = 404; }
    throw e;
  }
  headers();
  if (file.length) res.setHeader('Content-Length', file.length);
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
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

// Saves one version row: pushes the bytes to SharePoint when enabled, otherwise keeps them in the database.
async function insertVersion(c, doc, version, f, note, userId) {
  if (sp.isEnabled()) {
    const up = await storeFile(doc, f.name, f.data);
    await c.query(
      `INSERT INTO document_files(document_id,version,file_name,mime,size_bytes,note,uploaded_by,storage,sp_drive_id,sp_item_id,sp_version_id,sp_web_url,sp_etag)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'sharepoint',$8,$9,$10,$11,$12)`,
      [doc.id, version, f.name, f.mime, f.data.length, note, userId, up.driveId, up.itemId, up.versionId, up.webUrl, up.eTag]);
  } else {
    await c.query('INSERT INTO document_files(document_id,version,file_name,mime,size_bytes,data,note,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [doc.id, version, f.name, f.mime, f.data.length, f.data, note, userId]);
  }
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
  if (meta.confidential && !can(req.user, 'documents_confidential', 'view')) {
    const e = new Error("You can't mark a document confidential because your role can't view confidential documents."); e.status = 403; throw e;
  }
  const doc = await tx(async (c) => {
    const d = await c.query('INSERT INTO documents(title,category,description,confidential,current_version,created_by) VALUES ($1,$2,$3,$4,1,$5) RETURNING *',
      [meta.title, meta.category, meta.description, meta.confidential, req.user.id]);
    await insertVersion(c, d.rows[0], 1, f, 'Initial upload', req.user.id);
    await logActivity(c, req.user.id, 'uploaded', 'document', d.rows[0].id, `${meta.title} (${f.name})${sp.isEnabled() ? ' → SharePoint' : ''}`);
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
    await insertVersion(c, d, next, f, note, req.user.id);
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
  const next = { ...d, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
  await tx(async (c) => {
    await c.query(`UPDATE documents SET title=$1, category=$2, description=$3, confidential=$4 WHERE id=$5`,
      [next.title, next.category, next.description, next.confidential, d.id]);
    // Keep the SharePoint file name and folder in step with the title, category and confidentiality.
    if (sp.isEnabled() && (next.title !== d.title || next.category !== d.category || next.confidential !== d.confidential)) {
      const files = await c.query(
        `SELECT DISTINCT ON (sp_item_id) sp_item_id, file_name FROM document_files
          WHERE document_id=$1 AND sp_item_id IS NOT NULL ORDER BY sp_item_id, version DESC`, [d.id]);
      for (const x of files.rows) {
        try {
          const moved = await sp.move(x.sp_item_id, sp.folderFor(next), sp.fileNameFor(next, x.file_name));
          await c.query('UPDATE document_files SET sp_web_url=$1 WHERE sp_item_id=$2', [moved.webUrl, x.sp_item_id]);
        } catch (e) { if (e.graphStatus !== 404) throw e; }
      }
    }
    await logActivity(c, req.user.id, 'updated', 'document', d.id, next.title);
  });
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  assertCan(req.user, 'documents', 'delete');
  const d = await getDoc(req.params.id, req.user);
  const items = (await q('SELECT DISTINCT sp_item_id FROM document_files WHERE document_id=$1 AND sp_item_id IS NOT NULL', [d.id])).rows;
  // SharePoint files go to the SharePoint recycle bin, so they can still be recovered there.
  for (const it of items) await sp.remove(it.sp_item_id);
  await q('DELETE FROM documents WHERE id=$1', [d.id]);
  await q("DELETE FROM comments WHERE entity_type='document' AND entity_id=$1", [String(d.id)]);
  await logActivity({ query: q }, req.user.id, 'deleted', 'document', d.id, `${d.title}${items.length ? ' (SharePoint file moved to its recycle bin)' : ''}`);
  res.json({ ok: true });
});

export default r;
