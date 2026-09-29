import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { ErrorNote } from './ui.jsx';

const BLANK = { customer: '', requirement: '', measure: '', target: '', status: 'Draft', source: '' };

// COPIS starts here: what each customer needs from this process, and how "done well" is measured.
export default function CustomerRequirements({ process, canEdit, onSaved }) {
  const reqs = process.customer_requirements || [];
  const [rows, setRows] = useState(null); // null = not editing
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const listId = `customers-${process.id}`;

  const start = () => { setRows(reqs.length ? reqs.map((r) => ({ ...BLANK, ...r })) : [{ ...BLANK, customer: process.customers[0] || '' }]); setErr(null); };
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const clean = rows.filter((r) => r.customer.trim() || r.requirement.trim());
      await api(`/processes/${process.id}`, { method: 'PUT', body: { customer_requirements: clean } });
      setRows(null); onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const validated = reqs.filter((r) => r.status === 'Validated').length;

  return (
    <section className="creq">
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Customer requirements</h3>
        {reqs.length > 0 && <span className="small muted">{validated} of {reqs.length} validated with the customer</span>}
        <span style={{ flex: 1 }} />
        {canEdit && rows === null && <button className="btn sm" onClick={start}>{reqs.length ? 'Edit requirements' : 'Add requirements'}</button>}
      </div>
      <p className="small muted" style={{ margin: '0 0 10px' }}>
        What each customer of this process needs from its outputs, and how you will know it is delivered. Agree these with the customer first — every step, input and supplier below exists to meet them.
      </p>
      <ErrorNote error={err} />
      {rows === null ? (
        reqs.length === 0 ? (
          <div className="empty">No customer requirements yet{canEdit ? ' — add what each customer expects, with a measure and target.' : '.'}</div>
        ) : (
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>Customer</th><th>Requirement</th><th>Measure</th><th>Target</th><th>Status</th></tr></thead>
              <tbody>
                {reqs.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.customer}</td>
                    <td className="w-lg">{r.requirement}</td>
                    <td className="w-md">{r.measure || <span className="muted">—</span>}</td>
                    <td>{r.target || <span className="muted">—</span>}</td>
                    <td><span className={`badge ${r.status === 'Validated' ? 'ok' : 'warn'}`}>{r.status}</span>{r.source && <div className="small muted">from {r.source}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="creq-edit">
          <datalist id={listId}>{process.customers.map((c) => <option key={c} value={c} />)}</datalist>
          {rows.map((r, i) => (
            <div className="creq-row" key={i}>
              <label className="field"><span>Customer</span><input type="text" list={listId} value={r.customer} onChange={(e) => set(i, 'customer', e.target.value)} /></label>
              <label className="field wide"><span>Requirement</span><input type="text" value={r.requirement} placeholder="e.g. A correct Contract to Sell, ready to sign quickly" onChange={(e) => set(i, 'requirement', e.target.value)} /></label>
              <label className="field"><span>Measure</span><input type="text" value={r.measure} placeholder="e.g. Days from reservation to CTS" onChange={(e) => set(i, 'measure', e.target.value)} /></label>
              <label className="field"><span>Target</span><input type="text" value={r.target} placeholder="e.g. ≤ 30 days" onChange={(e) => set(i, 'target', e.target.value)} /></label>
              <label className="field"><span>Status</span>
                <select value={r.status} onChange={(e) => set(i, 'status', e.target.value)}><option>Draft</option><option>Validated</option></select></label>
              <button type="button" className="btn sm ghost" aria-label={`Remove requirement ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, { ...BLANK }])}><Plus size={15} /> Add requirement</button>
            <span className="small muted">Mark a requirement Validated once the customer has agreed it.</span>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={() => setRows(null)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save requirements'}</button>
          </div>
        </div>
      )}
    </section>
  );
}
