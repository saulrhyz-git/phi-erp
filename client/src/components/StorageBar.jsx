import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, UploadCloud } from 'lucide-react';
import { api, fmtBytes } from '../api.js';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';

// Shows where document files live and offers SharePoint sync / migration.
export default function StorageBar({ onChanged }) {
  const { can } = useAuth();
  const { data, reload } = useApi('/documents/storage/status');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  if (!data) return null;
  const inDb = data.counts.find((c) => c.storage === 'db');
  const inSp = data.counts.find((c) => c.storage === 'sharepoint');
  const run = async (what) => {
    setBusy(what); setMsg(null);
    try {
      const r = await api(`/documents/storage/${what}`, { method: 'POST' });
      setMsg({ type: 'ok', text: what === 'sync'
        ? (r.skipped ? r.reason : `Checked ${r.files} SharePoint file(s): ${r.imported} new, ${r.updated} edited in SharePoint${r.missing ? `, ${r.missing} no longer found there` : ''}.`)
        : `Moved ${r.files} file(s) from ${r.documents} document(s) into SharePoint.` });
      reload(); onChanged?.();
    } catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(''); }
  };

  if (!data.enabled) {
    return (
      <div className="storagebar">
        <CloudOff size={18} aria-hidden="true" />
        <span>Files are stored in the app's database{inDb ? ` (${inDb.files} files, ${fmtBytes(Number(inDb.bytes))})` : ''}. SharePoint storage is not switched on — see “SharePoint storage” in the README.</span>
      </div>
    );
  }
  return (
    <>
      <div className={`storagebar ${data.ok ? 'ok' : 'bad'}`}>
        <Cloud size={18} aria-hidden="true" />
        {data.ok
          ? <span>Files are stored in SharePoint: <a href={data.webUrl} target="_blank" rel="noreferrer"><b>{data.folder}</b></a>. Uploads go straight there; viewing always pulls the latest from SharePoint.
              {inDb ? <> <b>{inDb.files}</b> older file(s) are still in the app's database.</> : null}</span>
          : <span><b>SharePoint is not reachable:</b> {data.error}</span>}
        <span style={{ flex: 1 }} />
        {data.ok && can('documents', 'add') && <button className="btn sm" onClick={() => run('sync')} disabled={!!busy}><RefreshCw size={14} className={busy === 'sync' ? 'spin' : ''} /> {busy === 'sync' ? 'Syncing…' : 'Sync with SharePoint'}</button>}
        {data.ok && inDb && data.canManage && <button className="btn sm primary" onClick={() => window.confirm(`Move ${inDb.files} file(s) from the app's database into SharePoint? Version history is kept.`) && run('migrate')} disabled={!!busy}>
          <UploadCloud size={14} /> {busy === 'migrate' ? 'Moving…' : 'Move files to SharePoint'}</button>}
      </div>
      {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
      {inSp && null}
    </>
  );
}
