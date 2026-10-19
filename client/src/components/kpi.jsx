// Shared pieces for Customer Requirements (KPI): the add/edit form, the mapping editor and the trace health check.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { ErrorNote, Modal } from './ui.jsx';
import LinkPicker from './LinkPicker.jsx';

export const KPI_STATUS_BADGE = { Draft: 'warn', Validated: 'ok', Retired: 'neutral' };
export const REPORT_STATUS_BADGE = { Proposed: 'neutral', Specified: 'info', Built: 'info', Tested: 'warn', Live: 'ok', Retired: 'neutral' };
export const PRIORITY_BADGE = { High: 'bad', Medium: 'warn', Low: 'neutral' };

// Everything a KPI maps to besides processes, in the order the trace reads.
export const KPI_LINKS = [
  ['report', 'Reports that show it', 'Where the customer and management see the number.'],
  ['step', 'Hand-off steps where it is measured or controlled', ''],
  ['master_data', 'Data it is calculated from (master data)', ''],
  ['reengineering', 'Re-engineering that moves it', ''],
  ['diagram', 'Swimlane diagrams', ''],
  ['open_item', 'Open items / decisions', ''],
  ['document', 'Documents (evidence, policy, baseline)', ''],
  ['tk_record', 'Fit-gap, UAT scripts and pain points', 'A UAT script that proves the KPI can be measured.'],
];

// Where each kind of linked record lives in the app.
export function linkHref(type, x) {
  switch (type) {
    case 'report': return `/reports/${x.id}`;
    case 'process': return `/processes/${x.id}`;
    case 'step': { const [pid, ref] = (x.extra || '').split('|'); return `/processes/${pid}#step-${ref}`; }
    case 'diagram': return `/diagrams/${x.id}`;
    case 'reengineering': return `/reengineering/${x.id}`;
    case 'master_data': return '/master-data';
    case 'open_item': return '/open-items';
    case 'document': return '/documents';
    case 'tk_record': return `/toolkit/${x.extra}`;
    case 'kpi': return `/kpis/${x.id}`;
    default: return '#';
  }
}

export function LinkPills({ type, items, empty }) {
  if (!items?.length) return empty ? <span className="muted small">{empty}</span> : null;
  return items.map((x) => (
    <Link key={`${type}-${x.id}`} className="pill" to={linkHref(type, x)} title={x.hint || undefined}>{x.label}</Link>
  ));
}

export function HealthBar({ health }) {
  const pct = Math.round((health.done / health.total) * 100);
  const cls = pct === 100 ? 'ok' : pct >= 60 ? 'warn' : 'bad';
  const missing = health.checks.filter((c) => !c.ok).map((c) => c.label);
  return (
    <div className="kpi-health" title={missing.length ? `Still needed: ${missing.join('; ')}` : 'Fully traced'}>
      <span className={`kpi-health-num ${cls}`}>{health.done}/{health.total}</span>
      <span className="kpi-health-bar"><i className={cls} style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

export function HealthList({ health }) {
  return (
    <ul className="kpi-checks">
      {health.checks.map((c) => (
        <li key={c.key} className={c.ok ? 'ok' : 'gap'}>
          {c.ok ? <CircleCheck size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
          <span>{c.label}</span><span className="sr-only">{c.ok ? '— done' : '— still needed'}</span>
        </li>
      ))}
    </ul>
  );
}

// Domains this user may file a KPI or report under.
export function useDomainChoices(module, action) {
  const { user, level } = useAuth();
  const { data } = useApi('/domains');
  const lvl = level(module, action);
  const all = data || [];
  return { domains: lvl === 'all' ? all : all.filter((d) => user.domains.includes(d.id)), projectWide: lvl === 'all' };
}

const BLANK = { customer: '', requirement: '', name: '', definition: '', unit: '', direction: '', baseline: '', baseline_date: '', target: '',
  frequency: '', data_source: '', owner: '', domain_id: '', priority: 'Medium', status: 'Draft', notes: '' };

// Add or edit a KPI's definition. presetProcess: { process_id, role } when adding from a process page.
export function KpiFormModal({ open, onClose, kpi, presetProcess, onSaved }) {
  const { data: opts } = useApi(open ? '/kpis/options' : null);
  const { domains, projectWide } = useDomainChoices('kpis', kpi ? 'edit' : 'add');
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (kpi) setF({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, kpi[k] ?? ''])), baseline_date: kpi.baseline_date ? String(kpi.baseline_date).slice(0, 10) : '' });
    else setF({ ...BLANK, domain_id: presetProcess?.domain_id && domains.some((d) => d.id === presetProcess.domain_id) ? presetProcess.domain_id : (domains.length === 1 && !projectWide ? domains[0].id : '') });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, domain_id: f.domain_id || null, baseline_date: f.baseline_date || null };
      if (kpi) { await api(`/kpis/${kpi.id}`, { method: 'PUT', body }); onSaved?.(kpi.id); }
      else {
        if (presetProcess) body.processes = [{ process_id: presetProcess.process_id, role: presetProcess.role || 'Produces', outputs: [] }];
        const r = await api('/kpis', { method: 'POST', body });
        onSaved?.(r.id);
      }
      onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} wide title={kpi ? `Edit ${kpi.id}` : 'Add a Customer Requirement (KPI)'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : kpi ? 'Save' : 'Add requirement'}</button></>}>
      <ErrorNote error={err} />
      {!kpi && <p className="small muted" style={{ marginTop: 0 }}>Start with the customer and what they need. The processes, reports and data that deliver it are mapped next{presetProcess ? ` — this one starts mapped to process ${presetProcess.process_id}` : ''}.</p>}
      <datalist id="kpi-customers">{(opts?.customers || []).map((c) => <option key={c} value={c} />)}</datalist>
      <h4 className="kpi-form-h">1 · The customer and what they require</h4>
      <div className="grid2">
        <label className="field"><span>Customer (who requires it)</span><input type="text" list="kpi-customers" value={f.customer} onChange={set('customer')} placeholder="e.g. Buyer, ManCom, Suppliers" /></label>
        <label className="field"><span>Status</span>
          <select value={f.status} onChange={set('status')}><option>Draft</option><option>Validated</option><option>Retired</option></select></label>
      </div>
      <label className="field"><span>Requirement — in the customer’s words</span><textarea value={f.requirement} onChange={set('requirement')} style={{ minHeight: 64 }} placeholder="e.g. A correct Contract to Sell, ready to sign quickly" /></label>
      <h4 className="kpi-form-h">2 · How it is measured (the KPI)</h4>
      <div className="grid2">
        <label className="field"><span>KPI / measure</span><input type="text" value={f.name} onChange={set('name')} placeholder="e.g. Days from reservation to notarized CTS" /></label>
        <label className="field"><span>Direction</span>
          <select value={f.direction} onChange={set('direction')}>{['', 'Lower is better', 'Higher is better', 'Hit the target'].map((x) => <option key={x} value={x}>{x || '—'}</option>)}</select></label>
      </div>
      <label className="field"><span>Definition — how it is calculated</span><textarea value={f.definition} onChange={set('definition')} style={{ minHeight: 56 }} placeholder="e.g. Notarization date − reservation date, in calendar days, per unit; report the median and the % within target" /></label>
      <div className="grid2">
        <label className="field"><span>Baseline (today’s value)</span><input type="text" value={f.baseline} onChange={set('baseline')} /></label>
        <label className="field"><span>Baseline date</span><input type="date" value={f.baseline_date} onChange={set('baseline_date')} /></label>
        <label className="field"><span>Target</span><input type="text" value={f.target} onChange={set('target')} placeholder="e.g. ≤ 30 days" /></label>
        <label className="field"><span>Unit</span><input type="text" value={f.unit} onChange={set('unit')} placeholder="e.g. days, %, count" /></label>
        <label className="field"><span>Measured / reported</span><input type="text" value={f.frequency} onChange={set('frequency')} placeholder="e.g. Weekly, monthly" /></label>
        <label className="field"><span>Data source</span><input type="text" value={f.data_source} onChange={set('data_source')} placeholder="Where the numbers come from" /></label>
      </div>
      <h4 className="kpi-form-h">3 · Ownership</h4>
      <div className="grid2">
        <label className="field"><span>KPI owner (accountable for the result)</span><input type="text" value={f.owner} onChange={set('owner')} /></label>
        <label className="field"><span>Domain</span>
          <select value={f.domain_id || ''} onChange={set('domain_id')}>
            {projectWide && <option value="">Project-wide (Project Manager only)</option>}
            {!projectWide && !f.domain_id && <option value="">Choose your domain</option>}
            {domains.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.name}</option>)}
            {f.domain_id && !domains.some((d) => d.id === f.domain_id) && <option value={f.domain_id}>{f.domain_id}</option>}
          </select></label>
        <label className="field"><span>Priority</span><select value={f.priority} onChange={set('priority')}><option>High</option><option>Medium</option><option>Low</option></select></label>
      </div>
      <label className="field"><span>Notes</span><textarea value={f.notes} onChange={set('notes')} style={{ minHeight: 50 }} /></label>
    </Modal>
  );
}

// Map a KPI to the processes that deliver it (role + proving outputs) and to everything else.
export function KpiMappingModal({ open, onClose, kpi, onSaved }) {
  const { data: opts } = useApi(open ? '/kpis/options' : null);
  const [procs, setProcs] = useState([]);
  const [links, setLinks] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !kpi) return;
    setErr(null);
    setProcs(kpi.processes.map((p) => ({ process_id: p.process_id, role: p.role, outputs: p.outputs.filter((o) => !(p.stale_outputs || []).includes(o)) })));
    setLinks(Object.fromEntries(KPI_LINKS.map(([t]) => [t, (kpi.links?.[t] || []).map((x) => x.id)])));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = Object.fromEntries((opts?.processes || []).map((p) => [p.id, p]));
  const pickProcs = (ids) => setProcs((cur) => ids.map((id) => cur.find((p) => p.process_id === id) || { process_id: id, role: 'Produces', outputs: [] }));
  const setProc = (id, patch) => setProcs((cur) => cur.map((p) => (p.process_id === id ? { ...p, ...patch } : p)));
  const toggleOut = (id, o) => setProcs((cur) => cur.map((p) => (p.process_id !== id ? p
    : { ...p, outputs: p.outputs.includes(o) ? p.outputs.filter((x) => x !== o) : [...p.outputs, o] })));
  const save = async () => {
    setBusy(true);
    try {
      await api(`/kpis/${kpi.id}`, { method: 'PUT', body: { processes: procs, links } });
      onSaved?.(); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const procOptions = (opts?.processes || []).map((p) => ({ value: p.id, label: p.name, hint: p.stage }));
  return (
    <Modal open={open} wide title={kpi ? `Map ${kpi.id} to the blueprint` : ''} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !opts}>{busy ? 'Saving…' : 'Save mapping'}</button></>}>
      <ErrorNote error={err} />
      {opts && kpi && (
        <>
          <h4 className="kpi-form-h">1 · Processes that deliver it</h4>
          <p className="small muted" style={{ marginTop: 0 }}><b>Produces</b>: the process delivers the result. <b>Contributes</b>: it feeds it. Tick the COPIS outputs that prove the KPI is met.</p>
          <div className="kpi-map-procs">
            <LinkPicker label="Processes" options={procOptions} value={procs.map((p) => p.process_id)} onChange={pickProcs} height={260} />
            <div className="kpi-map-list">
              {procs.length === 0 && <div className="empty small">Pick at least one process that produces this result.</div>}
              {procs.map((p) => {
                const proc = byId[p.process_id];
                return (
                  <div key={p.process_id} className="kpi-map-proc" style={{ '--c': `var(--${proc?.color || 'x'})` }}>
                    <div className="row">
                      <b>{p.process_id} {proc?.name}</b><span style={{ flex: 1 }} />
                      <select value={p.role} onChange={(e) => setProc(p.process_id, { role: e.target.value })} aria-label={`Role of ${p.process_id}`} style={{ width: 'auto' }}>
                        <option>Produces</option><option>Contributes</option></select>
                    </div>
                    <div className="small muted" style={{ margin: '6px 0 4px' }}>Outputs that prove it</div>
                    {(proc?.outputs || []).length === 0
                      ? <div className="small flag">This process has no COPIS outputs yet — add them on the process page.</div>
                      : proc.outputs.map((o) => (
                        <label key={o} className="kpi-out"><input type="checkbox" checked={p.outputs.includes(o)} onChange={() => toggleOut(p.process_id, o)} /> {o}</label>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
          <h4 className="kpi-form-h">2 · Everything else that delivers, shows or proves it</h4>
          <div className="linkgrid">
            {KPI_LINKS.map(([t, label]) => (
              <LinkPicker key={t} label={label} options={opts[t] || []} value={links[t] || []} onChange={(v) => setLinks({ ...links, [t]: v })} />
            ))}
          </div>
          <p className="small muted">Mapping is independent of any implementor’s SOW, so it stays valid if the implementation partner changes.</p>
        </>
      )}
    </Modal>
  );
}
