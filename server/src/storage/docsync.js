// Moving document files into SharePoint, and bringing in changes made directly in SharePoint.
import { pool, tx } from '../db/pool.js';
import * as sp from './sharepoint.js';

export const CATEGORIES = ['Vendor proposal & SOW', 'Correspondence', 'Analysis workbooks', 'Re-engineering', 'Process diagrams', 'Reference', 'Meeting notes', 'Other'];
const SYNC_LOCK = 734_119;   // pg advisory lock id: only one sync at a time across server instances

const extOf = (n) => (String(n).match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();

// Uploads one file for a document: a new version of the existing SharePoint file when possible.
export async function storeFile(doc, fileName, buf) {
  const cur = (await pool.query(
    `SELECT sp_item_id, file_name FROM document_files WHERE document_id=$1 AND storage='sharepoint' ORDER BY version DESC LIMIT 1`, [doc.id])).rows[0];
  if (cur && extOf(cur.file_name) === extOf(fileName)) {
    try { return await sp.uploadVersion(cur.sp_item_id, buf); } catch (e) { if (e.graphStatus !== 404) throw e; }   // file removed in SharePoint: upload afresh
  }
  return sp.uploadNew(sp.folderFor(doc), sp.fileNameFor(doc, fileName), buf);
}

// Pushes every database-stored file into SharePoint, oldest version first, then clears the bytes.
export async function migrateToSharePoint(log = () => {}) {
  if (!sp.isEnabled()) throw Object.assign(new Error('SharePoint storage is not enabled (SP_ENABLED=true).'), { status: 400 });
  const docs = (await pool.query(
    `SELECT DISTINCT d.* FROM documents d JOIN document_files f ON f.document_id=d.id WHERE f.storage='db' ORDER BY d.id`)).rows;
  let files = 0;
  for (const d of docs) {
    const rows = (await pool.query(`SELECT id, version, file_name, data FROM document_files WHERE document_id=$1 AND storage='db' ORDER BY version`, [d.id])).rows;
    for (const f of rows) {
      const up = await storeFile(d, f.file_name, f.data);
      await pool.query(
        `UPDATE document_files SET storage='sharepoint', data=NULL, sp_drive_id=$1, sp_item_id=$2, sp_version_id=$3, sp_web_url=$4, sp_etag=$5 WHERE id=$6`,
        [up.driveId, up.itemId, up.versionId, up.webUrl, up.eTag, f.id]);
      files++;
      log(`  ${d.title} v${f.version} → SharePoint`);
    }
  }
  return { documents: docs.length, files };
}

const titleFromName = (n) => n.replace(/\.[^.]+$/, '').replace(/^\d+\s*-\s*/, '').replace(/[_]+/g, ' ').trim() || n;

// Imports files added directly in the SharePoint folder, and records edits made in SharePoint as new versions.
export async function syncFromSharePoint(userId = null) {
  if (!sp.isEnabled()) throw Object.assign(new Error('SharePoint storage is not enabled.'), { status: 400 });
  const lock = await pool.connect();
  try {
    const got = await lock.query('SELECT pg_try_advisory_lock($1) AS ok', [SYNC_LOCK]);
    if (!got.rows[0].ok) return { skipped: true, reason: 'A sync is already running.' };
    const items = await sp.listAll();
    const linked = new Map((await pool.query(
      `SELECT DISTINCT ON (f.sp_item_id) f.sp_item_id, f.document_id, f.version, f.sp_etag, d.current_version, d.title
         FROM document_files f JOIN documents d ON d.id=f.document_id
        WHERE f.sp_item_id IS NOT NULL ORDER BY f.sp_item_id, f.version DESC`)).rows.map((r) => [r.sp_item_id, r]));
    const result = { imported: 0, updated: 0, missing: 0, files: items.length };
    for (const it of items) {
      const known = linked.get(it.id);
      if (!known) {
        const parts = it.folder.split('/').filter(Boolean);
        const confidential = parts[0] === '_Confidential';
        const catName = confidential ? parts[1] : parts[0];
        const category = CATEGORIES.find((c) => c.toLowerCase() === String(catName || '').toLowerCase()) || 'Other';
        const info = await sp.itemInfo(it.id);
        const versionId = await sp.currentVersionOf(it.id).catch(() => null);
        await tx(async (c) => {
          const d = await c.query('INSERT INTO documents(title,category,description,confidential,current_version,created_by) VALUES ($1,$2,$3,$4,1,$5) RETURNING id',
            [titleFromName(it.name), category, 'Added directly in SharePoint', confidential, userId]);
          await c.query(
            `INSERT INTO document_files(document_id,version,file_name,mime,size_bytes,note,uploaded_by,storage,sp_drive_id,sp_item_id,sp_version_id,sp_web_url,sp_etag,uploaded_at)
             VALUES ($1,1,$2,$3,$4,$5,$6,'sharepoint',$7,$8,$9,$10,$11,$12)`,
            [d.rows[0].id, it.name, it.file?.mimeType || 'application/octet-stream', it.size || 0,
              `Imported from SharePoint${info?.lastModifiedBy?.user?.displayName ? ` (added by ${info.lastModifiedBy.user.displayName})` : ''}`,
              userId, null, it.id, versionId || null, it.webUrl, it.cTag, it.lastModifiedDateTime || new Date()]);
        });
        result.imported++;
      } else if (it.cTag && known.sp_etag && it.cTag !== known.sp_etag && known.version === known.current_version) {
        // Edited in SharePoint / Office Online since the app last saw it: record it as a new version.
        const info = await sp.itemInfo(it.id);
        const versionId = await sp.currentVersionOf(it.id).catch(() => null);
        await tx(async (c) => {
          const next = known.current_version + 1;
          const prev = (await c.query('SELECT file_name, mime FROM document_files WHERE document_id=$1 AND version=$2', [known.document_id, known.version])).rows[0];
          await c.query(
            `INSERT INTO document_files(document_id,version,file_name,mime,size_bytes,note,uploaded_by,storage,sp_item_id,sp_version_id,sp_web_url,sp_etag,uploaded_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'sharepoint',$8,$11,$9,$10,$12)`,
            [known.document_id, next, prev.file_name, prev.mime, it.size || 0,
              `Edited in SharePoint${info?.lastModifiedBy?.user?.displayName ? ` by ${info.lastModifiedBy.user.displayName}` : ''}`,
              userId, it.id, it.webUrl, it.cTag, versionId, it.lastModifiedDateTime || new Date()]);
          await c.query('UPDATE documents SET current_version=$1 WHERE id=$2', [next, known.document_id]);
        });
        result.updated++;
      }
    }
    const present = new Set(items.map((i) => i.id));
    result.missing = [...linked.keys()].filter((k) => !present.has(k)).length;
    return result;
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK]).catch(() => {});
    lock.release();
  }
}
