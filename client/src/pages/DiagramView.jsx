import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, Loading, SheetHead } from '../components/ui.jsx';

export default function DiagramView() {
  const { id } = useParams();
  const { can } = useAuth();
  const isEditor = can('diagrams', 'edit');
  const { data, error, loading, reload } = useApi(`/diagrams/${id}`);
  const container = useRef(null);
  const instance = useRef(null);
  const [mode, setMode] = useState('view'); // view | edit
  const [shown, setShown] = useState(null); // { version, xml }
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) setShown({ version: data.current_version, xml: data.xml }); }, [data]);

  // (Re)create the bpmn-js instance whenever the mode or displayed XML changes.
  useEffect(() => {
    if (!shown || !container.current) return undefined;
    let cancelled = false;
    (async () => {
      const Ctor = mode === 'edit'
        ? (await import('bpmn-js/lib/Modeler')).default
        : (await import('bpmn-js/lib/NavigatedViewer')).default;
      if (cancelled) return;
      instance.current?.destroy();
      const bpmn = new Ctor({ container: container.current, keyboard: { bindTo: document } });
      instance.current = bpmn;
      try {
        await bpmn.importXML(shown.xml);
        bpmn.get('canvas').zoom('fit-viewport', 'auto');
        if (mode === 'edit') bpmn.on('commandStack.changed', () => setDirty(true));
      } catch (e) {
        setMsg({ type: 'error', text: `This diagram could not be displayed: ${e.message}` });
      }
    })();
    return () => { cancelled = true; };
  }, [mode, shown]);

  useEffect(() => () => instance.current?.destroy(), []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const fit = () => instance.current?.get('canvas').zoom('fit-viewport', 'auto');
  const zoom = (f) => { const c = instance.current?.get('canvas'); if (c) c.zoom(c.zoom() * f); };

  const startEdit = () => {
    setShown({ version: data.current_version, xml: data.xml });
    setMode('edit'); setDirty(false); setMsg(null);
  };
  const cancelEdit = () => {
    if (dirty && !window.confirm('Discard your unsaved changes to this diagram?')) return;
    setMode('view'); setDirty(false); setShown({ version: data.current_version, xml: data.xml });
  };
  const save = async () => {
    setBusy(true);
    try {
      const { xml } = await instance.current.saveXML({ format: true });
      const r = await api(`/diagrams/${id}/versions`, { method: 'POST', body: { xml, note } });
      setMsg({ type: 'ok', text: `Saved as version ${r.version}.` });
      setDirty(false); setNote(''); setMode('view');
      reload();
    } catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const showVersion = useCallback(async (v) => {
    if (mode === 'edit') return;
    const r = await api(`/diagrams/${id}/versions/${v}`);
    setShown({ version: v, xml: r.xml });
    setMsg(null);
  }, [id, mode]);
  const restore = async (v) => {
    if (!window.confirm(`Make version ${v} the current version? This adds a new version; nothing is deleted.`)) return;
    try {
      const r = await api(`/diagrams/${id}/restore/${v}`, { method: 'POST' });
      setMsg({ type: 'ok', text: `Version ${v} restored as version ${r.version}.` });
      reload();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  if (loading && !data) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const viewingOld = shown && shown.version !== data.current_version;

  return (
    <>
      <section className="sheet">
        <SheetHead code={data.id} title={data.title}
          actions={<Link className="btn ghost" to="/diagrams">All diagrams</Link>}>
          Covers {data.covers}. {data.description}
        </SheetHead>
        {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
        {viewingOld && (
          <div className="notice">
            Viewing version {shown.version} (read-only). The current version is {data.current_version}.{' '}
            <span className="row" style={{ display: 'inline-flex', marginLeft: 8 }}>
              {isEditor && <button className="btn sm" onClick={() => restore(shown.version)}>Restore this version</button>}
              <button className="btn sm ghost" onClick={() => setShown({ version: data.current_version, xml: data.xml })}>Back to current</button>
            </span>
          </div>
        )}
        <div className="dtools">
          <button className="btn ghost" onClick={fit}>Fit to screen</button>
          <button className="btn ghost" onClick={() => zoom(1.2)} aria-label="Zoom in">+</button>
          <button className="btn ghost" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</button>
          <a className="btn ghost" href={`/api/diagrams/${id}/download${viewingOld ? `?v=${shown.version}` : ''}`}>Download .bpmn</a>
          <span style={{ flex: 1 }} />
          {mode === 'view' && isEditor && !viewingOld && <button className="btn primary" onClick={startEdit}>Edit diagram</button>}
          {mode === 'edit' && (
            <>
              <input type="text" placeholder="What changed? (saved with the version)" value={note} onChange={(e) => setNote(e.target.value)}
                style={{ width: 'min(340px, 100%)' }} aria-label="Version note" />
              <button className="btn ghost" onClick={cancelEdit}>Cancel</button>
              <button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save new version'}</button>
            </>
          )}
        </div>
        <div className="canvas" ref={container} />
        {mode === 'edit' && <p className="muted small">Use the palette on the left to add BPMN elements. Drag from an element's context pad to connect it. Ctrl/Cmd+Z undoes.</p>}
      </section>
      <section className="sheet">
        <div className="grid2" style={{ gap: 24 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Version history</h3>
            <ol className="versions" reversed>
              {data.versions.map((v) => (
                <li key={v.version}>
                  <b>v{v.version}</b> {v.version === data.current_version && <span className="status approved">Current</span>}{' '}
                  {v.note || <span className="muted">No note</span>}
                  <div className="muted small">{v.created_by_name || 'Seed'} · {fmtDateTime(v.created_at)}{' '}
                    {mode === 'view' && v.version !== shown?.version && <button className="btn sm ghost" onClick={() => showVersion(v.version)}>View</button>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div><Comments type="diagram" id={data.id} /></div>
        </div>
      </section>
    </>
  );
}
