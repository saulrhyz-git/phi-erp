import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, Loading, Modal, SheetHead } from '../components/ui.jsx';
import LinkPicker from '../components/LinkPicker.jsx';
import { KPI_STATUS_BADGE, LinkPills, REPORT_STATUS_BADGE, useDomainChoices } from '../components/kpi.jsx';

const REPORT_LINKS = [
  ['kpi', 'Customer Requirements (KPI) it shows'],
  ['process', 'Processes that produce its data'],
  ['master_data', 'Master data it reads'],
  ['tk_record', 'UAT scripts / fit-gap that prove it'],
  ['document', 'Documents (spec, sample layout)'],
];
const BLANK = { name: '', type: 'Report', purpose: '', audience: '', frequency: '', format: '', contents: '', data_sources: '', owner: '', domain_id: '', status: 'Proposed', notes: '' };

export function ReportFormModal({ open, onClose, report, onSaved }) {
  const { data: opts } = useApi(open ? '/reports/options' : null);
  const { domains, projectWide } = useDomainChoices('reports', report ? 'edit' : 'add');
  const [f, setF] = useState(BLANK);
  const [links, setLinks] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(report ? { ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, report[k] ?? ''])) } : { ...BLANK, domain_id: domains.length === 1 && !projectWide ? domains[0].id : '' });
    setLinks(Object.fromEntries(REPORT_LINKS.map(([t]) => [t, (report?.links?.[t] || []).map((x) => x.id)])));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, domain_id: f.domain_id || null, links };
      if (report) { await api(`/reports/${report.id}`, { method: 'PUT', body }); onSaved?.(report.id); }
      else { const r = await api('/reports', { method: 'POST', body }); onSaved?.(r.id); }
      onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} wide title={report ? `Edit ${report.id}` : 'Add a report to the register'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !opts}>{busy ? 'Saving…' : report ? 'Save' : 'Add report'}</button></>}>
      <ErrorNote error={err} />
      {opts && (
        <>
          <div className="grid2">
            <label className="field"><span>Report name</span><input type="text" value={f.name} onChange={set('name')} placeholder="e.g. Reservation-to-CTS aging" /></label>
            <label className="field"><span>Type</span><select value={f.type} onChange={set('type')}>{opts.types.map((t) => <option key={t}>{t}</option>)}</select></label>
          </div>
          <label className="field"><span>Purpose — the decision or action it supports</span><textarea value={f.purpose} onChange={set('purpose')} style={{ minHeight: 56 }} /></label>
          <div className="grid2">
            <label className="field"><span>Audience</span><input type="text" value={f.audience} onChange={set('audience')} placeholder="e.g. Sales managers, ManCom, buyers" /></label>
            <label className="field"><span>Frequency</span><input type="text" value={f.frequency} onChange={set('frequency')} placeholder="e.g. Daily, month-end, on demand" /></label>
            <label className="field"><span>Format</span><input type="text" value={f.format} onChange={set('format')} placeholder="e.g. On screen, PDF, XLSX, email" /></label>
            <label className="field"><span>Data sources</span><input type="text" value={f.data_sources} onChange={set('data_sources')} /></label>
          </div>
          <label className="field"><span>Contents — measures, columns, filters, drill-downs</span><textarea value={f.contents} onChange={set('contents')} style={{ minHeight: 70 }} /></label>
          <div className="grid2">
            <label className="field"><span>Report owner</span><input type="text" value={f.owner} onChange={set('owner')} /></label>
            <label className="field"><span>Domain</span>
              <select value={f.domain_id || ''} onChange={set('domain_id')}>
                {projectWide && <option value="">Project-wide (Project Manager only)</option>}
                {!projectWide && !f.domain_id && <option value="">Choose your domain</option>}
                {domains.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.name}</option>)}
                {f.domain_id && !domains.some((d) => d.id === f.domain_id) && <option value={f.domain_id}>{f.domain_id}</option>}
              </select></label>
            <label className="field"><span>Status</span><select value={f.status} onChange={set('status')}>{opts.statuses.map((t) => <option key={t}>{t}</option>)}</select></label>
          </div>
          <label className="field"><span>Notes</span><textarea value={f.notes} onChange={set('notes')} style={{ minHeight: 50 }} /></label>
          <h4 className="kpi-form-h">Map it</h4>
          <div className="linkgrid">
            {REPORT_LINKS.map(([t, label]) => (
              <LinkPicker key={t} label={label} options={opts[t] || []} value={links[t] || []} onChange={(v) => setLinks({ ...links, [t]: v })} />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Reports() {
  const { can } = useAuth();
  const nav = useNavigate();
  const { data, error, loading } = useApi('/reports');
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const rows = useMemo(() => (data || []).filter((r) => !q || `${r.id} ${r.name} ${r.type} ${r.audience} ${r.owner} ${r.purpose}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (loading && !data) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const live = data.filter((r) => r.status !== 'Retired');
  const noKpi = live.filter((r) => !(r.links.kpi || []).length).length;
  const noProc = live.filter((r) => !(r.links.process || []).length).length;
  return (
    <section className="sheet">
      <SheetHead code="RPT · where KPIs are seen" title="Reports register"
        actions={can('reports', 'add') && <button className="btn primary" onClick={() => setAdding(true)}>Add report</button>}>
        Every report, dashboard, statement, statutory form and alert the business needs — defined before anything is built,
        tied to the Customer Requirements (KPI) it shows, the processes that produce its data and the UAT that proves it.
      </SheetHead>
      <div className="stats">
        <div className="stat"><b>{live.length}</b><span>Active reports · {live.filter((r) => r.status === 'Live').length} live</span></div>
        <div className="stat"><b className={noKpi ? 'flag' : ''}>{noKpi}</b><span>Show no KPI — check they are needed</span></div>
        <div className="stat"><b className={noProc ? 'flag' : ''}>{noProc}</b><span>No producing process mapped</span></div>
      </div>
      <div className="row kpi-filters">
        <input type="search" placeholder="Search reports…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" style={{ maxWidth: 320 }} />
        <span className="muted small">{rows.length} shown</span>
      </div>
      {data.length === 0 ? <div className="empty">No reports yet{can('reports', 'add') ? ' — add the reports each Customer Requirement (KPI) needs to be seen in.' : '.'}</div> : (
        <div className="tablewrap">
          <table className="t">
            <thead><tr><th>Report</th><th>Name &amp; purpose</th><th>Type</th><th>Audience · frequency</th><th>Shows KPIs</th><th>From processes</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="ref"><Link to={`/reports/${r.id}`}>{r.id}</Link>{r.domain_id && <div><span className="domain">{r.domain_id}</span></div>}</td>
                  <td className="w-lg"><Link to={`/reports/${r.id}`}><b>{r.name}</b></Link>{r.purpose && <div className="small muted">{r.purpose}</div>}</td>
                  <td>{r.type}</td>
                  <td className="small">{[r.audience, r.frequency].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                  <td>{(r.links.kpi || []).length ? r.links.kpi.map((k) => <Link key={k.id} className="pill" to={`/kpis/${k.id}`} title={k.label}>{k.id}</Link>) : <span className="flag small">None</span>}</td>
                  <td>{(r.links.process || []).length ? r.links.process.map((p) => <Link key={p.id} className="pill" to={`/processes/${p.id}`} title={p.label}>{p.id}</Link>) : <span className="muted small">—</span>}</td>
                  <td><span className={`badge ${REPORT_STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReportFormModal open={adding} onClose={() => setAdding(false)} onSaved={(id) => nav(`/reports/${id}`)} />
    </section>
  );
}

export function ReportDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: r, error, loading, reload } = useApi(`/reports/${id}`);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState(null);
  if (loading && !r) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const remove = async () => {
    if (!window.confirm(`Delete ${r.id} ${r.name}? Its links to KPIs and processes are removed too. Consider marking it Retired instead.`)) return;
    try { await api(`/reports/${r.id}`, { method: 'DELETE' }); nav('/reports'); } catch (e) { setErr(e); }
  };
  const L = r.links;
  return (
    <section className="sheet">
      <SheetHead code={`${r.id} · ${r.type}`} title={r.name}
        actions={<>
          {r.can_edit && <button className="btn primary" onClick={() => setEditing(true)}>Edit report &amp; mapping</button>}
          {r.can_delete && <button className="btn danger" onClick={remove}>Delete</button>}
        </>}>
        <span className={`badge ${REPORT_STATUS_BADGE[r.status]}`}>{r.status}</span>{' '}
        {r.domain_id ? <span className="domain">{r.domain_id} · {r.domain_name}</span> : <span className="domain none">Project-wide</span>}
        <span className="small muted"> · updated {fmtDateTime(r.updated_at)}{r.updated_by_name ? ` by ${r.updated_by_name}` : ''}</span>
      </SheetHead>
      <ErrorNote error={err} />
      <h3>Customer Requirements (KPI) it shows</h3>
      {(L.kpi || []).length === 0 ? <div className="empty small">This report shows no KPI yet. If no customer requirement needs it, question whether it should be built.</div> : (
        <div className="kpi-cards">
          {L.kpi.map((k) => (
            <Link key={k.id} to={`/kpis/${k.id}`} className="kpi-card"><span className="ref">{k.id}</span> <b>{k.label}</b>
              <span className={`badge ${KPI_STATUS_BADGE[k.hint] || 'neutral'}`}>{k.hint}</span></Link>
          ))}
        </div>
      )}
      <h3>Definition</h3>
      <dl className="kv">
        <dt>Purpose</dt><dd>{r.purpose || <span className="flag">Not stated</span>}</dd>
        <dt>Audience</dt><dd>{r.audience || '—'}</dd>
        <dt>Frequency</dt><dd>{r.frequency || '—'}</dd>
        <dt>Format</dt><dd>{r.format || '—'}</dd>
        <dt>Contents</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.contents || '—'}</dd>
        <dt>Data sources</dt><dd>{r.data_sources || '—'}</dd>
        <dt>Owner</dt><dd>{r.owner || '—'}</dd>
        {r.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</dd></>}
      </dl>
      <h3>Mapping</h3>
      <dl className="kv">
        <dt>Produced from processes</dt><dd><LinkPills type="process" items={L.process} empty="None mapped" /></dd>
        <dt>Master data</dt><dd><LinkPills type="master_data" items={L.master_data} empty="None mapped" /></dd>
        <dt>UAT / fit-gap</dt><dd><LinkPills type="tk_record" items={L.tk_record} empty="None mapped" /></dd>
        <dt>Documents</dt><dd><LinkPills type="document" items={L.document} empty="None mapped" /></dd>
      </dl>
      <Comments type="report" id={r.id} />
      <ReportFormModal open={editing} report={r} onClose={() => setEditing(false)} onSaved={reload} />
    </section>
  );
}
