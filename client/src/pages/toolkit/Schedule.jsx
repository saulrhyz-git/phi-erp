import { Fragment, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useApi } from '../../hooks.js';
import { ErrorNote, Loading, SheetHead } from '../../components/ui.jsx';
import { addDays, computeTasks, daysBetween, fmtShort, phaseSpans, todayYmd } from '../../schedule.js';
import { Badge, DomainTag, useToolkit } from './common.jsx';
import TaskModal, { STATUSES } from './TaskModal.jsx';

const WK = 22;          // px per week
const LBL = 360;        // label column width

function Gantt({ settings, phases, tasks, onOpen, collapsed, toggle }) {
  const start = settings.gantt_start;
  const weeks = Math.ceil((daysBetween(start, settings.gantt_end) + 1) / 7);
  const W = weeks * WK;
  const x = (ymd) => (daysBetween(start, ymd) / 7) * WK;
  const today = todayYmd();
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(start, i * 7));
  const months = [];
  weekStarts.forEach((d, i) => {
    const m = d.slice(0, 7);
    if (!months.length || months[months.length - 1].m !== m) months.push({ m, i, n: 1 }); else months[months.length - 1].n++;
  });
  const anchors = [['PRE', 'Pre-work'], ['BRD', 'BRD kickoff'], ['GL', 'Go-Live']];
  const bar = (t, color, isPhase) => {
    if (!t.start) return null;
    if (t.type === 'Milestone') return <button type="button" className={`g-ms${t.status === 'Complete' ? ' done' : ''}`} style={{ left: x(t.start) + WK / 7 * 0.5 - 9 }} onClick={() => onOpen(t)} aria-label={`${t.code} ${t.name}, ${fmtShort(t.start)}`} title={`${t.code} ${t.name} — ${fmtShort(t.start)}`} />;
    const left = x(t.start); const width = Math.max(((daysBetween(t.start, t.end) + 1) / 7) * WK, 5);
    return <button type="button" className={`g-bar${t.status === 'Complete' ? ' done' : ''}${t.type === 'Blackout' ? ' blk' : ''}`} style={{ left, width, '--pc': color }}
      onClick={isPhase ? undefined : () => onOpen(t)} aria-label={`${t.code || ''} ${t.name || t.label}, ${fmtShort(t.start)} to ${fmtShort(t.end)}`}
      title={`${t.code || ''} ${t.name || t.label}\n${fmtShort(t.start)} → ${fmtShort(t.end)}${t.status ? `\n${t.status}` : ''}`} />;
  };
  return (
    <div className="gantt">
      <div className="g-grid" style={{ gridTemplateColumns: `${LBL}px ${W}px`, position: 'relative', '--wk': `${WK}px` }}>
        <div className="g-row g-head r1">
          <div className="g-lbl">Month</div>
          <div className="g-months">{months.map((m) => <div key={m.m} style={{ width: m.n * WK }}>{new Date(`${m.m}-01T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', year: '2-digit' })}</div>)}</div>
        </div>
        <div className="g-row g-head r2">
          <div className="g-lbl">Task · week of (day)</div>
          <div className="g-weeks">{weekStarts.map((d) => <div key={d} style={{ background: d <= today && today < addDays(d, 7) ? 'var(--bad)' : undefined }}>{Number(d.slice(8))}</div>)}</div>
        </div>
        {phases.filter((p) => p.tasks.length).map((p) => (
          <Fragment key={p.code}>
            <div className="g-row phase" style={{ '--pc': p.dark }}>
              <div className="g-lbl"><button type="button" className="btn sm" style={{ minHeight: 22, padding: '0 6px', background: '#fff', color: '#0B1220' }} onClick={() => toggle(p.code)} aria-expanded={!collapsed[p.code]}>{collapsed[p.code] ? '+' : '−'}</button><span>{p.label}</span></div>
              <div className="g-track">{bar({ ...p, start: p.start, end: p.end, type: 'Phase' }, p.dark, true)}</div>
            </div>
            {!collapsed[p.code] && p.tasks.map((t) => (
              <div className={`g-row${t.type === 'Milestone' ? ' ms' : ''}`} key={t.id}>
                <div className="g-lbl" title={`${t.code} ${t.name}`}>
                  <span className="code">{t.code}</span>
                  <button type="button" onClick={() => onOpen(t)} style={{ all: 'unset', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, color: t.type === 'Blackout' ? 'var(--bad)' : undefined }}>{t.name}</button>
                  {t.domain_id && <span className="domain">{t.domain_id}</span>}
                </div>
                <div className="g-track">{bar(t, p.dark)}</div>
              </div>
            ))}
          </Fragment>
        ))}
        {anchors.map(([k, l]) => settings.anchors[k] && (
          <div key={k} className="g-anchor" style={{ left: LBL + x(settings.anchors[k]) }} title={`${l} ${fmtShort(settings.anchors[k])}`} />
        ))}
        {today >= start && <div className="g-today" style={{ left: LBL + x(today) }} title={`Today ${fmtShort(today)}`} />}
      </div>
    </div>
  );
}

export default function Schedule() {
  const { meta } = useToolkit();
  const { user, can } = useAuth();
  const tasks = useApi('/toolkit/tasks');
  const settings = useApi('/toolkit/settings');
  const [view, setView] = useState('gantt');
  const [phase, setPhase] = useState('');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [err, setErr] = useState(null);

  const computed = useMemo(() => computeTasks(settings.data, tasks.data || []), [settings.data, tasks.data]);
  if (tasks.error || settings.error) return <ErrorNote error={tasks.error || settings.error} />;
  if (!tasks.data || !settings.data) return <Loading />;

  let list = computed;
  if (phase) list = list.filter((t) => t.phase === phase);
  if (mine) list = list.filter((t) => user.domains.includes(t.domain_id));
  if (status) list = list.filter((t) => (status === 'open' ? !['Complete', ''].includes(t.status) && t.type !== 'Blackout' : t.status === status));
  if (search.trim()) { const s = search.toLowerCase(); list = list.filter((t) => `${t.code} ${t.name} ${t.owner} ${t.notes}`.toLowerCase().includes(s)); }
  const spans = phaseSpans(list, meta.phases).map((p) => ({ ...p, ...(phaseSpans(computed, meta.phases).find((x) => x.code === p.code) || {}), tasks: p.tasks }));
  const reload = () => { setOpen(null); tasks.reload(); };
  const setStat = async (t, s) => {
    try { await api(`/toolkit/tasks/${t.id}`, { method: 'PUT', body: { status: s } }); tasks.reload(); setErr(null); } catch (e) { setErr(e); }
  };
  const done = computed.filter((t) => ['Task', 'Milestone'].includes(t.type) && t.status === 'Complete').length;
  const total = computed.filter((t) => ['Task', 'Milestone'].includes(t.type)).length;

  return (
    <section className="sheet">
      <SheetHead title="Master schedule"
        actions={<>
          <div className="tabs" role="tablist" style={{ margin: 0, border: '2px solid var(--ink)' }}>
            {[['gantt', 'Gantt'], ['table', 'Table']].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l}</button>)}
          </div>
          {can('schedule', 'add') && <button className="btn primary" onClick={() => setOpen({ anchor: 'BRD', phase: phase || meta.phases[0].code })}>Add item</button>}
        </>}>
        Pre-work plus the AWB SOW phases to Go-Live and hypercare. Dates are computed from the anchors on Key dates — move an anchor and everything tied to it moves.
        {' '}<b>{done}</b> of {total} tasks and milestones complete.
      </SheetHead>
      <div className="toolbar">
        <input type="search" placeholder="Search tasks, owners, notes" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Phase"><option value="">All phases</option>{meta.phases.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option><option value="open">Not complete</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        {user.domains.length > 0 && <label className="row small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My domain only</label>}
        {view === 'gantt' && <><button className="btn sm ghost" onClick={() => setCollapsed(Object.fromEntries(meta.phases.map((p) => [p.code, true])))}>Collapse all</button><button className="btn sm ghost" onClick={() => setCollapsed({})}>Expand all</button></>}
      </div>
      <ErrorNote error={err} />
      {view === 'gantt' ? (
        <>
          <Gantt settings={settings.data} phases={spans} tasks={list} onOpen={setOpen} collapsed={collapsed} toggle={(c) => setCollapsed((x) => ({ ...x, [c]: !x[c] }))} />
          <div className="legend">
            <span><i className="g-ms" style={{ position: 'static', display: 'inline-block', transform: 'rotate(45deg) scale(.7)' }} /> Milestone / gate</span>
            <span><i style={{ display: 'inline-block', width: 3, height: 16, background: 'var(--bad)' }} /> Today</span>
            <span><i style={{ display: 'inline-block', width: 0, height: 16, borderLeft: '2px dashed var(--ink)' }} /> Anchor (Pre-work · BRD · Go-Live)</span>
            <span><i className="g-bar done" style={{ position: 'static', display: 'inline-block', width: 26, '--pc': '#1F4E79' }} /> Complete</span>
            <span><i className="g-bar blk" style={{ position: 'static', display: 'inline-block', width: 26 }} /> Blackout</span>
            {meta.phases.map((p) => <span key={p.code}><i className="swatch" style={{ '--c': p.dark }} />{p.code}</span>)}
          </div>
        </>
      ) : (
        <div className="tablewrap" style={{ maxHeight: '75vh' }}>
          <table className="t" style={{ minWidth: 1200 }}>
            <thead><tr><th>ID</th><th>Task / milestone</th><th>Owner</th><th>Domain</th><th>Start</th><th>End</th><th>Wks</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {spans.filter((p) => p.tasks.length).map((p) => (
                <Fragment key={p.code}>
                  <tr className="grp" style={{ '--c': p.dark }}><td colSpan={9}>{p.label} · {fmtShort(p.start)} → {fmtShort(p.end)}</td></tr>
                  {p.tasks.map((t) => {
                    const ed = can('schedule', 'edit', { domain: t.domain_id });
                    return (
                      <tr key={t.id}>
                        <td className="ref">{t.code}</td>
                        <td className="w-lg"><button type="button" onClick={() => setOpen(t)} style={{ all: 'unset', cursor: 'pointer', fontWeight: t.type === 'Milestone' ? 700 : 500, textDecoration: 'underline' }}>{t.name}</button>{t.comment_count ? <span className="small"> · {t.comment_count} comments</span> : ''}</td>
                        <td>{t.owner}</td>
                        <td><DomainTag id={t.domain_id} user={user} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(t.start)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{t.type === 'Milestone' ? '◆' : fmtShort(t.end)}</td>
                        <td>{t.weeks || ''}</td>
                        <td>{t.type === 'Blackout' ? <span className="badge bad">Blackout</span> : ed ? (
                          <select value={t.status} onChange={(e) => setStat(t, e.target.value)} aria-label={`Status of ${t.code}`} style={{ minWidth: 120 }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                        ) : <Badge v={t.status} />}</td>
                        <td className="w-lg small">{t.notes}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <TaskModal task={open} meta={meta} settings={settings.data} onClose={() => setOpen(null)} onSaved={reload} />}
    </section>
  );
}
