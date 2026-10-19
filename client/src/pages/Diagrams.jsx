import { Link } from 'react-router-dom';
import { useApi } from '../hooks.js';
import { fmtDateTime } from '../api.js';
import { ErrorNote, Loading, SheetHead } from '../components/ui.jsx';

export default function Diagrams() {
  const { data, error, loading } = useApi('/diagrams');
  const isKpi = (d) => /^KPI-/.test(d.id);
  const card = (d) => (
    <Link className="card" key={d.id} to={`/diagrams/${d.id}`}>
      <h4>{isKpi(d) ? d.title : `${d.id}. ${d.title}`}</h4>
      <div className="muted small">Covers {d.covers}</div>
      <p>{d.description}</p>
      <p className="small muted">Version {d.current_version}{d.updated_by_name ? ` · ${d.updated_by_name}` : ''} · {fmtDateTime(d.updated_at)}</p>
    </Link>
  );
  return (
    <section className="sheet">
      <SheetHead code="S-2" title="Cross-departmental swimlanes" actions={<a className="btn" href="/api/export/bpmn.zip">Download all (.zip)</a>}>
        BPMN 2.0 collaboration diagrams: the end-to-end flows, and one per Customer Requirement (KPI) generated from its mapped processes. PHI is one pool with a lane per department; buyers, lenders, suppliers and agencies are collapsed pools linked by message flows. Owners and admins can edit in the browser; every save is a new version.
      </SheetHead>
      {loading && <Loading />}
      <ErrorNote error={error} />
      <div className="cards">{data?.filter((d) => !isKpi(d)).map(card)}</div>
      {data?.some(isKpi) && (
        <>
          <h3>Generated from Customer Requirements (KPI)</h3>
          <p className="small muted" style={{ marginTop: 0 }}>One per KPI, built from the steps of its mapped processes. Regenerate from the <Link to="/kpis">KPI page</Link> when the mapping changes.</p>
          <div className="cards">{data.filter(isKpi).sort((a, b) => a.id.localeCompare(b.id)).map(card)}</div>
        </>
      )}
    </section>
  );
}
