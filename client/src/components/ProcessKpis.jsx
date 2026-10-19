// On a process page: the Customer Requirements (KPI) this process serves — read before its COPIS.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { ErrorNote, Modal } from './ui.jsx';
import LinkPicker from './LinkPicker.jsx';
import { KPI_STATUS_BADGE, KpiFormModal } from './kpi.jsx';

function MapModal({ open, onClose, process, onSaved }) {
  const { data: all } = useApi(open ? '/kpis' : null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setRows(process.kpis.map((k) => ({ kpi_id: k.id, role: k.role, outputs: (k.outputs || []).filter((o) => process.outputs.includes(o)) })));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = Object.fromEntries((all || []).map((k) => [k.id, k]));
  const pick = (ids) => setRows((cur) => ids.map((id) => cur.find((r) => r.kpi_id === id) || { kpi_id: id, role: 'Produces', outputs: [] }));
  const patch = (id, p) => setRows((cur) => cur.map((r) => (r.kpi_id === id ? { ...r, ...p } : r)));
  const toggle = (id, o) => setRows((cur) => cur.map((r) => (r.kpi_id !== id ? r : { ...r, outputs: r.outputs.includes(o) ? r.outputs.filter((x) => x !== o) : [...r.outputs, o] })));
  const save = async () => {
    setBusy(true);
    try { await api(`/kpis/by-process/${process.id}`, { method: 'PUT', body: { kpis: rows } }); onSaved(); onClose(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const options = (all || []).filter((k) => k.status !== 'Retired' || rows.some((r) => r.kpi_id === k.id))
    .map((k) => ({ value: k.id, label: k.name, hint: `${k.customer}${k.target ? ` · ${k.target}` : ''}` }));
  return (
    <Modal open={open} wide title={`KPIs served by ${process.id} ${process.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !all}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <ErrorNote error={err} />
      <p className="small muted" style={{ marginTop: 0 }}>Pick the Customer Requirements (KPI) this process delivers. For each, say whether it <b>produces</b> the result or <b>contributes</b> to it, and tick the outputs that prove it.</p>
      <div className="kpi-map-procs">
        <LinkPicker label="Customer Requirements (KPI)" options={options} value={rows.map((r) => r.kpi_id)} onChange={pick} height={300} />
        <div className="kpi-map-list">
          {rows.length === 0 && <div className="empty small">This process serves no KPI yet.</div>}
          {rows.map((r) => (
            <div key={r.kpi_id} className="kpi-map-proc">
              <div className="row">
                <b>{r.kpi_id}</b><span className="small" style={{ flex: 1 }}>{byId[r.kpi_id]?.name}</span>
                <select value={r.role} onChange={(e) => patch(r.kpi_id, { role: e.target.value })} aria-label={`Role for ${r.kpi_id}`} style={{ width: 'auto' }}>
                  <option>Produces</option><option>Contributes</option></select>
              </div>
              <div className="small muted" style={{ margin: '6px 0 4px' }}>Outputs that prove it</div>
              {process.outputs.length === 0 ? <div className="small flag">No COPIS outputs yet — add them with Edit COPIS.</div>
                : process.outputs.map((o) => <label key={o} className="kpi-out"><input type="checkbox" checked={r.outputs.includes(o)} onChange={() => toggle(r.kpi_id, o)} /> {o}</label>)}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function ProcessKpis({ process, canEdit, onSaved }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState(null); // 'map' | 'add'
  const kpis = process.kpis || [];
  const produces = kpis.filter((k) => k.role === 'Produces').length;
  return (
    <section className="kpi-proc-section">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="kpi-level-n" aria-hidden="true">1</span>
        <h3 style={{ margin: 0 }}>Customer Requirements (KPI) this process serves</h3>
        <span style={{ flex: 1 }} />
        {canEdit && <button className="btn sm" onClick={() => setMode('map')}>Map KPIs</button>}
        {can('kpis', 'add') && <button className="btn sm primary" onClick={() => setMode('add')}>Add new requirement</button>}
      </div>
      <p className="small muted" style={{ margin: '0 0 10px' }}>
        Begin with the end in mind: these are the results this process exists to deliver. The COPIS below is designed backwards from them — every output should prove one of these KPIs.
      </p>
      {kpis.length === 0 ? (
        <div className="notice error">No end in mind yet — this process is not mapped to any Customer Requirement (KPI). Map an existing one, or add the requirement it delivers.</div>
      ) : (
        <>
          {produces === 0 && <div className="notice small">This process only contributes to KPIs. Check whether it produces a result of its own.</div>}
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>KPI</th><th>Customer · requirement</th><th>KPI &amp; target</th><th>Role</th><th>Proved by output</th><th>Status</th></tr></thead>
              <tbody>
                {kpis.map((k) => {
                  const stale = (k.outputs || []).filter((o) => !process.outputs.includes(o));
                  const ok = (k.outputs || []).filter((o) => process.outputs.includes(o));
                  return (
                    <tr key={k.id}>
                      <td className="ref"><Link to={`/kpis/${k.id}`}>{k.id}</Link></td>
                      <td className="w-lg"><b>{k.customer}</b><div className="small">{k.requirement}</div></td>
                      <td className="w-md"><Link to={`/kpis/${k.id}`}>{k.name}</Link><div className="small muted">{k.target ? `Target ${k.target}` : 'No target yet'}</div></td>
                      <td><span className={`badge ${k.role === 'Produces' ? 'info' : 'neutral'}`}>{k.role}</span></td>
                      <td className="small">{ok.length ? ok.join('; ') : <span className="flag">None chosen</span>}
                        {stale.length > 0 && <div className="flag">No longer an output: {stale.join('; ')}</div>}</td>
                      <td><span className={`badge ${KPI_STATUS_BADGE[k.status]}`}>{k.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <MapModal open={mode === 'map'} process={process} onClose={() => setMode(null)} onSaved={onSaved} />
      <KpiFormModal open={mode === 'add'} presetProcess={{ process_id: process.id, domain_id: process.domain_id, role: 'Produces' }}
        onClose={() => setMode(null)} onSaved={(id) => nav(`/kpis/${id}`)} />
    </section>
  );
}
