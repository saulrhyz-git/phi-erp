import { Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { useApi } from '../../hooks.js';
import { Loading } from '../../components/ui.jsx';
import { computeTasks, daysBetween, fmtShort, phaseSpans, todayYmd, phaseColor } from '../../schedule.js';
import { Badge, useToolkit } from './common.jsx';

const CONFIRM = [
  'The stretched timeline (about 32 weeks vs the SOW\u2019s 20) — effect on AWB fees, resourcing and billing milestones (RAID R-01, task 0.3).',
  'AWB billing / payment milestones from SOW S343096 — add them to Milestones.',
  'Onsite days in Cebu (SOW: mainly remote from Manila; onsite for kickoff, key workshops, UAT, training, go-live).',
  'The Go-Live date and cutover over the 30-Aug-2027 National Heroes Day holiday (RAID R-10).',
  '2027 holiday dates against the official Proclamation and Cebu local declarations.',
];
const FOLDERS = ['00_Governance — charter, SteerCo decks & minutes, sign-offs, contract & SOW', '01_Plan — status reports and exports', '02_As-Is — process maps, pain point log, Shadow IT samples',
  '03_BRD — Pre-BRD Dossier, BRD drafts & signed version, fit-gap', '04_Design — FDDs, To-Be maps, change requests', '05_Data — cleansing reports, migration templates, mock results, reconciliations',
  '06_Testing — SIT/UAT scripts, evidence, defect exports', '07_Training — materials, attendance, assessments, SOPs', '08_Cutover — runbook, Go/No-Go, final reconciliation', '09_Hypercare — ticket reports, exit review, lessons learned'];

export default function Guide() {
  const { meta, summary } = useToolkit();
  const { user, can, level } = useAuth();
  const settings = useApi(can('key_dates') ? '/toolkit/settings' : null);
  const tasks = useApi(can('schedule') ? '/toolkit/tasks' : null);
  const today = todayYmd();
  const computed = settings.data && tasks.data ? computeTasks(settings.data, tasks.data) : null;
  const spans = computed ? phaseSpans(computed, meta.phases).filter((p) => p.start && !['X', 'BLK'].includes(p.code)) : [];
  const upcoming = computed ? computed.filter((t) => t.type === 'Milestone' && t.start >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6) : [];
  const current = spans.filter((p) => p.start <= today && today <= p.end);
  const editable = meta.registers.filter((r) => level(r.key, 'edit') !== 'none');
  const route = (k) => `/toolkit/${k.replace(/_/g, '-')}`;

  return (
    <section className="sheet">
      <div className="sheet-head">
        <div className="sheet-code">T</div>
        <div><h2>Project toolkit — Odoo 19 program</h2>
          <p>Pre-BRD work + AWB implementation (SOW S343096) → Go-Live → 90-day hypercare. Everything the project team needs to plan, track and sign off, in one place.</p></div>
      </div>

      <div className="notice">
        You are signed in as <b>{user.role_name}</b>{user.domains.length ? <> for <b>{user.domains.join(', ')}</b></> : null}.{' '}
        {editable.length === 0 ? 'You can view every register but not change them.'
          : level(editable[0].key, 'edit') === 'own' ? `You can view everything and change records in your own domain${user.domains.length ? '' : ' (none assigned yet — ask the Project Manager)'}.`
            : 'You can view and change every register.'}
      </div>

      {computed ? (
        <>
          <div className="kpis">
            <div><b>{current.map((p) => p.code).join(' · ') || '—'}</b><span>Current phase{current.length > 1 ? 's' : ''}</span></div>
            <div><b>{summary?.tasks ? `${summary.tasks.done} / ${summary.tasks.n}` : '—'}</b><span>Tasks & milestones complete</span></div>
            <div><b>{daysBetween(today, settings.data.anchors.BRD)}</b><span>Days to BRD kickoff ({fmtShort(settings.data.anchors.BRD)})</span></div>
            <div><b>{daysBetween(today, settings.data.anchors.GL)}</b><span>Days to Go-Live ({fmtShort(settings.data.anchors.GL)})</span></div>
          </div>
          <div className="grid2" style={{ alignItems: 'start' }}>
            <div>
              <h3 style={{ marginTop: 0 }}>At a glance</h3>
              <div className="tablewrap"><table className="t">
                <thead><tr><th>Stage</th><th>Dates</th></tr></thead>
                <tbody>{spans.map((p) => (
                  <tr key={p.code}><td><i className="swatch" style={{ '--c': phaseColor(p) }} /> {p.label}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtShort(p.start)} → {fmtShort(p.end)}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Next milestones & gates</h3>
              <div className="tablewrap"><table className="t">
                <thead><tr><th>Date</th><th>Milestone</th><th>Status</th></tr></thead>
                <tbody>{upcoming.map((t) => (
                  <tr key={t.id}><td style={{ whiteSpace: 'nowrap' }}><b>{fmtShort(t.start)}</b><div className="small">in {daysBetween(today, t.start)} days</div></td>
                    <td>{t.name.replace(/^(MILESTONE|GATE): /, '')}{t.name.startsWith('GATE') && <> <span className="badge warn">GATE</span></>}</td><td><Badge v={t.status} /></td></tr>
                ))}</tbody>
              </table></div>
              {can('schedule') && <p><Link className="btn" to="/toolkit/schedule">Open the Gantt</Link></p>}
            </div>
          </div>
        </>
      ) : (can('schedule') ? <Loading /> : null)}

      <h3>The three rules</h3>
      <ol className="lede" style={{ fontWeight: 600 }}>
        <li>Fix the process before you touch the software.</li>
        <li>Over-communicate the “why” — then do it again.</li>
        <li>Protect the people raising hand-flags. Raising a real issue early is never blamed; the RAID log is open to everyone.</li>
      </ol>

      <h3>Registers</h3>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Register</th><th>Purpose</th><th>Records</th><th>Your access</th></tr></thead>
        <tbody>{meta.registers.filter((r) => can(r.key)).map((r) => (
          <tr key={r.key}>
            <td style={{ whiteSpace: 'nowrap' }}><Link to={route(r.key)}><b>{r.label}</b></Link><div className="small">{r.group}</div></td>
            <td className="w-lg">{r.description}</td>
            <td>{summary?.registers?.[r.key]?.n ?? 0}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{['add', 'edit', 'delete'].map((a) => { const l = level(r.key, a); return <span key={a} className={`lvl ${l}`} style={{ marginRight: 4 }} title={`${a}: ${l}`}>{a[0].toUpperCase()}{l === 'own' ? '·own' : ''}</span>; })}</td>
          </tr>
        ))}</tbody>
      </table></div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <h3>Must confirm with AWB / management</h3>
          <ul>{CONFIRM.map((c) => <li key={c}>{c}</li>)}</ul>
          <h3>How this schedule was built</h3>
          <p className="small">AWB's SOW S343096 defines six phases over 20 weeks plus 90 days of hypercare. Phase names, module waves and overlaps are kept; durations are stretched to reach a September 2027 Go-Live.
            The extra weeks go where ERP projects usually fail: finance year-end around BRD, Holy Week, three mock migrations, two SIT and two UAT rounds, a parallel billing run and a buffer before Go/No-Go.
            Go-Live on 1-Sep-2027 starts Odoo on a clean accounting period.</p>
        </div>
        <div>
          <h3>Project folders (SharePoint / Drive)</h3>
          <ul className="small">{FOLDERS.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="small"><b>Naming:</b> &lt;Folder#&gt;_&lt;Document&gt;_&lt;v#&gt;_&lt;YYYY-MM-DD&gt;, e.g. 03_BRD_OrderToCash_v2_2027-02-26.docx. Signed finals get _SIGNED. Share links, not attachments. Files that need version control and the audit trail belong in S-8 Documents.</p>
        </div>
      </div>
    </section>
  );
}
