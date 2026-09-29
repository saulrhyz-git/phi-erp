import { Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { useApi } from '../../hooks.js';
import { Loading } from '../../components/ui.jsx';
import { computeTasks, daysBetween, fmtShort, phaseSpans, todayYmd, phaseColor } from '../../schedule.js';
import { Badge, useToolkit } from './common.jsx';

export default function Guide() {
  const { meta, summary } = useToolkit();
  const g = meta.guide;
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
        <div><div className="eyebrow">Toolkit</div><h2>Project toolkit — Odoo 19 program</h2>
          <p>{g.intro}</p></div>
        {can('toolkit_config', 'edit') && <div className="actions"><Link className="btn" to="/toolkit/configure?tab=guide">Edit guide</Link></div>}
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
        {g.rules.map((x) => <li key={x}>{x}</li>)}
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
          <ul>{g.confirm.map((c) => <li key={c}>{c}</li>)}</ul>
          <h3>How this schedule was built</h3>
          <p className="small">{g.schedule_note}</p>
        </div>
        <div>
          <h3>Project folders (SharePoint / Drive)</h3>
          <ul className="small">{g.folders.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="small"><b>Naming:</b> {g.naming}</p>
        </div>
      </div>
    </section>
  );
}
