import { Link } from 'react-router-dom';
import { useApi } from '../hooks.js';
import { Loading, ErrorNote, Progress, SheetHead } from '../components/ui.jsx';
import { fmtDateTime } from '../api.js';

function Chip({ p }) {
  return (
    <Link className="chip" to={`/processes/${p.id}`} style={{ '--c': `var(--${p.color})` }}>
      <span className="num">{p.id}</span>{p.name}
      <small>{p.owner_dept} · {p.approved_count}/{p.step_count} validated</small>
      <Progress approved={p.approved_count} flagged={p.flagged_count} total={p.step_count} />
    </Link>
  );
}

export default function Dashboard() {
  const procs = useApi('/processes');
  const meta = useApi('/meta');
  const dash = useApi('/dashboard');
  if (procs.loading || meta.loading || dash.loading) return <div className="sheet"><Loading /></div>;
  const err = procs.error || meta.error || dash.error;
  if (err) return <div className="sheet"><ErrorNote error={err} /></div>;
  const d = dash.data;
  const pct = d.steps.total ? Math.round((d.steps.approved / d.steps.total) * 100) : 0;

  return (
    <>
      <section className="sheet">
        <SheetHead code="S-0" title="Level 0 world map"
          actions={<>
            <a className="btn" href="/api/export/xlsx">Export Excel</a>
            <a className="btn" href="/api/export/bpmn.zip">Export BPMN (.zip)</a>
          </>}>
          Every PHI process in value-chain order. The bar under each process shows how many of its hand-off steps the process owner has validated.
        </SheetHead>
        <div className="stats">
          <div className="stat"><b>{pct}%</b><span>{d.steps.approved} of {d.steps.total} steps approved</span></div>
          <div className="stat"><b>{d.steps.changes + d.steps.rework}</b><span>Steps flagged for changes or rework</span></div>
          <div className="stat"><b>{d.openItems.open + d.openItems.in_progress}</b><span>Open items not yet closed</span></div>
          <div className="stat"><b>{d.diagrams.revisions}</b><span>Diagram revisions since baseline</span></div>
        </div>
        <div className="stats">
          <div className="stat"><b>{d.reengineering.accepted}/{d.reengineering.total}</b><span><Link to="/reengineering">Re-engineering opportunities accepted</Link> · {d.reengineering.undecided} undecided</span></div>
          <div className="stat"><b>{d.sowGaps.covered}/{d.sowGaps.processes}</b><span><Link to="/sow?tab=gaps">Processes fully covered by AWB SOW</Link></span></div>
          <div className="stat"><b>{d.sowGaps.open_high}</b><span>High-priority SOW gaps still open</span></div>
          <div className="stat"><b>{d.observations.open}/{d.observations.total}</b><span><Link to="/sow?tab=observations">Commercial observations unresolved</Link> · <Link to="/documents">{d.documents} documents</Link></span></div>
        </div>
        <div className="map">
          <div className="map-fc">Forecasts (X1)</div>
          <div className="map-body">
            <div className="stages">
              {meta.data.stages.map((s, i) => (
                <div className="stage" key={s.id}>
                  <h4><b>{i + 1}</b>{s.name}</h4>
                  {procs.data.filter((p) => p.stage_id === s.id).map((p) => <Chip key={p.id} p={p} />)}
                </div>
              ))}
            </div>
            <div className="crossbar">
              {procs.data.filter((p) => !p.stage_id).map((p) => <Chip key={p.id} p={p} />)}
            </div>
          </div>
          <div className="map-kpi">KPIs and variance reports (X2)</div>
        </div>
      </section>
      <section className="sheet">
        <div className="grid2" style={{ gap: 24 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Fit by domain</h3>
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>Domain</th><th>Standard</th><th>Configure</th><th>Extend</th></tr></thead>
                <tbody>
                  {d.fit.map((f) => (
                    <tr key={f.group_id}><td><span className="swatch" style={{ '--c': `var(--${f.color})` }} /> {f.name}</td>
                      <td>{f.Standard}</td><td>{f.Configure}</td><td>{f.Extend}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Recent activity</h3>
            {d.recent.length === 0 ? <p className="muted">Nothing yet — changes and validations will show here.</p> : (
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {d.recent.map((a) => (
                  <li key={a.id} className="small" style={{ marginBottom: 6 }}>
                    <b>{a.user_name || 'System'}</b> {a.action.replace('_', ' ')} {a.entity_type.replace('_', ' ')} {a.entity_id}
                    {a.summary && <span className="muted"> — {a.summary}</span>} <span className="muted">· {fmtDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p><Link to="/activity">See all activity</Link></p>
          </div>
        </div>
      </section>
    </>
  );
}
