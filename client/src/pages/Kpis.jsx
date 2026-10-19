import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { ErrorNote, Loading, SheetHead } from '../components/ui.jsx';
import { HealthBar, KPI_STATUS_BADGE, KpiFormModal, LinkPills, PRIORITY_BADGE } from '../components/kpi.jsx';

// Customer Requirements (KPI): the top of the hierarchy. Every process exists to deliver one of these.
export default function Kpis() {
  const { can } = useAuth();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi('/kpis');
  const [adding, setAdding] = useState(false);
  const [gen, setGen] = useState(null);
  const generateAll = async () => {
    if (!window.confirm('Generate a swimlane for every active KPI that has processes mapped? Existing KPI swimlanes get a new version; earlier versions can be restored.')) return;
    setGen({ busy: true });
    try { const r = await api('/kpis/swimlanes/generate', { method: 'POST' }); setGen({ ok: r }); reload(); }
    catch (e) { setGen({ error: e }); }
  };
  const [f, setF] = useState({ q: '', domain: '', status: '', gaps: false });
  const rows = useMemo(() => (data || []).filter((k) => {
    if (f.domain && (k.domain_id || '') !== (f.domain === '-' ? '' : f.domain)) return false;
    if (f.status && k.status !== f.status) return false;
    if (f.gaps && (k.status === 'Retired' || k.health.done === k.health.total)) return false;
    if (f.q) {
      const t = `${k.id} ${k.customer} ${k.requirement} ${k.name} ${k.owner} ${k.processes.map((p) => `${p.process_id} ${p.name}`).join(' ')}`.toLowerCase();
      if (!t.includes(f.q.toLowerCase())) return false;
    }
    return true;
  }), [data, f]);

  if (loading && !data) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const live = data.filter((k) => k.status !== 'Retired');
  const traced = live.filter((k) => k.health.done === k.health.total).length;
  const validated = live.filter((k) => k.status === 'Validated').length;
  const noProcess = live.filter((k) => !k.processes.some((p) => p.role === 'Produces')).length;
  const noReport = live.filter((k) => !(k.links.report || []).length).length;
  const domains = [...new Set(data.map((k) => k.domain_id || '-'))].sort();

  return (
    <section className="sheet">
      <SheetHead code="KPI · begin with the end in mind" title="Customer Requirements (KPI)"
        actions={<>
          {can('diagrams', 'edit') && <button className="btn" onClick={generateAll} disabled={gen?.busy}>{gen?.busy ? 'Generating swimlanes…' : 'Generate all swimlanes'}</button>}
          {can('kpis', 'add') && <button className="btn primary" onClick={() => setAdding(true)}>Add requirement</button>}
        </>}>
        Start here. Each requirement names a customer, what they need, and the KPI and target that prove it is delivered.
        Every process, output, hand-off step, data object and report in the blueprint is mapped back to the KPI it delivers — anything that serves no KPI shows up as a gap.
      </SheetHead>
      <ErrorNote error={gen?.error} />
      {gen?.ok && <div className="notice ok">{gen.ok.generated} swimlane{gen.ok.generated === 1 ? '' : 's'} generated ({gen.ok.created} new). They are under <Link to="/diagrams">Swimlanes</Link>, one per KPI. KPIs with no process mapped were skipped.</div>}
      <div className="stats">
        <div className="stat"><b>{live.length}</b><span>Active requirements · {validated} agreed with the customer</span></div>
        <div className="stat"><b>{traced}/{live.length}</b><span>Fully traced (all 10 checks)</span></div>
        <div className="stat"><b className={noProcess ? 'flag' : ''}>{noProcess}</b><span>No process produces them yet</span></div>
        <div className="stat"><b className={noReport ? 'flag' : ''}>{noReport}</b><span>No report shows them yet · <Link to="/reports">Reports register</Link></span></div>
      </div>
      <div className="row kpi-filters">
        <input type="search" placeholder="Search customer, requirement, KPI, process…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search requirements" style={{ maxWidth: 340 }} />
        <select value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} aria-label="Domain" style={{ width: 'auto' }}>
          <option value="">All domains</option>{domains.map((d) => <option key={d} value={d}>{d === '-' ? 'Project-wide' : d}</option>)}</select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status" style={{ width: 'auto' }}>
          <option value="">Any status</option><option>Draft</option><option>Validated</option><option>Retired</option></select>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={f.gaps} onChange={(e) => setF({ ...f, gaps: e.target.checked })} /> Only those with gaps</label>
        <span className="muted small">{rows.length} shown</span>
      </div>
      {data.length === 0 ? (
        <div className="empty">No requirements yet{can('kpis', 'add') ? ' — add the first one: who is the customer, what do they need, and how will you measure it?' : '.'}</div>
      ) : (
        <div className="tablewrap">
          <table className="t">
            <thead><tr><th>KPI</th><th>Customer &amp; requirement</th><th>KPI &amp; target</th><th>Delivered by</th><th>Shown in</th><th>Trace</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className={k.status === 'Retired' ? 'kpi-retired' : undefined}>
                  <td className="ref"><Link to={`/kpis/${k.id}`}>{k.id}</Link>{k.domain_id && <div><span className="domain">{k.domain_id}</span></div>}</td>
                  <td className="w-lg"><b>{k.customer}</b><div className="small">{k.requirement}</div></td>
                  <td className="w-md"><Link to={`/kpis/${k.id}`}>{k.name}</Link>
                    <div className="small muted">{k.target ? `Target ${k.target}` : <span className="flag">No target</span>}{k.baseline ? ` · baseline ${k.baseline}` : ''}</div></td>
                  <td className="w-md">{k.processes.length === 0 ? <span className="flag small">No process yet</span> : k.processes.map((p) => (
                    <Link key={p.process_id} className={`pill kpi-role ${p.role}`} to={`/processes/${p.process_id}`} title={`${p.name} — ${p.role}`} style={{ '--c': `var(--${p.color})` }}>
                      {p.process_id}{p.role === 'Contributes' ? ' (contributes)' : ''}</Link>))}</td>
                  <td><LinkPills type="report" items={k.links.report} empty="No report yet" /></td>
                  <td style={{ minWidth: 120 }}><HealthBar health={k.health} /></td>
                  <td><span className={`badge ${KPI_STATUS_BADGE[k.status]}`}>{k.status}</span>
                    {k.priority !== 'Medium' && <div style={{ marginTop: 4 }}><span className={`badge ${PRIORITY_BADGE[k.priority]}`}>{k.priority}</span></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <KpiFormModal open={adding} onClose={() => setAdding(false)} onSaved={(id) => nav(`/kpis/${id}`)} />
    </section>
  );
}
