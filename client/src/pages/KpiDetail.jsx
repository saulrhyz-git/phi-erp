import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown } from 'lucide-react';
import { api, fmtDate, fmtDateTime } from '../api.js';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, Loading, SheetHead } from '../components/ui.jsx';
import {
  HealthList, KPI_LINKS, KPI_STATUS_BADGE, KpiFormModal, KpiMappingModal, LinkPills, PRIORITY_BADGE, REPORT_STATUS_BADGE,
} from '../components/kpi.jsx';

const COPIS = [['customers', 'C', 'Customers'], ['outputs', 'O', 'Outputs'], ['steps', 'P', 'Process'], ['inputs', 'I', 'Inputs'], ['suppliers', 'S', 'Suppliers']];

function Level({ n, title, hint, children }) {
  return (
    <section className="kpi-level">
      <div className="kpi-level-head"><span className="kpi-level-n">{n}</span><div><h3>{title}</h3>{hint && <p className="small muted">{hint}</p>}</div></div>
      {children}
    </section>
  );
}

// One process under the KPI: its role, its COPIS read customer-first, the proving outputs highlighted.
function ProcessUnderKpi({ p }) {
  const stale = new Set(p.stale_outputs || []);
  const proving = new Set(p.outputs.filter((o) => !stale.has(o)));
  const missing = proving.size === 0;
  return (
    <article className="kpi-proc" style={{ '--c': `var(--${p.color})` }}>
      <header className="row">
        <Link to={`/processes/${p.process_id}`} className="kpi-proc-name"><b>{p.process_id}</b> {p.name}</Link>
        <span className={`badge ${p.role === 'Produces' ? 'info' : 'neutral'}`}>{p.role}</span>
        <span className="small muted">{p.stage} · {p.owner_dept}{p.owners?.length ? ` · ${p.owners.join(', ')}` : ''}</span>
      </header>
      {missing && <div className="notice small" style={{ margin: '8px 0' }}>No output has been chosen as proof yet — say which output of {p.process_id} shows this KPI is met.</div>}
      {p.stale_outputs?.length > 0 && <div className="notice error small" style={{ margin: '8px 0' }}>No longer an output of {p.process_id}: {p.stale_outputs.join('; ')}. Update the mapping.</div>}
      <div className="sgrid kpi-copis">
        {COPIS.map(([k, letter, label]) => (
          <div key={k}>
            <h4><em>{letter}</em>{label}</h4>
            {k === 'steps' ? <ol>{(p[k] || []).map((x, i) => <li key={i}>{x}</li>)}</ol>
              : <ul>{((k === 'outputs' ? p.copis_outputs : p[k]) || []).map((x, i) => <li key={i} className={k === 'outputs' && proving.has(x) ? 'kpi-proves' : undefined}>
                {x}{k === 'outputs' && proving.has(x) && <span className="kpi-proves-tag">proves it</span>}</li>)}</ul>}
          </div>
        ))}
      </div>
      {p.hand_off_steps?.length > 0 && (
        <div className="kpi-steps">
          <span className="small muted">Hand-off steps</span>
          {p.hand_off_steps.map((s) => (
            <Link key={s.id} to={`/processes/${p.process_id}#step-${s.ref}`} className={`pill${s.linked ? ' kpi-step-on' : ''}`}
              title={s.linked ? 'This KPI is measured or controlled here' : undefined}>{s.ref} {s.step}</Link>
          ))}
        </div>
      )}
    </article>
  );
}

export default function KpiDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: k, error, loading, reload } = useApi(`/kpis/${id}`);
  const [edit, setEdit] = useState(null); // 'form' | 'map'
  const [err, setErr] = useState(null);
  if (loading && !k) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const remove = async () => {
    if (!window.confirm(`Delete ${k.id} ${k.name}? Its mapping to processes, reports and the rest is removed too. Consider marking it Retired instead.`)) return;
    try { await api(`/kpis/${k.id}`, { method: 'DELETE' }); nav('/kpis'); } catch (e) { setErr(e); }
  };
  const produces = k.processes.filter((p) => p.role === 'Produces');
  const contributes = k.processes.filter((p) => p.role === 'Contributes');
  const L = k.links;
  const tests = L.tk_record || [];

  return (
    <>
      <section className="sheet">
        <SheetHead code={`${k.id} · Customer Requirement (KPI)`} title={k.name}
          actions={<>
            {k.can_edit && <button className="btn" onClick={() => setEdit('form')}>Edit requirement</button>}
            {k.can_edit && <button className="btn primary" onClick={() => setEdit('map')}>Edit mapping</button>}
            {k.can_delete && <button className="btn danger" onClick={remove}>Delete</button>}
          </>}>
          <span className={`badge ${KPI_STATUS_BADGE[k.status]}`}>{k.status}</span>{' '}
          <span className={`badge ${PRIORITY_BADGE[k.priority]}`}>{k.priority} priority</span>{' '}
          {k.domain_id ? <span className="domain">{k.domain_id} · {k.domain_name}</span> : <span className="domain none">Project-wide</span>}
          <span className="small muted"> · updated {fmtDateTime(k.updated_at)}{k.updated_by_name ? ` by ${k.updated_by_name}` : ''}</span>
        </SheetHead>
        <ErrorNote error={err} />

        <div className="kpi-top">
          <Level n="1" title="The end in mind" hint="Who requires it, what they need, and the number that proves it is delivered.">
            <blockquote className="kpi-req"><span className="small muted">{k.customer} requires</span><p>{k.requirement}</p></blockquote>
            <dl className="kv kpi-kv">
              <dt>KPI</dt><dd><b>{k.name}</b>{k.unit ? ` (${k.unit})` : ''}{k.direction ? <span className="small muted"> · {k.direction}</span> : ''}</dd>
              <dt>Definition</dt><dd>{k.definition || <span className="flag">Not defined yet</span>}</dd>
              <dt>Baseline</dt><dd>{k.baseline ? `${k.baseline}${k.baseline_date ? ` (${fmtDate(k.baseline_date)})` : ''}` : <span className="flag">Not recorded yet</span>}</dd>
              <dt>Target</dt><dd>{k.target || <span className="flag">Not set</span>}</dd>
              <dt>Measured</dt><dd>{k.frequency || '—'}</dd>
              <dt>Data source</dt><dd>{k.data_source || '—'}</dd>
              <dt>KPI owner</dt><dd>{k.owner || <span className="flag">Not named</span>}</dd>
              {k.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{k.notes}</dd></>}
            </dl>
          </Level>
          <aside className="kpi-trace-box">
            <h4>Trace check · {k.health.done}/{k.health.total}</h4>
            <HealthList health={k.health} />
            {k.can_edit && k.health.done < k.health.total && <button className="btn sm" onClick={() => setEdit(k.health.checks.slice(0, 5).some((c) => !c.ok) ? 'form' : 'map')}>Close the gaps</button>}
          </aside>
        </div>

        <div className="kpi-arrow" aria-hidden="true"><ArrowDown size={18} /></div>
        <Level n="2" title="Where it is seen — reports" hint="The reports, dashboards and statements that show this KPI to the customer and to management.">
          {(L.report || []).length === 0 ? <div className="empty small">No report shows this KPI yet. <Link to="/reports">Add it to the Reports register</Link>, then map it here.</div> : (
            <div className="kpi-cards">
              {L.report.map((r) => (
                <Link key={r.id} to={`/reports/${r.id}`} className="kpi-card">
                  <span className="ref">{r.id}</span> <b>{r.label}</b>
                  <div className="small muted">{r.hint}{r.processes?.length ? ` · from ${r.processes.join(', ')}` : ''}</div>
                  <span className={`badge ${REPORT_STATUS_BADGE[r.extra] || 'neutral'}`}>{r.extra}</span>
                </Link>
              ))}
            </div>
          )}
        </Level>

        <div className="kpi-arrow" aria-hidden="true"><ArrowDown size={18} /></div>
        <Level n="3" title="Processes that deliver it — with their COPIS" hint="Each process is read customer-first. Highlighted outputs are the ones that prove the KPI is met.">
          {k.processes.length === 0 && <div className="empty small">No process is mapped yet. Which process produces this result?</div>}
          {produces.map((p) => <ProcessUnderKpi key={p.process_id} p={p} />)}
          {contributes.length > 0 && <h4 className="kpi-sub">Contributing processes</h4>}
          {contributes.map((p) => <ProcessUnderKpi key={p.process_id} p={p} />)}
        </Level>

        <div className="kpi-arrow" aria-hidden="true"><ArrowDown size={18} /></div>
        <Level n="4" title="Where it is measured — steps and data" hint="The hand-off steps where it is captured or controlled, and the master data it is calculated from.">
          <dl className="kv">
            <dt>Hand-off steps</dt><dd><LinkPills type="step" items={L.step} empty="None mapped" /></dd>
            <dt>Master data</dt><dd><LinkPills type="master_data" items={L.master_data} empty="None mapped" /></dd>
            <dt>Data source</dt><dd>{k.data_source || <span className="muted small">—</span>}</dd>
          </dl>
        </Level>

        <div className="kpi-arrow" aria-hidden="true"><ArrowDown size={18} /></div>
        <Level n="5" title="Change, decisions and proof" hint="What moves the number, what is still undecided, and how go-live will prove it.">
          <dl className="kv">
            {KPI_LINKS.filter(([t]) => !['report', 'step', 'master_data', 'tk_record'].includes(t)).map(([t, label]) => (
              <span key={t} style={{ display: 'contents' }}><dt>{label}</dt><dd><LinkPills type={t} items={L[t]} empty="None mapped" /></dd></span>
            ))}
            <dt>UAT scripts</dt><dd><LinkPills type="tk_record" items={tests.filter((x) => x.extra === 'uat')} empty="None yet — add a UAT script that proves this KPI can be measured" /></dd>
            <dt>Fit-gap &amp; pain points</dt><dd><LinkPills type="tk_record" items={tests.filter((x) => x.extra !== 'uat')} empty="None mapped" /></dd>
          </dl>
        </Level>
        <Comments type="kpi" id={k.id} />
      </section>
      <KpiFormModal open={edit === 'form'} kpi={k} onClose={() => setEdit(null)} onSaved={reload} />
      <KpiMappingModal open={edit === 'map'} kpi={k} onClose={() => setEdit(null)} onSaved={reload} />
    </>
  );
}

