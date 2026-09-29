// Usage: npm run docs:to-sharepoint
// Moves every document file still stored in the database into SharePoint (oldest version first, so
// SharePoint's version history matches), then removes the bytes from the database. Safe to re-run.
import { pool } from './pool.js';
import * as sp from '../storage/sharepoint.js';
import { migrateToSharePoint } from '../storage/docsync.js';

const st = await sp.status();
if (!st.enabled) { console.error('Set SP_ENABLED=true (and the MS_* / SP_* settings) in .env first.'); process.exit(1); }
if (!st.ok) { console.error(`Cannot reach SharePoint: ${st.error}`); process.exit(1); }
console.log(`SharePoint folder: ${st.webUrl}`);
const out = await migrateToSharePoint((m) => console.log(m));
console.log(`Done: ${out.files} file(s) from ${out.documents} document(s) moved to SharePoint.`);
await pool.end();
