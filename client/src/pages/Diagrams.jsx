import { Link } from 'react-router-dom';
import { useApi } from '../hooks.js';
import { fmtDateTime } from '../api.js';
import { ErrorNote, Loading, SheetHead } from '../components/ui.jsx';

export default function Diagrams() {
  const { data, error, loading } = useApi('/diagrams');
  return (
    <section className="sheet">
      <SheetHead code="S-2" title="Cross-departmental swimlanes" actions={<a className="btn" href="/api/export/bpmn.zip">Download all (.zip)</a>}>
        Seven BPMN 2.0 collaboration diagrams. PHI is one pool with a lane per department; buyers, lenders, suppliers and agencies are collapsed pools linked by message flows. Owners and admins can edit in the browser; every save is a new version.
      </SheetHead>
      {loading && <Loading />}
      <ErrorNote error={error} />
      <div className="cards">
        {data?.map((d) => (
          <Link className="card" key={d.id} to={`/diagrams/${d.id}`}>
            <h4>{d.id}. {d.title}</h4>
            <div className="muted small">Covers {d.covers}</div>
            <p>{d.description}</p>
            <p className="small muted">Version {d.current_version}{d.updated_by_name ? ` · ${d.updated_by_name}` : ''} · {fmtDateTime(d.updated_at)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
