import { Link } from 'react-router-dom';
import { useApi } from '../hooks.js';
import { Loading, ErrorNote, Fit, Progress, SheetHead } from '../components/ui.jsx';

export default function Processes() {
  const { data, error, loading } = useApi('/processes');
  return (
    <section className="sheet">
      <SheetHead code="S-1" title="SIPOC architecture">
        One SIPOC per Level 1 process. Open a process to review or edit its SIPOC and validate its hand-off steps.
      </SheetHead>
      {loading && <Loading />}
      <ErrorNote error={error} />
      {data && (
        <div className="tablewrap">
          <table className="t">
            <thead><tr><th>ID</th><th>Process</th><th>Stage</th><th>Accountable owner</th><th>Assigned owners</th><th>Fit</th><th>Validation</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="ref" style={{ borderLeft: `6px solid var(--${p.color})` }}>{p.id}</td>
                  <td className="w-md"><Link to={`/processes/${p.id}`}>{p.name}</Link>{p.from_reference && <div className="muted small">Numbered in reference flow</div>}</td>
                  <td>{p.stage_name || 'Cross-cutting'}</td>
                  <td>{p.owner_dept}</td>
                  <td>{p.owners.length ? p.owners.map((o) => o.name).join(', ') : <span className="muted">Not assigned</span>}</td>
                  <td><Fit fit={p.fit} /></td>
                  <td style={{ minWidth: 130 }}>{p.approved_count}/{p.step_count} approved<Progress approved={p.approved_count} flagged={p.flagged_count} total={p.step_count} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
