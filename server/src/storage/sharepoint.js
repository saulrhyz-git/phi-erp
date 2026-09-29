// SharePoint / OneDrive document storage through Microsoft Graph, using an app registration
// (client credentials). Files live under one folder of one document library:
//   <SP_FOLDER>/<Category>/<doc id> - <title>.<ext>          (normal documents)
//   <SP_FOLDER>/_Confidential/<Category>/<doc id> - <title>.<ext>  (confidential documents)
// A new version of a document overwrites the same SharePoint file, so SharePoint's own version
// history matches the app's. Viewing always pulls the file from SharePoint, so edits made directly
// in SharePoint / Office Online are what people see.
import { Readable } from 'node:stream';
import { config } from '../config.js';

const sp = config.sharepoint;
const SMALL = 4 * 1024 * 1024;           // Graph simple-upload limit
const CHUNK = 20 * 327680;                // 6.25 MiB — upload-session chunks must be multiples of 320 KiB
let token = { value: '', expires: 0 };
let driveId = sp.driveId || '';
const folderIds = new Map();

export const isEnabled = () => sp.enabled;

export class GraphError extends Error {
  constructor(status, code, message) { super(message); this.status = status >= 500 ? 502 : status; this.code = code; this.graphStatus = status; }
}

async function getToken() {
  if (token.value && Date.now() < token.expires - 60_000) return token.value;
  if (!sp.tenantId || !sp.clientId || !sp.clientSecret) throw new GraphError(500, 'config', 'SharePoint is enabled but MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET are not all set.');
  const res = await fetch(`${sp.loginBase}/${sp.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: sp.clientId, client_secret: sp.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GraphError(res.status, 'auth', `Could not sign in to Microsoft: ${body.error_description?.split('\n')[0] || body.error || res.status}`);
  token = { value: body.access_token, expires: Date.now() + (body.expires_in || 3600) * 1000 };
  return token.value;
}

async function graph(method, path, { json, body, headers = {}, raw = false, absolute = false, noAuth = false, ok = [] } = {}) {
  const url = absolute ? path : `${sp.graphBase}${path}`;
  for (let attempt = 0; ; attempt++) {
    const h = { ...headers };
    if (!noAuth) h.Authorization = `Bearer ${await getToken()}`;
    if (json !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(url, { method, headers: h, body: json !== undefined ? JSON.stringify(json) : body, redirect: 'follow' });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {       // throttled: honour Retry-After
      const wait = Math.min(Number(res.headers.get('Retry-After') || 2 ** attempt), 30);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (res.status === 401 && attempt === 0 && !noAuth) { token.value = ''; continue; }
    if (!res.ok && !ok.includes(res.status)) {
      const err = await res.json().catch(() => ({}));
      throw new GraphError(res.status, err.error?.code || 'graph', `SharePoint: ${err.error?.message || res.statusText || res.status}`);
    }
    if (raw) return res;
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  }
}

// Path segments are URL-encoded individually; characters SharePoint rejects are replaced.
const clean = (s) => String(s).replace(/["*:<>?/\\|#%]/g, '-').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120) || 'file';
const enc = (path) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');

async function resolveDrive() {
  if (driveId) return driveId;
  if (!sp.siteUrl) throw new GraphError(500, 'config', 'Set SP_SITE_URL (or SP_DRIVE_ID) to use SharePoint storage.');
  const u = new URL(sp.siteUrl);
  const site = await graph('GET', `/sites/${u.hostname}:${u.pathname.replace(/\/+$/, '') || '/'}`);
  const drives = await graph('GET', `/sites/${site.id}/drives?$select=id,name`);
  const d = drives.value.find((x) => x.name.toLowerCase() === sp.library.toLowerCase());
  if (!d) throw new GraphError(404, 'config', `No document library called "${sp.library}" on ${sp.siteUrl}. Libraries: ${drives.value.map((x) => x.name).join(', ')}`);
  driveId = d.id;
  return driveId;
}

// Makes sure a folder path exists and returns its item id.
async function ensureFolder(path) {
  if (folderIds.has(path)) return folderIds.get(path);
  const drive = await resolveDrive();
  let parent = 'root';
  let sofar = '';
  for (const seg of path.split('/').filter(Boolean)) {
    sofar = sofar ? `${sofar}/${seg}` : seg;
    if (folderIds.has(sofar)) { parent = folderIds.get(sofar); continue; }
    const existing = await graph('GET', `/drives/${drive}/root:/${enc(sofar)}?$select=id,folder`, { ok: [404] });
    let item = existing && existing.id ? existing : null;
    if (!item) {
      item = await graph('POST', `/drives/${drive}/items/${parent}/children`,
        { json: { name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }, ok: [409] });
      if (!item?.id) item = await graph('GET', `/drives/${drive}/root:/${enc(sofar)}?$select=id`);
    }
    folderIds.set(sofar, item.id);
    parent = item.id;
  }
  return parent;
}

export function folderFor({ category, confidential }) {
  return [sp.folder, confidential ? '_Confidential' : null, clean(category)].filter(Boolean).join('/');
}
export function fileNameFor(doc, originalName) {
  const ext = (originalName.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
  return `${doc.id} - ${clean(doc.title)}${ext}`;
}

async function sessionUpload(uploadUrl, buf) {
  let item = null;
  for (let start = 0; start < buf.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, buf.length);
    const res = await graph('PUT', uploadUrl, {
      absolute: true, noAuth: true, raw: true, body: buf.subarray(start, end),   // upload URLs are pre-authorised
      headers: { 'Content-Length': String(end - start), 'Content-Range': `bytes ${start}-${end - 1}/${buf.length}` },
    });
    if (res.status === 200 || res.status === 201) item = await res.json();
  }
  return item;
}

// cTag changes only when the file content changes (eTag also changes on metadata edits).
const pick = (item) => ({ itemId: item.id, webUrl: item.webUrl, size: item.size, eTag: item.cTag || item.eTag });

// Uploads a new file into a folder (replacing a same-named file, which then gets a new version).
export async function uploadNew(folderPath, name, buf) {
  const drive = await resolveDrive();
  const parent = await ensureFolder(folderPath);
  let item;
  if (buf.length <= SMALL) {
    item = await graph('PUT', `/drives/${drive}/items/${parent}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=replace`,
      { body: buf, headers: { 'Content-Type': 'application/octet-stream' } });
  } else {
    const s = await graph('POST', `/drives/${drive}/items/${parent}:/${encodeURIComponent(name)}:/createUploadSession`,
      { json: { item: { '@microsoft.graph.conflictBehavior': 'replace' } } });
    item = await sessionUpload(s.uploadUrl, buf);
  }
  return { ...pick(item), driveId: drive, versionId: await currentVersion(drive, item.id) };
}

// Replaces the content of an existing file: SharePoint keeps the previous content as a version.
export async function uploadVersion(itemId, buf) {
  const drive = await resolveDrive();
  let item;
  if (buf.length <= SMALL) {
    item = await graph('PUT', `/drives/${drive}/items/${itemId}/content`, { body: buf, headers: { 'Content-Type': 'application/octet-stream' } });
  } else {
    const s = await graph('POST', `/drives/${drive}/items/${itemId}/createUploadSession`, { json: { item: { '@microsoft.graph.conflictBehavior': 'replace' } } });
    item = await sessionUpload(s.uploadUrl, buf);
  }
  return { ...pick(item), driveId: drive, versionId: await currentVersion(drive, item.id) };
}

export async function currentVersionOf(itemId) { return currentVersion(await resolveDrive(), itemId); }

async function currentVersion(drive, itemId) {
  const v = await graph('GET', `/drives/${drive}/items/${itemId}/versions?$select=id&$top=1`, { ok: [404] }).catch(() => null);
  return v?.value?.[0]?.id || null;
}

export async function itemInfo(itemId) {
  const drive = await resolveDrive();
  return graph('GET', `/drives/${drive}/items/${itemId}?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,file`, { ok: [404] });
}

// Streams the current file, or an earlier SharePoint version of it.
export async function download(itemId, versionId, isCurrent) {
  const drive = await resolveDrive();
  const path = isCurrent || !versionId
    ? `/drives/${drive}/items/${itemId}/content`
    : `/drives/${drive}/items/${itemId}/versions/${encodeURIComponent(versionId)}/content`;
  const res = await graph('GET', path, { raw: true });
  return { stream: Readable.fromWeb(res.body), length: res.headers.get('content-length'), type: res.headers.get('content-type') };
}

export async function move(itemId, folderPath, name) {
  const drive = await resolveDrive();
  const parent = await ensureFolder(folderPath);
  const item = await graph('PATCH', `/drives/${drive}/items/${itemId}`, {
    json: { parentReference: { id: parent }, ...(name ? { name } : {}), '@microsoft.graph.conflictBehavior': 'rename' },
  });
  return pick(item);
}

// Moves the file to the SharePoint recycle bin (recoverable there for 93 days by default).
export async function remove(itemId) {
  const drive = await resolveDrive();
  await graph('DELETE', `/drives/${drive}/items/${itemId}`, { ok: [404] });
}

// Every file under the app's folder, with the sub-folder path it sits in.
export async function listAll() {
  const drive = await resolveDrive();
  await ensureFolder(sp.folder);
  const out = [];
  const walk = async (path) => {
    let url = `/drives/${drive}/root:/${enc(path)}:/children?$top=200&$select=id,name,size,webUrl,file,folder,lastModifiedDateTime,cTag`;
    while (url) {
      const page = await graph('GET', url, { absolute: url.startsWith('http') });
      for (const it of page.value) {
        if (it.folder) await walk(`${path}/${it.name}`);
        else if (it.file) out.push({ ...it, folder: path.slice(sp.folder.length + 1) });
      }
      url = page['@odata.nextLink'] || null;
    }
  };
  await walk(sp.folder);
  return out;
}

export async function status() {
  if (!sp.enabled) return { enabled: false };
  try {
    const drive = await resolveDrive();
    const root = await ensureFolder(sp.folder);
    const f = await graph('GET', `/drives/${drive}/items/${root}?$select=webUrl`);
    return { enabled: true, ok: true, site: sp.siteUrl || null, library: sp.driveId ? '(drive id)' : sp.library, folder: sp.folder, webUrl: f.webUrl };
  } catch (e) {
    return { enabled: true, ok: false, site: sp.siteUrl || null, library: sp.library, folder: sp.folder, error: e.message };
  }
}
