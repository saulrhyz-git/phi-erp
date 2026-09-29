import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtPHP } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, Loading, Modal, SheetHead } from '../components/ui.jsx';
import EditModal from '../components/EditModal.jsx';

const TABS = [['overview', 'Overview'], ['gaps', 'Gap analysis'], ['appendix', 'Appendix A/B'], ['observations', 'Commercial observations'], ['items', 'Scope map (100 items)'], ['effort', 'Effort check']];
const GAP_STATUS = ['Open', 'Raised with vendor', 'Agreed in scope', 'Change request', 'Accepted gap', 'Deferred (next phase)', 'Closed'];
const SIMPLE_STATUS = ['Open', 'Raised with vendor', 'Resolved', 'Accepted', 'Closed'];
const Rating = ({ r }) => <span className={`rating ${r}`}>{r}</span>;
const n = (v) => (v === null || v === undefined ? 0 : Number(v));

function Overview() {
  const { data, error, loading } = useApi('/sow/overview');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const m = data.meta;
  const count = (arr, pred) => arr.filter(pred).reduce((a, x) => a + x.n, 0);
  const g = data.gaps;
  const proc = (rating) => count(g, (x) => x.kind === 'process' && x.rating === rating);
  const openHigh = count(g, (x) => x.rating !== 'Covered' && x.priority === 'High' && !['Closed', 'Agreed in scope', 'Deferred (next phase)'].includes(x.status));
  const obsOpen = count(data.observations, (x) => !['Resolved', 'Accepted', 'Closed'].includes(x.status));
  const obsTotal = count(data.observations, () => true);
  const appA = count(data.appendix, (x) => x.part === 'A'), appOpen = count(data.appendix, (x) => !['Closed', 'Agreed in scope', 'Resolved'].includes(x.status));
  const devCap = data.effort.reduce((a, e) => a + n(e.dev_lead) + n(e.dev), 0);
  const itemized = data.sections.reduce((a, s) => a + s.dev_days, 0);
  const re = data.reengineering.reduce((a, x) => ({ lo: a.lo + x.lo, hi: a.hi + x.hi, olo: a.olo + x.olo, ohi: a.ohi + x.ohi }), { lo: 0, hi: 0, olo: 0, ohi: 0 });
  return (
    <>
      <div className="stats">
        <div className="stat"><b>{proc('Covered')}/{proc('Covered') + proc('Partial') + proc('Not covered')}</b><span>Blueprint processes fully covered · {proc('Partial')} partial · {proc('Not covered')} not covered</span></div>
        <div className="stat"><b>{openHigh}</b><span>High-priority gaps still open</span></div>
        <div className="stat"><b>{obsOpen}/{obsTotal}</b><span>Commercial observations unresolved · {appOpen} appendix items awaiting AWB ({appA} build items)</span></div>
        <div className="stat"><b className="flag">{(itemized - devCap).toFixed(0)} md</b><span>Itemized build ({itemized.toFixed(0)} md) above development capacity ({devCap} md)</span></div>
      </div>
      <div className="grid2" style={{ gap: 24 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Key facts</h3>
          <dl className="kv">
            <dt>SOW</dt><dd>No. {m.sow_no} · {m.platform}</dd>
            <dt>Vendor</dt><dd>{m.vendor} (signed {m.vendor_signed})</dd>
            <dt>Client</dt><dd>{m.client}</dd>
            <dt>Duration</dt><dd>{m.duration}</dd>
            <dt>Effort</dt><dd>{m.total_effort_md} person-days · flex {m.flex_total_md} md</dd>
            <dt>Rates</dt><dd>{fmtPHP(m.base_rate)} base · {fmtPHP(m.flex_rate)} flex / change requests (per man-day, ex-VAT)</dd>
            <dt>Fee</dt><dd>{fmtPHP(m.fixed_fee)} less {fmtPHP(m.discount)} = <b>{fmtPHP(m.fee_after_discount)}</b> ex-VAT</dd>
          </dl>
          <h3>Re-engineering effect on this SOW</h3>
          <p className="small">Indicative extra effort {re.lo}–{re.hi} md, possible offsets {re.olo}–{re.ohi.toFixed(1)} md. <Link to="/reengineering">Review opportunities →</Link></p>
        </div>
        <div>
          <h3 style={{ marginTop: 0 }}>Payment milestones</h3>
          <div className="tablewrap"><table className="t"><thead><tr><th>Milestone</th><th>%</th><th>PHP ex-VAT</th></tr></thead>
            <tbody>{m.milestones.map(([name, pct, amt]) => <tr key={name}><td>{name}</td><td>{pct}%</td><td className="money">{Number(amt).toLocaleString('en-PH')}</td></tr>)}</tbody></table></div>
          <h3>Delivery phases</h3>
          <div className="tablewrap"><table className="t"><tbody>{m.phases.map(([p, name, wk]) => <tr key={p}><td className="ref">{p}</td><td>{name}</td><td>{wk}</td></tr>)}</tbody></table></div>
        </div>
      </div>
    </>
  );
}

function Gaps() {
  const { can } = useAuth();
  const isEditor = can('sow', 'edit');
  const { data, error, loading, reload } = useApi('/sow/gaps');
  const [kind, setKind] = useState('process');
  const [edit, setEdit] = useState(null);
  const [thread, setThread] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const rows = data.filter((g) => g.kind === kind);
  return (
    <>
      <div className="toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Gap type">
          <option value="process">By blueprint process ({data.filter((g) => g.kind === 'process').length})</option>
          <option value="cross">Cross-cutting ({data.filter((g) => g.kind === 'cross').length})</option>
          <option value="sow_only">In SOW, not yet in blueprint ({data.filter((g) => g.kind === 'sow_only').length})</option>
        </select>
      </div>
      <div className="tablewrap">
        <table className="t" style={{ minWidth: 1250 }}>
          <thead><tr><th>Ref</th><th>{kind === 'process' ? 'Process' : 'Topic'}</th><th>Rating</th><th>SOW coverage</th><th>Gaps</th><th>Action</th><th>Priority</th><th>Responses</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} style={{ opacity: g.status.startsWith('Deferred') ? 0.55 : 1 }}>
                <td className="ref" style={g.color ? { borderLeft: `5px solid var(--${g.color})` } : undefined}>{g.ref}</td>
                <td className="w-md">{g.process_id ? <Link to={`/processes/${g.process_id}`}><b>{g.process_name}</b></Link> : <b>{g.title}</b>}{g.requirement && <div className="small muted">{g.requirement}</div>}</td>
                <td><Rating r={g.rating} /></td>
                <td className="w-md small">{g.sow_coverage}</td>
                <td className="w-lg small">{g.gaps}</td>
                <td className="w-md small">{g.action}</td>
                <td>{g.priority}</td>
                <td className="w-md small">{g.phi_response && <div><b>PHI:</b> {g.phi_response}</div>}{g.vendor_response && <div><b>AWB:</b> {g.vendor_response}</div>}{!g.phi_response && !g.vendor_response && <span className="muted">—</span>}</td>
                <td className="small">{g.status}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {isEditor && <button className="btn sm ghost" onClick={() => setEdit(g)}>Update</button>}{' '}
                  <button className="btn sm ghost" onClick={() => setThread(g)}>Discuss{g.comment_count ? ` (${g.comment_count})` : ''}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EditModal open={!!edit} title={`Gap ${edit?.ref}`} record={edit} onClose={() => setEdit(null)}
        fields={[{ key: 'rating', label: 'Coverage rating', type: 'select', options: ['Covered', 'Partial', 'Not covered'] },
          { key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
          { key: 'action', label: 'Recommended action', type: 'textarea' },
          { key: 'phi_response', label: 'PHI response', type: 'textarea' }, { key: 'vendor_response', label: 'AWB response', type: 'textarea' },
          { key: 'status', label: 'Status', type: 'select', options: GAP_STATUS }]}
        onSave={(b) => api(`/sow/gaps/${edit.id}`, { method: 'PUT', body: b }).then(reload)} />
      <Modal open={!!thread} title={thread ? `Gap ${thread.ref}` : ''} onClose={() => { setThread(null); reload(); }}
        footer={<button className="btn" onClick={() => { setThread(null); reload(); }}>Close</button>}>
        {thread && <Comments type="gap" id={thread.id} />}
      </Modal>
    </>
  );
}

function Appendix() {
  const { can } = useAuth();
  const isEditor = can('sow', 'edit');
  const { data, error, loading, reload } = useApi('/sow/appendix');
  const [edit, setEdit] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const est = data.filter((a) => a.part === 'A').reduce((a, x) => a + n(x.vendor_estimate), 0);
  const priced = data.filter((a) => a.part === 'A' && a.vendor_estimate !== null).length;
  const table = (part, title, note) => (
    <>
      <h3>{title}</h3><p className="muted small">{note}</p>
      <div className="tablewrap"><table className="t" style={{ minWidth: 980 }}>
        <thead><tr><th>#</th><th>Item</th><th>Process</th><th>{part === 'A' ? 'Scope required' : 'Confirmation requested'}</th>{part === 'A' && <th>Priority</th>}<th>AWB response</th>{part === 'A' && <th>AWB estimate</th>}<th>Status</th><th /></tr></thead>
        <tbody>{data.filter((a) => a.part === part).map((a) => (
          <tr key={a.id}>
            <td className="ref">{a.code}</td><td className="w-md"><b>{a.title}</b></td><td>{a.process_ref}</td><td className="w-lg small">{a.scope}</td>
            {part === 'A' && <td>{a.priority}</td>}
            <td className="w-md small">{a.vendor_response || <span className="muted">Awaiting AWB</span>}</td>
            {part === 'A' && <td>{a.vendor_estimate !== null ? `${a.vendor_estimate} md` : '—'}</td>}
            <td className="small">{a.status}</td>
            <td>{isEditor && <button className="btn sm ghost" onClick={() => setEdit(a)}>Update</button>}</td>
          </tr>))}</tbody>
      </table></div>
    </>
  );
  return (
    <>
      <div className="notice">Sent to AWB with the commercial clarification letter. AWB has priced {priced} of {data.filter((a) => a.part === 'A').length} build items{priced ? ` — ${est} man-days so far (${fmtPHP(est * 10000)} at base rate)` : ''}. Leasing and property management / HOA are deferred to a later phase.</div>
      {table('A', 'Part 1 — Items requiring build (to be priced into base scope)', 'Functional gaps PHI asked AWB to include in the fixed fee.')}
      {table('B', 'Part 2 — Items requiring confirmation', 'May already be covered; if not, AWB prices them as in Part 1.')}
      <EditModal open={!!edit} title={`${edit?.code} — ${edit?.title}`} record={edit} onClose={() => setEdit(null)}
        fields={[{ key: 'vendor_response', label: 'AWB response', type: 'textarea' },
          ...(edit?.part === 'A' ? [{ key: 'vendor_estimate', label: 'AWB estimate (man-days)', type: 'number' }] : []),
          { key: 'status', label: 'Status', type: 'select', options: GAP_STATUS }]}
        onSave={(b) => api(`/sow/appendix/${edit.id}`, { method: 'PUT', body: b }).then(reload)} />
    </>
  );
}

function Observations() {
  const { can } = useAuth();
  const isEditor = can('sow', 'edit');
  const { data, error, loading, reload } = useApi('/sow/observations');
  const [edit, setEdit] = useState(null);
  const [thread, setThread] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  return (
    <>
      <p className="lede small">Internal finding and impact (for PHI only) alongside the request as worded in the letter to AWB.</p>
      {data.map((o) => (
        <article className="step" key={o.id} style={{ '--c': 'var(--ink)' }}>
          <header><span className="ref">{o.code}</span><b>{o.title}</b><span className="muted small">{o.reference}</span>
            <span className="right"><span className="small">{o.status}</span>
              {isEditor && <button className="btn sm ghost" onClick={() => setEdit(o)}>Update</button>}
              <button className="btn sm ghost" onClick={() => setThread(o)}>Discuss{o.comment_count ? ` (${o.comment_count})` : ''}</button></span>
          </header>
          <div className="cols" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div><h5>Internal finding</h5>{o.finding}<div className="muted small" style={{ marginTop: 6 }}><b>Impact:</b> {o.impact}</div></div>
            <div><h5>Request to AWB (letter)</h5>{o.letter_request}</div>
            <div><h5>AWB response</h5>{o.vendor_response || <span className="muted">Awaiting AWB</span>}{o.owner && <div className="muted small" style={{ marginTop: 6 }}>PHI owner: {o.owner}</div>}</div>
          </div>
        </article>
      ))}
      <EditModal open={!!edit} title={`${edit?.code} — ${edit?.title}`} record={edit} onClose={() => setEdit(null)}
        fields={[{ key: 'owner', label: 'PHI owner' }, { key: 'vendor_response', label: 'AWB response', type: 'textarea' }, { key: 'status', label: 'Status', type: 'select', options: SIMPLE_STATUS }]}
        onSave={(b) => api(`/sow/observations/${edit.id}`, { method: 'PUT', body: b }).then(reload)} />
      <Modal open={!!thread} title={thread ? `${thread.code}: ${thread.title}` : ''} onClose={() => { setThread(null); reload(); }}
        footer={<button className="btn" onClick={() => { setThread(null); reload(); }}>Close</button>}>
        {thread && <Comments type="observation" id={thread.id} />}
      </Modal>
    </>
  );
}

function Items() {
  const { data, error, loading } = useApi('/sow/items');
  const ov = useApi('/sow/overview');
  const [sec, setSec] = useState('');
  const [qText, setQ] = useState('');
  const sections = useMemo(() => [...new Set((data || []).map((i) => i.section))], [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const rows = data.filter((i) => (!sec || i.section === sec) && (!qText || `${i.no} ${i.feature} ${i.process_refs}`.toLowerCase().includes(qText.toLowerCase())));
  const stated = ov.data?.meta?.section_subtotals || {};
  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="Search features…" value={qText} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={sec} onChange={(e) => setSec(e.target.value)} aria-label="Section"><option value="">All sections</option>{sections.map((s) => <option key={s}>{s}</option>)}</select>
        <span className="muted small">{rows.length} items · {rows.reduce((a, i) => a + i.dev_days, 0).toFixed(2)} dev-days</span>
      </div>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>#</th><th>Section</th><th>Feature</th><th>Dev-days</th><th>Blueprint process</th><th>Re-engineering</th><th>Hand-off steps</th></tr></thead>
        <tbody>{rows.map((i) => (
          <tr key={i.no}><td className="ref">#{i.no}</td><td className="small">{i.section}</td><td>{i.feature}</td><td>{i.dev_days.toFixed(2)}</td>
            <td>{i.process_refs.split(',').map((p) => <Link key={p} className="pill" to={`/processes/${p.trim()}`}>{p.trim()}</Link>)}</td>
            <td>{i.reengineering.map((r) => <Link key={r} className="pill" to={`/reengineering/${r}`}>{r}</Link>)}</td>
            <td>{(i.steps || []).map((st) => <Link key={st.ref} className="pill" to={`/processes/${st.process_id}#step-${st.ref}`}>{st.ref}</Link>)}</td></tr>))}</tbody>
      </table></div>
      <h3>Section subtotal check</h3>
      <div className="tablewrap"><table className="t"><thead><tr><th>Section</th><th>SOW stated</th><th>Sum of items</th><th>Difference</th></tr></thead>
        <tbody>{sections.map((s) => { const sum = data.filter((i) => i.section === s).reduce((a, i) => a + i.dev_days, 0); const d = sum - (stated[s] || 0);
          return <tr key={s}><td>{s}</td><td>{(stated[s] || 0).toFixed(2)}</td><td>{sum.toFixed(2)}</td><td className={Math.abs(d) > 0.001 ? 'flag' : ''}>{d.toFixed(2)}</td></tr>; })}</tbody></table></div>
    </>
  );
}

function Effort() {
  const { data, error, loading } = useApi('/sow/overview');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const cols = [['lead', 'Lead consultant'], ['ba', 'BA'], ['dev_lead', 'Dev Lead'], ['dev', 'Developer'], ['qa', 'QA'], ['infra', 'Infra']];
  const tot = (k) => data.effort.reduce((a, e) => a + n(e[k]), 0);
  const itemized = data.sections.reduce((a, s) => a + s.dev_days, 0);
  const cap = tot('dev_lead') + tot('dev');
  return (
    <>
      <p className="lede small">SOW §5.1 re-added. Red cells are rows where the roles don't add up to the stated total.</p>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Workstream</th>{cols.map(([k, l]) => <th key={k}>{l}</th>)}<th>SOW total</th><th>Computed</th><th>Difference</th></tr></thead>
        <tbody>{data.effort.map((e) => { const c = cols.reduce((a, [k]) => a + n(e[k]), 0); const hyper = e.workstream.startsWith('Hypercare'); const d = hyper ? 0 : c - n(e.stated_total);
          return <tr key={e.id}><td>{e.workstream}</td>{cols.map(([k]) => <td key={k}>{e[k] ?? '–'}</td>)}<td>{n(e.stated_total)}</td><td>{hyper ? '—' : c}</td>
            <td className={d ? 'flag' : ''} style={d ? { background: 'color-mix(in srgb, var(--bad) 15%, transparent)' } : undefined}>{hyper ? 'n/a' : d}</td></tr>; })}
          <tr><td><b>Total</b></td>{cols.map(([k]) => <td key={k}><b>{tot(k)}</b></td>)}<td><b>{tot('stated_total')}</b></td><td /><td /></tr>
        </tbody></table></div>
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat"><b>{cap}</b><span>Development capacity in §5.1 (Dev Lead + Developer)</span></div>
        <div className="stat"><b>{itemized.toFixed(2)}</b><span>Itemized §3.3 customization dev-days</span></div>
        <div className="stat"><b className="flag">{(itemized - cap).toFixed(2)}</b><span>Shortfall (itemized minus capacity)</span></div>
        <div className="stat"><b>{Math.round(((itemized - cap) / itemized) * 100)}%</b><span>Shortfall as share of itemized build</span></div>
      </div>
    </>
  );
}

export default function Sow() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const Tab = { overview: Overview, gaps: Gaps, appendix: Appendix, observations: Observations, items: Items, effort: Effort }[tab] || Overview;
  return (
    <section className="sheet">
      <SheetHead code="S-7" title="SOW & vendor — AWB S343096" actions={<Link className="btn ghost" to="/documents">SOW and letter files</Link>}>
        The vendor's statement of work checked against the blueprint: coverage gaps, items raised with AWB, commercial observations, and the SOW's own arithmetic.
      </SheetHead>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}
      </div>
      <Tab />
    </section>
  );
}
