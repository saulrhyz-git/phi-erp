import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks.js';
import { fmtPHP } from '../api.js';
import { ErrorNote, Loading, SheetHead } from '../components/ui.jsx';

export const IMPACT_COLOR = {
  'Adoption only — configure as scoped': 'ok', 'Design change within existing SOW item': 'info', 'Extends SOW scope': 'bad',
  'Depends on Appendix A/B gap item': 'warn', 'PHI internal — no AWB effort': 'ink-3',
};
const WAVES = ['Wave 0 – Now (before BRD)', 'Wave 1 – Odoo build (2027 rollout)', 'Wave 2 – After go-live'];
const DECISIONS = ['Accept', 'Accept with changes', 'Needs discussion', 'Defer', 'Reject'];

export default function ReEngineering() {
  const { data, error, loading } = useApi('/reengineering');
  const sow = useApi('/sow/overview');
  const [wave, setWave] = useState('');
  const [impact, setImpact] = useState('');
  const [decision, setDecision] = useState('');
  const [qText, setQ] = useState('');
  const rows = useMemo(() => (data || []).filter((r) =>
    (!wave || r.wave === wave) && (!impact || r.impact_type === impact) &&
    (!decision || (decision === 'none' ? !r.phi_decision : r.phi_decision === decision)) &&
    (!qText || `${r.id} ${r.title} ${r.process_refs} ${r.current_process} ${r.proposed}`.toLowerCase().includes(qText.toLowerCase()))), [data, wave, impact, decision, qText]);

  if (loading && !data) return <div className="sheet"><Loading /></div>;
  if (error) return <div className="sheet"><ErrorNote error={error} /></div>;
  const sum = (k) => data.reduce((a, r) => a + Number(r[k] || 0), 0);
  const lo = sum('effort_low'), hi = sum('effort_high'), olo = sum('offset_low'), ohi = sum('offset_high');
  const netLo = Math.max(0, lo - ohi), netHi = Math.max(0, hi - olo);
  const base = Number(sow.data?.meta?.base_rate || 10000), flex = Number(sow.data?.meta?.flex_rate || 12000);
  const accepted = data.filter((r) => r.phi_decision.startsWith('Accept')).length;
  const undecided = data.filter((r) => !r.phi_decision).length;
  const manualBefore = sum('manual_before'), autoAfter = sum('auto_after'), stepsAfter = sum('steps_after');

  return (
    <section className="sheet">
      <SheetHead code="S-6" title="Re-engineering opportunities" actions={<a className="btn" href="/api/export/xlsx">Export Excel</a>}>
        Group CIO challenge to PHI: faster processing, clearer accountability and better reporting, with controls kept or strengthened. Each opportunity shows the current and proposed process side by side, why, and its effect on the AWB SOW.
      </SheetHead>
      <div className="stats">
        <div className="stat"><b>{accepted}/{data.length}</b><span>Accepted by PHI · {undecided} awaiting decision</span></div>
        <div className="stat"><b>{manualBefore} → {autoAfter}</b><span>Manual steps before → automated or system-enforced after ({stepsAfter ? Math.round((autoAfter / stepsAfter) * 100) : 0}% of new steps)</span></div>
        <div className="stat"><b>{netLo.toFixed(0)}–{netHi.toFixed(0)} md</b><span>Net extra AWB effort after offsets (indicative)</span></div>
        <div className="stat"><b className="money" style={{ fontSize: '1.3rem' }}>{fmtPHP(netHi * base)}</b><span>High estimate at base rate · {fmtPHP(netHi * flex)} if raised as change requests</span></div>
      </div>
      <div className="toolbar">
        <input type="search" placeholder="Search opportunities…" value={qText} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={wave} onChange={(e) => setWave(e.target.value)} aria-label="Wave"><option value="">All waves</option>{WAVES.map((w) => <option key={w}>{w}</option>)}</select>
        <select value={impact} onChange={(e) => setImpact(e.target.value)} aria-label="SOW impact"><option value="">Any SOW impact</option>{Object.keys(IMPACT_COLOR).map((w) => <option key={w}>{w}</option>)}</select>
        <select value={decision} onChange={(e) => setDecision(e.target.value)} aria-label="Decision"><option value="">Any decision</option><option value="none">Not decided</option>{DECISIONS.map((w) => <option key={w}>{w}</option>)}</select>
        <span className="muted small">{rows.length} shown</span>
      </div>
      <div className="tablewrap">
        <table className="t" style={{ minWidth: 1150 }}>
          <thead><tr><th>ID</th><th>Opportunity</th><th>Process</th><th>Wave</th><th>Benefit</th><th>Impact on AWB SOW</th><th>Steps</th><th>Extra effort</th><th>PHI decision</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="ref"><Link to={`/reengineering/${r.id}`}>{r.id}</Link></td>
                <td className="w-md"><Link to={`/reengineering/${r.id}`}><b>{r.title}</b></Link>{r.comment_count > 0 && <div className="small muted">{r.comment_count} comment(s)</div>}</td>
                <td>{r.process_refs}</td>
                <td className="small">{r.wave.replace(/ \(.+\)/, '')}{r.continues && <div className="muted">→ {r.continues}</div>}</td>
                <td className="small">{r.benefits}</td>
                <td><span className="impact" style={{ '--c': `var(--${IMPACT_COLOR[r.impact_type]})` }}>{r.impact_type.split(' — ')[0]}</span>{r.appendix_ref && r.appendix_ref !== '—' && <div className="small muted">Appendix {r.appendix_ref}</div>}</td>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{r.manual_before} manual → {r.auto_after} auto</td>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{Number(r.effort_low)}–{Number(r.effort_high)} md{Number(r.offset_high) > 0 && <div style={{ color: 'var(--ok)' }}>offset up to {Number(r.offset_high)}</div>}</td>
                <td>{r.phi_decision ? <span className={`status ${r.phi_decision.startsWith('Accept') ? 'approved' : r.phi_decision === 'Reject' ? 'rework' : 'changes'}`}>{r.phi_decision}</span> : <span className="muted small">Not decided</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="empty">No opportunities match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">Effort figures are PHI's indicative estimates beyond what Appendix A already asks AWB to price — not vendor quotes.</p>
    </section>
  );
}
