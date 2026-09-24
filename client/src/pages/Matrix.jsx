import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks.js';
import { ErrorNote, Fit, Loading, SheetHead, Status, STATUS_LABEL } from '../components/ui.jsx';

export default function Matrix() {
  const [qText, setQ] = useState('');
  const [proc, setProc] = useState('');
  const [fit, setFit] = useState('');
  const [status, setStatus] = useState('');
  const procs = useApi('/processes');
  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (proc) p.set('process', proc);
    if (fit) p.set('fit', fit);
    if (status) p.set('status', status);
    return `/matrix?${p}`;
  }, [proc, fit, status]);
  const { data, error, loading } = useApi(path);
  const rows = useMemo(() => {
    if (!data) return [];
    const q = qText.trim().toLowerCase();
    return q ? data.filter((r) => [r.ref, r.step, r.trigger_event, r.data_fields, r.handoff, r.exceptions, r.validation_comment].join(' ').toLowerCase().includes(q)) : data;
  }, [data, qText]);

  let last = '';
  return (
    <section className="sheet">
      <SheetHead code="S-3" title="Data & interconnection matrix" actions={<a className="btn" href="/api/export/xlsx">Export Excel</a>}>
        For every hand-off: the trigger, the data fields, where the record moves in Odoo, and the exceptions the design must survive.
      </SheetHead>
      <div className="toolbar">
        <input type="search" placeholder="Search steps, fields, exceptions…" value={qText} onChange={(e) => setQ(e.target.value)} aria-label="Search the matrix" />
        <select value={proc} onChange={(e) => setProc(e.target.value)} aria-label="Process">
          <option value="">All processes</option>
          {procs.data?.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
        </select>
        <select value={fit} onChange={(e) => setFit(e.target.value)} aria-label="Fit">
          <option value="">Any fit</option>{['Standard', 'Configure', 'Extend'].map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Validation">
          <option value="">Any validation</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="muted small">{rows.length} steps</span>
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        <div className="tablewrap">
          <table className="t" style={{ minWidth: 1200 }}>
            <thead><tr><th>Ref</th><th>Step</th><th>a. Trigger event</th><th>b. Inputs &amp; data fields</th><th>c. System hand-off</th><th>d. Exceptions / edge cases</th><th>Fit</th><th>Validation</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="empty">No steps match. Clear the search or change a filter.</td></tr>}
              {rows.flatMap((r) => {
                const out = [];
                if (r.process_id !== last) {
                  last = r.process_id;
                  out.push(<tr className="grp" key={`g${r.process_id}`} style={{ '--c': `var(--${r.color})` }}><td colSpan={8}><Link to={`/processes/${r.process_id}`}>{r.process_id} · {r.process_name}</Link></td></tr>);
                }
                out.push(
                  <tr key={r.id}>
                    <td className="ref"><Link to={`/processes/${r.process_id}#step-${r.ref}`}>{r.ref}</Link></td>
                    <td className="w-md"><b>{r.step}</b></td>
                    <td className="w-md">{r.trigger_event}</td>
                    <td className="w-lg">{r.data_fields}</td>
                    <td className="w-lg">{r.handoff}</td>
                    <td className="w-lg">{r.exceptions}</td>
                    <td><Fit fit={r.fit} /></td>
                    <td className="w-md"><Status s={r.validation_status} />{r.validation_comment && <div className="small muted" style={{ marginTop: 4 }}>{r.validation_comment}</div>}</td>
                  </tr>);
                return out;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
