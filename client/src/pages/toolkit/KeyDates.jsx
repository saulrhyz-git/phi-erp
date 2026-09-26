import { useEffect, useMemo, useState } from 'react';
import { api, fmtDateTime } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useApi } from '../../hooks.js';
import { ErrorNote, Loading, SheetHead } from '../../components/ui.jsx';
import { addDays, computeTasks, daysBetween, fmtD, todayYmd } from '../../schedule.js';

const ANCHORS = [
  ['PRE', 'Pre-work start', 'Anchors Phase 0 and the three pre-BRD phases.'],
  ['BRD', 'BRD kickoff with AWB', 'Anchors AWB Phases 1–5.'],
  ['GL', 'Go-Live', 'Anchors Go/No-Go, cutover, training, parallel run and hypercare.'],
];

export default function KeyDates() {
  const { can } = useAuth();
  const settings = useApi('/toolkit/settings');
  const tasks = useApi('/toolkit/tasks');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const editable = can('key_dates', 'edit');
  useEffect(() => { if (settings.data) setF(JSON.parse(JSON.stringify(settings.data))); }, [settings.data]);

  const computed = useMemo(() => (f && tasks.data ? computeTasks(f, tasks.data) : []), [f, tasks.data]);
  if (settings.error || tasks.error) return <ErrorNote error={settings.error || tasks.error} />;
  if (!f || !tasks.data) return <Loading />;

  const byCode = Object.fromEntries(computed.map((t) => [t.code, t]));
  const moved = settings.data && ANCHORS.some(([k]) => settings.data.anchors[k] !== f.anchors[k]);
  const counts = Object.fromEntries(ANCHORS.map(([k]) => [k, tasks.data.filter((t) => t.anchor === k).length]));
  const weeks = Math.round((daysBetween(f.anchors.BRD, f.anchors.GL) / 7) * 10) / 10;
  const stretch = Math.round((weeks - f.awb_baseline_weeks) * 10) / 10;
  const buffer = byCode['M-GNG'] && byCode['M-UAT'] ? daysBetween(byCode['M-UAT'].start, byCode['M-GNG'].start) : null;
  const toBrd = daysBetween(todayYmd(), f.anchors.BRD);
  const setA = (k, v) => setF({ ...f, anchors: { ...f.anchors, [k]: v } });

  const save = async () => {
    try {
      const body = { ...f, hypercare_days: Number(f.hypercare_days), awb_baseline_weeks: Number(f.awb_baseline_weeks) };
      delete body.updated_at;
      await api('/toolkit/settings', { method: 'PUT', body });
      setMsg({ type: 'ok', text: 'Saved. The schedule and milestones now use these dates.' });
      settings.reload();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  return (
    <section className="sheet">
      <SheetHead title="Key dates & schedule controls"
        actions={editable && <><button className="btn ghost" onClick={() => { setF(JSON.parse(JSON.stringify(settings.data))); setMsg(null); }} disabled={!moved}>Undo changes</button><button className="btn primary" onClick={save}>Save</button></>}>
        Every schedule date is computed from these three anchors. Move one and every task tied to it moves with it; the checks below update as you type, before you save.
        {settings.data.updated_at && <> Last changed {fmtDateTime(settings.data.updated_at)}.</>}
      </SheetHead>
      {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
      {!editable && <div className="notice">Read-only for your role. Only the Project Manager changes the anchors.</div>}
      {moved && <div className="notice">Unsaved change: tasks anchored to the moved date(s) will shift when you save. Record why in the Decision log.</div>}

      <div className="tablewrap" style={{ marginBottom: 20 }}>
        <table className="t">
          <thead><tr><th>Anchor</th><th>Date</th><th>Items tied to it</th><th>What it drives</th></tr></thead>
          <tbody>
            {ANCHORS.map(([k, l, d]) => (
              <tr key={k}>
                <td><b>{l}</b> <span className="mono">[{k}]</span></td>
                <td style={{ minWidth: 200 }}>{editable ? <input type="date" value={f.anchors[k]} onChange={(e) => setA(k, e.target.value)} aria-label={l} /> : <b>{fmtD(f.anchors[k])}</b>}
                  {editable && <div className="small">{fmtD(f.anchors[k])}</div>}</td>
                <td>{counts[k]}</td>
                <td className="w-lg">{d}{f.anchor_notes?.[k] && <div className="small">{f.anchor_notes[k]}</div>}</td>
              </tr>
            ))}
            {[
              ['hypercare_days', 'Hypercare length (days)', 'AWB SOW S343096: 90 days after go-live.', 'number'],
              ['awb_baseline_weeks', 'AWB SOW baseline: weeks to go-live', 'AWB SOW S343096: 20 weeks from BRD kickoff.', 'number'],
              ['gantt_start', 'Gantt starts (a Monday)', 'First week shown on the Gantt.', 'date'],
              ['gantt_end', 'Gantt ends', 'Last week shown on the Gantt.', 'date'],
            ].map(([k, l, d, type]) => (
              <tr key={k}>
                <td><b>{l}</b></td>
                <td>{editable ? <input type={type === 'date' ? 'date' : 'text'} inputMode={type === 'number' ? 'numeric' : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={l} /> : <b>{type === 'date' ? fmtD(f[k]) : f[k]}</b>}</td>
                <td />
                <td className="w-lg">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Schedule checks</h3>
      <div className="kpis">
        <div><b>{weeks} wk</b><span>BRD kickoff → Go-Live</span></div>
        <div className={stretch > 0 ? 'warnbox' : undefined}><b>{stretch > 0 ? '+' : ''}{stretch} wk</b><span>vs AWB {f.awb_baseline_weeks}-week baseline — must be agreed with AWB</span></div>
        <div><b>{fmtD(addDays(f.anchors.BRD, f.awb_baseline_weeks * 7 - 3))}</b><span>Go-Live if AWB's SOW pace were kept</span></div>
        <div><b>{fmtD(addDays(f.anchors.GL, Number(f.hypercare_days) - 1))}</b><span>Hypercare ends</span></div>
        <div className={buffer !== null && buffer < 10 ? 'badbox' : undefined}><b>{buffer ?? '—'} days</b><span>Buffer: UAT sign-off → Go/No-Go (keep ≥ 10)</span></div>
        <div><b>{toBrd}</b><span>Days from today to BRD kickoff</span></div>
      </div>
      {buffer !== null && buffer < 10 && <div className="notice error">The buffer before Go/No-Go is under 10 days. If BRD slipped, either move Go-Live or shorten earlier phases — don't squeeze UAT.</div>}
    </section>
  );
}
