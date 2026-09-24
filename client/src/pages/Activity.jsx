import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { ErrorNote, SheetHead } from '../components/ui.jsx';

export default function Activity() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const load = async (before) => {
    try {
      const r = await api(`/activity?limit=100${before ? `&before=${before}` : ''}`);
      setRows((x) => (before ? [...x, ...r] : r));
      setDone(r.length < 100);
    } catch (e) { setError(e); }
  };
  useEffect(() => { load(); }, []);
  return (
    <section className="sheet">
      <SheetHead title="Activity log">Every change, validation, diagram version and comment, newest first.</SheetHead>
      <ErrorNote error={error} />
      <div className="tablewrap">
        <table className="t">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                <td>{a.user_name || 'System'}</td>
                <td>{a.action.replace('_', ' ')}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{a.entity_type.replace('_', ' ')} {a.entity_id}</td>
                <td className="w-lg">{a.summary}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="empty">No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {!done && rows.length > 0 && <button className="btn" style={{ marginTop: 10 }} onClick={() => load(rows[rows.length - 1].id)}>Load older</button>}
    </section>
  );
}
