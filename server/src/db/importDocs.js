// Import every file in a folder into the document library.
// Usage: npm run import-docs -- /path/to/folder [--category "Vendor SOW"]
// Skips files whose name already exists as the latest version of a document.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pool, tx } from './pool.js';

const MIME = {
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip', '.html': 'text/html', '.bpmn': 'application/xml', '.csv': 'text/csv', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/markdown',
};
function guessCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('sow') && n.endsWith('.pdf')) return 'Vendor proposal & SOW';
  if (n.includes('clarification') || n.endsWith('.docx')) return 'Correspondence';
  if (n.includes('reengineering') || n.includes('re-engineering')) return 'Re-engineering';
  if (n.includes('bpmn')) return 'Process diagrams';
  if (n.includes('reference') || n.includes('flow')) return 'Reference';
  if (n.endsWith('.xlsx')) return 'Analysis workbooks';
  if (n.endsWith('.html')) return 'Reference';
  return 'Other';
}
const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
const catIdx = args.indexOf('--category');
const forced = catIdx >= 0 ? args[catIdx + 1] : null;
if (!folder) { console.error('Usage: npm run import-docs -- /path/to/folder [--category "Name"]'); process.exit(1); }

const admin = (await pool.query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.key='project_manager' ORDER BY u.id LIMIT 1")).rows[0]?.id ?? null;
let added = 0;
for (const f of readdirSync(folder)) {
  const p = join(folder, f);
  if (!statSync(p).isFile() || f.startsWith('.')) continue;
  const size = statSync(p).size;
  if (size > 25 * 1024 * 1024) { console.log(`Skipped ${f} (over 25 MB)`); continue; }
  const exists = await pool.query(
    `SELECT 1 FROM documents d JOIN document_files v ON v.document_id=d.id AND v.version=d.current_version WHERE v.file_name=$1`, [f]);
  if (exists.rowCount) { console.log(`Skipped ${f} (already in library)`); continue; }
  const title = basename(f, extname(f)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  await tx(async (c) => {
    const d = await c.query('INSERT INTO documents(title,category,created_by,current_version) VALUES ($1,$2,$3,1) RETURNING id', [title, forced || guessCategory(f), admin]);
    await c.query('INSERT INTO document_files(document_id,version,file_name,mime,size_bytes,data,note,uploaded_by) VALUES ($1,1,$2,$3,$4,$5,$6,$7)',
      [d.rows[0].id, f, MIME[extname(f).toLowerCase()] || 'application/octet-stream', size, readFileSync(p), 'Imported', admin]);
  });
  console.log(`Imported ${f}`); added++;
}
console.log(`${added} document(s) imported.`);
await pool.end();
