import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useApi } from '../hooks.js';
import { ErrorNote, Loading, Modal, SheetHead } from '../components/ui.jsx';

const EMPTY = { q: '', user_id: '', table: '', action: '', from: '', to: '' };
const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function Value({ v }) {
  if (v === undefined || v === null || v === '') return <span className="muted">—</span>;
  if (typeof v === 'object') return <pre>{JSON.stringify(v, null, 2)}</pre>;
  return <pre>{String(v)}</pre>;
}

function Diff({ e }) {
  // tk_records keep their fields inside `data`: diff those field by field.
  const flat = (o) => (o && o.data && typeof o.data === 'object' && e.table_name === 'tk_records' ? { ...o, ...Object.fromEntries(Object.entries(o.data).map(([k, v]) => [`data.${k}`, v])), data: undefined } : o || {});
  const o = flat(e.old_data); const n = flat(e.new_data);
  let keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => o[k] !== undefined || n[k] !== undefined);
  if (e.action === 'UPDATE') keys = keys.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  if (!keys.length) return <p className="small">No field-level data for this entry.</p>;
  return (
    <table className="diff">
      <thead><tr><th>Field</th>{e.action !== 'INSERT' && <th>Before</th>}{e.action !== 'DELETE' && <th>After</th>}</tr></thead>
      <tbody>
        {keys.sort().map((k) => (
          <tr key={k}>
            <th>{k}</th>
            {e.action !== 'INSERT' && <td className="old"><Value v={o[k]} /></td>}
            {e.action !== 'DELETE' && <td className="new"><Value v={n[k]} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Audit() {
  const facets = useApi('/audit/facets');
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [rows, setRows] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [verify, setVerify] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const load = async (before) => {
    try {
      const r = await api(`/audit?${qs({ ...applied, limit: 100, before })}`);
      setRows((x) => (before ? [...x, ...r] : r));
      setDone(r.length < 100); setError(null);
    } catch (e) { setError(e); }
  };
  useEffect(() => { setRows(null); load(); }, [applied]); // eslint-disable-line
  const runVerify = async () => {
    setVerifying(true);
    try { setVerify(await api('/audit/verify')); } catch (e) { setError(e); } finally { setVerifying(false); }
  };
  useEffect(() => { runVerify(); }, []);
  const open = async (id) => { try { setDetail(await api(`/audit/${id}`)); } catch (e) { setError(e); } };
  const f = (k) => ({ value: filters[k], onChange: (e) => setFilters({ ...filters, [k]: e.target.value }) });

  return (
    <section className="sheet">
      <SheetHead title="Audit log"
        actions={<a className="btn" href={`/api/audit/export.csv?${qs(applied)}`}>Export CSV</a>}>
        Every create, change and delete in the blueprint and toolkit — who, when, from where, and the exact before and after values — plus sign-ins,
        downloads, exports and refused attempts. Entries can't be edited or deleted by anyone, including the Project Manager, and each one is chained
        to the previous by a SHA-256 hash, so any tampering in the database is detectable.
      </SheetHead>
      {verify && (
        <div className={`chain ${verify.ok ? 'ok' : 'bad'}`} role="status">
          <b style={{ fontSize: '1.05rem' }}>{verify.ok ? 'Chain intact' : `Chain broken at entry #${verify.bad_id}`}</b>
          <span>{verify.checked.toLocaleString()} entries checked · {fmtDateTime(verify.at)}</span>
          {verify.head_id && <span>Latest #{verify.head_id}: <code>{verify.head_hash}</code></span>}
          <button className="btn sm" onClick={runVerify} disabled={verifying}>{verifying ? 'Checking…' : 'Verify again'}</button>
        </div>
      )}
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}>
        <input type="search" placeholder="Search names, records, values" aria-label="Search" {...f('q')} />
        <select aria-label="User" {...f('user_id')}><option value="">All users</option>{facets.data?.users.map((u) => <option key={u.user_id} value={u.user_id}>{u.user_name}</option>)}</select>
        <select aria-label="Table" {...f('table')}><option value="">All records</option>{facets.data?.tables.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select aria-label="Action" {...f('action')}><option value="">All actions</option>{facets.data?.actions.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <label className="row small"><span>From</span><input type="date" style={{ width: 'auto' }} {...f('from')} /></label>
        <label className="row small"><span>To</span><input type="date" style={{ width: 'auto' }} {...f('to')} /></label>
        <button className="btn primary">Apply</button>
        <button className="btn ghost" type="button" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); }}>Clear</button>
      </form>
      <ErrorNote error={error} />
      {!rows ? <Loading /> : (
        <div className="tablewrap">
          <table className="t" style={{ minWidth: 980 }}>
            <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Fields / details</th><th>IP</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="empty">No entries match these filters.</td></tr>}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="ref">{a.id}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                  <td>{a.user_name ? <><b>{a.user_name}</b><div className="small">{a.user_email}</div></> : <span className="muted">System</span>}</td>
                  <td><span className={`act ${a.action}`}>{a.action}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.table_name}{a.record_id && <div className="small mono">{a.record_id}</div>}</td>
                  <td className="w-lg">{a.changed_fields?.filter((x) => !['updated_at', 'updated_by'].includes(x)).join(', ')}{a.summary && <div className="small">{a.summary}</div>}</td>
                  <td className="small mono" style={{ whiteSpace: 'nowrap' }}>{a.ip}</td>
                  <td><button className="btn sm ghost" onClick={() => open(a.id)}>Details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && !done && rows.length > 0 && <button className="btn" style={{ marginTop: 10 }} onClick={() => load(rows[rows.length - 1].id)}>Load older</button>}
      <Modal wide open={!!detail} title={detail ? `Audit entry #${detail.id}` : ''} onClose={() => setDetail(null)} footer={<button className="btn" onClick={() => setDetail(null)}>Close</button>}>
        {detail && (
          <>
            <dl className="kv">
              <dt>When</dt><dd>{new Date(detail.at).toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'long' })}</dd>
              <dt>Who</dt><dd>{detail.user_name ? `${detail.user_name} (${detail.user_email}) · user #${detail.user_id}` : 'System (migration, seed or background job)'}</dd>
              <dt>From</dt><dd className="mono">{detail.ip || '—'}</dd>
              <dt>Action</dt><dd><span className={`act ${detail.action}`}>{detail.action}</span> {detail.table_name} <span className="mono">{detail.record_id}</span></dd>
              {detail.summary && <><dt>Details</dt><dd>{detail.summary}</dd></>}
              <dt>Hash</dt><dd className="mono">{detail.hash}</dd>
              <dt>Previous hash</dt><dd className="mono">{detail.prev_hash}</dd>
            </dl>
            <Diff e={detail} />
          </>
        )}
      </Modal>
      {facets.error && <ErrorNote error={facets.error} />}
    </section>
  );
}
