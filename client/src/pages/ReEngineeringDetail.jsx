import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { Comments, ErrorNote, Loading, SheetHead } from '../components/ui.jsx';
import EditModal from '../components/EditModal.jsx';
import { IMPACT_COLOR } from './ReEngineering.jsx';

const Steps = ({ steps }) => (
  <ol className="steps">{steps.map((s, i) => <li key={i}><span className={`tag ${s.tag}`}>{s.tag || '—'}</span><span>{s.text}</span></li>)}</ol>
);
const toText = (steps) => steps.map((s) => `${s.tag ? `[${s.tag}] ` : ''}${s.text}`).join('\n');
const toSteps = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^\[(\w+)\]\s*(.*)$/); return m ? { tag: m[1], text: m[2] } : { tag: '', text: l };
});

const DECISION_FIELDS = [
  { key: 'phi_decision', label: 'PHI decision', type: 'select', options: ['', 'Accept', 'Accept with changes', 'Needs discussion', 'Defer', 'Reject'] },
  { key: 'phi_owner', label: 'PHI owner' }, { key: 'target_date', label: 'Target date', type: 'date' },
  { key: 'phi_comments', label: 'PHI comments', type: 'textarea' },
  { key: 'negotiation_status', label: 'Negotiation status with AWB', type: 'select', options: ['Open', 'Raised with AWB', 'In base scope', 'Change request', 'Offset agreed', 'PHI internal', 'Closed'] },
  { key: 'agreed_treatment', label: 'Agreed treatment', type: 'select', options: ['', 'Include in base scope', 'Design change at BRD (no cost)', 'Change request', 'Offset against other item', 'PHI to handle', 'Drop'] },
  { key: 'awb_estimate', label: 'AWB estimate (man-days)', type: 'number' },
];
const KPI_FIELDS = [
  { key: 'kpi_baseline', label: 'Baseline (current value)' }, { key: 'kpi_baseline_date', label: 'Baseline date', type: 'date' },
  { key: 'kpi_agreed_target', label: 'Agreed target' }, { key: 'kpi_owner', label: 'KPI owner' },
];
const CONTENT_FIELDS = [
  { key: 'title', label: 'Opportunity' }, { key: 'current_process', label: 'Current process', type: 'textarea' },
  { key: 'pain_points', label: 'Pain points and control risks', type: 'textarea' }, { key: 'proposed', label: 'Proposed process', type: 'textarea' },
  { key: 'why_problem', label: 'Why change: problem and root cause', type: 'textarea' }, { key: 'how_fixes', label: 'How it fixes it', type: 'textarea' },
  { key: 'control_effect', label: 'Effect on controls and compliance', type: 'textarea' },
  { key: 'before_text', label: 'Before steps — one per line, e.g. [Manual] Finance consolidates spreadsheets', type: 'textarea' },
  { key: 'after_text', label: 'After steps — one per line, e.g. [Auto] System consolidates budget', type: 'textarea' },
  { key: 'what_changes', label: 'What changes', type: 'textarea' }, { key: 'roles_affected', label: 'Roles affected', type: 'textarea' },
  { key: 'awb_change', label: 'What AWB must build or configure differently', type: 'textarea' },
];

export default function ReEngineeringDetail() {
  const { id } = useParams();
  const { isEditor, isAdmin } = useAuth();
  const { data: r, error, loading, reload } = useApi(`/reengineering/${id}`);
  const [edit, setEdit] = useState(null); // 'decision' | 'kpi' | 'content'
  if (loading && !r) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const save = (body) => api(`/reengineering/${id}`, { method: 'PUT', body }).then(reload);
  const saveContent = ({ before_text, after_text, ...rest }) => save({ ...rest, before_steps: toSteps(before_text), after_steps: toSteps(after_text) });
  const manualBefore = r.before_steps.filter((s) => ['Manual', 'Paper', 'Rekey', 'Wait'].includes(s.tag)).length;
  const autoAfter = r.after_steps.filter((s) => ['Auto', 'Rule'].includes(s.tag)).length;

  return (
    <>
      <section className="sheet">
        <SheetHead code={r.id} title={r.title}
          actions={<><Link className="btn ghost" to="/reengineering">All opportunities</Link>{isAdmin && <button className="btn" onClick={() => setEdit('content')}>Edit content</button>}</>}>
          {r.wave}{r.continues ? ` → ${r.continues}` : ''} · {r.benefits}
        </SheetHead>
        <div className="row" style={{ marginBottom: 14 }}>
          {r.processes.map((p) => <Link key={p.id} className="pill" style={{ borderLeft: `4px solid var(--${p.color})`, textDecoration: 'none' }} to={`/processes/${p.id}`}>{p.id} · {p.name}</Link>)}
          {r.process_refs === 'All' && <span className="pill">All processes</span>}
        </div>
        <div className="side">
          <div className="cur"><h4>Current process</h4><p style={{ margin: '0 0 8px' }}>{r.current_process}</p><p className="small" style={{ margin: 0 }}><b>Pain points and control risks:</b> {r.pain_points}</p></div>
          <div className="new"><h4>Re-engineered process</h4><p style={{ margin: 0 }}>{r.proposed}</p></div>
        </div>
        <h3>1. Justification</h3>
        <div className="why">
          <div><h5>1a. Why change — problem and root cause</h5>{r.why_problem}</div>
          <div><h5>1b. How the re-engineering fixes it</h5>{r.how_fixes}</div>
          <div><h5>1c. Effect on controls and compliance</h5>{r.control_effect}<div className="small muted" style={{ marginTop: 6 }}>{r.controls}</div></div>
          <div><h5>1d. Expected outcome</h5><b>{r.kpi}</b> → {r.target}<div className="small muted" style={{ marginTop: 6 }}>Odoo enabler: {r.odoo_enabler}</div></div>
        </div>
        <h3>2. How the process changes</h3>
        <div className="side">
          <div className="cur"><h4>Before · {r.before_steps.length} steps, {manualBefore} manual</h4><Steps steps={r.before_steps} /></div>
          <div className="new"><h4>After · {r.after_steps.length} steps, {autoAfter} automated or enforced</h4><Steps steps={r.after_steps} /></div>
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div><h4 style={{ fontSize: '1.05rem', margin: '0 0 4px' }}>What changes</h4><p className="small" style={{ margin: 0 }}>{r.what_changes}</p></div>
          <div><h4 style={{ fontSize: '1.05rem', margin: '0 0 4px' }}>Roles affected</h4><p className="small" style={{ margin: 0 }}>{r.roles_affected}</p></div>
        </div>
        <p className="muted small">Tags — before: Manual, Paper, Rekey, Wait · after: Auto, Rule (system-enforced), Parallel, Earlier, New, Same.</p>
      </section>

      <section className="sheet">
        <h3 style={{ marginTop: 0 }}>3. Effect on the AWB SOW</h3>
        <dl className="kv">
          <dt>Impact type</dt><dd><span className="impact" style={{ '--c': `var(--${IMPACT_COLOR[r.impact_type]})` }}>{r.impact_type}</span></dd>
          <dt>SOW sections</dt><dd>{r.sow_sections}</dd>
          <dt>What AWB must do differently</dt><dd>{r.awb_change}</dd>
          <dt>Linked appendix items</dt><dd>{r.appendix.length ? r.appendix.map((a) => <span className="pill" key={a.code}>{a.code} {a.title} · {a.status}</span>) : '—'}</dd>
          <dt>Extra effort (indicative)</dt><dd>{Number(r.effort_low)}–{Number(r.effort_high)} man-days{Number(r.offset_high) > 0 && <> · possible offset {Number(r.offset_low)}–{Number(r.offset_high)} md</>}{r.awb_estimate !== null && <> · <b>AWB estimate {Number(r.awb_estimate)} md</b></>}</dd>
          <dt>Built in</dt><dd>{r.build_phase}</dd>
          <dt>Suggested SOW / BRD wording</dt><dd>{r.sow_wording}</dd>
          <dt>Flex category if not in base</dt><dd>{r.flex_category}</dd>
          <dt>Risk if not addressed</dt><dd>{r.risk}</dd>
        </dl>
        {r.items.length > 0 && (
          <div className="tablewrap">
            <table className="t"><thead><tr><th>#</th><th>SOW section</th><th>Feature</th><th>Dev man-days</th></tr></thead>
              <tbody>{r.items.map((i) => <tr key={i.no}><td className="ref">#{i.no}</td><td>{i.section}</td><td>{i.feature}</td><td>{Number(i.dev_days).toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sheet">
        <div className="grid2" style={{ gap: 24 }}>
          <div>
            <div className="row"><h3 style={{ margin: 0 }}>PHI decision</h3><span style={{ flex: 1 }} />{isEditor && <button className="btn sm" onClick={() => setEdit('decision')}>Update</button>}</div>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Decision</dt><dd>{r.phi_decision || <span className="muted">Not decided</span>}</dd>
              <dt>Owner</dt><dd>{r.phi_owner || '—'}</dd>
              <dt>Target date</dt><dd>{fmtDate(r.target_date) || '—'}</dd>
              <dt>Negotiation status</dt><dd>{r.negotiation_status}</dd>
              <dt>Agreed treatment</dt><dd>{r.agreed_treatment || '—'}</dd>
              <dt>Comments</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.phi_comments || '—'}</dd>
            </dl>
          </div>
          <div>
            <div className="row"><h3 style={{ margin: 0 }}>KPI tracking</h3><span style={{ flex: 1 }} />{isEditor && <button className="btn sm" onClick={() => setEdit('kpi')}>Update</button>}</div>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>KPI</dt><dd>{r.kpi}</dd>
              <dt>Proposed target</dt><dd>{r.target}</dd>
              <dt>Baseline</dt><dd>{r.kpi_baseline ? `${r.kpi_baseline} (${fmtDate(r.kpi_baseline_date) || 'undated'})` : <span className="flag">Not recorded yet</span>}</dd>
              <dt>Agreed target</dt><dd>{r.kpi_agreed_target || '—'}</dd>
              <dt>KPI owner</dt><dd>{r.kpi_owner || '—'}</dd>
            </dl>
          </div>
        </div>
        <p className="muted small">Last updated {fmtDateTime(r.updated_at)}{r.updated_by_name ? ` by ${r.updated_by_name}` : ''}.</p>
        <Comments type="reengineering" id={r.id} />
      </section>

      <EditModal open={edit === 'decision'} title={`${r.id} — PHI decision`} record={r} fields={DECISION_FIELDS} onClose={() => setEdit(null)} onSave={save} />
      <EditModal open={edit === 'kpi'} title={`${r.id} — KPI tracking`} record={r} fields={KPI_FIELDS} onClose={() => setEdit(null)} onSave={save} />
      <EditModal open={edit === 'content'} title={`${r.id} — edit content`} record={{ ...r, before_text: toText(r.before_steps), after_text: toText(r.after_steps) }}
        fields={CONTENT_FIELDS} onClose={() => setEdit(null)} onSave={saveContent} />
    </>
  );
}
