import { useRef, useState } from 'react';
import { api, fmtBytes, fmtDateTime, uploadFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, Loading, Modal, SheetHead } from '../components/ui.jsx';

function FilePicker({ file, setFile }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  return (
    <div className={`filebox${drag ? ' drag' : ''}`} role="button" tabIndex={0}
      onClick={() => input.current.click()} onKeyDown={(e) => e.key === 'Enter' && input.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}>
      <input ref={input} type="file" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
      {file ? <><b>{file.name}</b><div className="small muted">{fmtBytes(file.size)} · click to change</div></> : <>Drop a file here or click to choose<div className="small muted">Up to 25 MB</div></>}
    </div>
  );
}

export default function Documents() {
  const { can } = useAuth();
  const canAdd = can('documents', 'add'); const isEditor = can('documents', 'edit'); const canDelete = can('documents', 'delete');
  const { data, error, loading, reload } = useApi('/documents');
  const [upload, setUpload] = useState(null); // { mode: 'new' } | { mode: 'version', doc }
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ title: '', category: 'Other', description: '', confidential: false, note: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [cat, setCat] = useState('');
  const [qText, setQ] = useState('');

  const openNew = () => { setFile(null); setErr(null); setMeta({ title: '', category: data.categories[0], description: '', confidential: false, note: '' }); setUpload({ mode: 'new' }); };
  const openVersion = (doc) => { setFile(null); setErr(null); setMeta({ ...meta, note: '' }); setUpload({ mode: 'version', doc }); };
  const openDetail = async (doc) => setDetail(await api(`/documents/${doc.id}`));
  const submit = async () => {
    if (!file) { setErr(new Error('Choose a file first.')); return; }
    setBusy(true);
    try {
      if (upload.mode === 'new') {
        await uploadFile('/documents', file, { 'X-Doc-Title': meta.title || file.name.replace(/\.[^.]+$/, ''), 'X-Doc-Category': meta.category,
          'X-Doc-Description': meta.description, 'X-Doc-Confidential': String(meta.confidential) });
      } else {
        await uploadFile(`/documents/${upload.doc.id}/versions`, file, { 'X-Version-Note': meta.note });
      }
      setUpload(null); reload();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const del = async (d) => {
    if (!window.confirm(`Delete "${d.title}" and all its versions? This can't be undone.`)) return;
    await api(`/documents/${d.id}`, { method: 'DELETE' }); setDetail(null); reload();
  };
  const saveMeta = async () => {
    await api(`/documents/${detail.id}`, { method: 'PUT', body: { title: detail.title, category: detail.category, description: detail.description, confidential: detail.confidential } });
    reload();
  };

  if (loading && !data) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const docs = data.documents.filter((d) => (!cat || d.category === cat) && (!qText || `${d.title} ${d.file_name} ${d.description}`.toLowerCase().includes(qText.toLowerCase())));
  const groups = data.categories.filter((c) => docs.some((d) => d.category === c));
  const isPdf = (m) => m === 'application/pdf' || m?.startsWith('image/');

  return (
    <section className="sheet">
      <SheetHead code="S-8" title="Project documents" actions={canAdd && <button className="btn primary" onClick={openNew}>Upload document</button>}>
        One library for the SOW, correspondence with AWB, analysis workbooks and diagrams. Every upload is versioned; older versions stay downloadable.
      </SheetHead>
      <div className="toolbar">
        <input type="search" placeholder="Search documents…" value={qText} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{data.categories.map((c) => <option key={c}>{c}</option>)}</select>
        <span className="muted small">{docs.length} documents</span>
      </div>
      {docs.length === 0 && <div className="empty">{data.documents.length ? 'No documents match.' : 'No documents yet. Upload the SOW, the clarification letter and the analysis workbooks to start.'}</div>}
      {groups.map((g) => (
        <div className="doccat" key={g}>
          <h3>{g}</h3>
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Document</th><th>File</th><th>Version</th><th>Updated</th><th /></tr></thead>
            <tbody>{docs.filter((d) => d.category === g).map((d) => (
              <tr key={d.id}>
                <td className="w-md"><b>{d.title}</b>{d.confidential && <span className="pill" style={{ marginLeft: 6 }}>Confidential</span>}{d.description && <div className="small muted">{d.description}</div>}</td>
                <td className="small">{d.file_name}<div className="muted">{fmtBytes(d.size_bytes)}</div></td>
                <td>v{d.current_version}</td>
                <td className="small">{fmtDateTime(d.uploaded_at)}<div className="muted">{d.uploaded_by_name}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <a className="btn sm" href={`/api/documents/${d.id}/download`}>Download</a>{' '}
                  {isPdf(d.mime) && <><a className="btn sm ghost" href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noreferrer">Open</a>{' '}</>}
                  {isEditor && <><button className="btn sm ghost" onClick={() => openVersion(d)}>New version</button>{' '}</>}
                  <button className="btn sm ghost" onClick={() => openDetail(d)}>Details{d.comment_count ? ` (${d.comment_count})` : ''}</button>
                </td>
              </tr>))}</tbody>
          </table></div>
        </div>
      ))}

      <Modal open={!!upload} title={upload?.mode === 'version' ? `New version — ${upload.doc.title}` : 'Upload document'} onClose={() => setUpload(null)}
        footer={<><button className="btn ghost" onClick={() => setUpload(null)}>Cancel</button><button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button></>}>
        <ErrorNote error={err} />
        <FilePicker file={file} setFile={setFile} />
        {upload?.mode === 'new' ? (
          <div style={{ marginTop: 12 }}>
            <label className="field"><span>Title</span><input type="text" value={meta.title} placeholder={file?.name.replace(/\.[^.]+$/, '') || ''} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></label>
            <label className="field"><span>Category</span><select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>{data.categories.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="field"><span>Description</span><textarea value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></label>
            <label className="row small"><input type="checkbox" checked={meta.confidential} onChange={(e) => setMeta({ ...meta, confidential: e.target.checked })} /> Confidential — hidden from viewers</label>
          </div>
        ) : (
          <label className="field" style={{ marginTop: 12 }}><span>What changed?</span><input type="text" value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} /></label>
        )}
      </Modal>

      <Modal open={!!detail} title={detail?.title || ''} onClose={() => { setDetail(null); reload(); }}
        footer={<>{canDelete && <button className="btn danger" onClick={() => del(detail)}>Delete</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={() => { setDetail(null); reload(); }}>Close</button></>}>
        {detail && (
          <>
            {isEditor && (
              <>
                <div className="grid2">
                  <label className="field"><span>Title</span><input type="text" value={detail.title} onChange={(e) => setDetail({ ...detail, title: e.target.value })} /></label>
                  <label className="field"><span>Category</span><select value={detail.category} onChange={(e) => setDetail({ ...detail, category: e.target.value })}>{data.categories.map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                <label className="field"><span>Description</span><textarea value={detail.description} onChange={(e) => setDetail({ ...detail, description: e.target.value })} style={{ minHeight: 50 }} /></label>
                <div className="row"><label className="row small"><input type="checkbox" checked={detail.confidential} onChange={(e) => setDetail({ ...detail, confidential: e.target.checked })} /> Confidential</label><span style={{ flex: 1 }} /><button className="btn sm primary" onClick={saveMeta}>Save details</button></div>
              </>
            )}
            <h3>Versions</h3>
            <ul style={{ paddingLeft: 18 }}>{detail.versions.map((v) => (
              <li key={v.version} className="small" style={{ marginBottom: 6 }}>
                <b>v{v.version}</b> {v.file_name} · {fmtBytes(v.size_bytes)} · {fmtDateTime(v.uploaded_at)} {v.uploaded_by_name && `· ${v.uploaded_by_name}`}
                {v.note && <span className="muted"> — {v.note}</span>} <a href={`/api/documents/${detail.id}/download?v=${v.version}`}>Download</a>
              </li>))}</ul>
            <Comments type="document" id={detail.id} />
          </>
        )}
      </Modal>
    </section>
  );
}
