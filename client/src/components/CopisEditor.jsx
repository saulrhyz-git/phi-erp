// Edit a process's COPIS item by item. Each row remembers its original text, so renaming an output
// carries every KPI that output proves over to the new wording (nothing comes unmapped by a rewording).
// Used on the process page and under each process on a KPI page.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { ErrorNote } from './ui.jsx';

export const COPIS_PARTS = [['customers', 'C', 'Customers'], ['outputs', 'O', 'Outputs'], ['steps', 'P', 'Process'], ['inputs', 'I', 'Inputs'], ['suppliers', 'S', 'Suppliers']];
let seq = 0;
const row = (text, orig = text) => ({ key: `r${(seq += 1)}`, text, orig });

/**
 * process:   { id, customers, outputs, steps, inputs, suppliers }
 * kpiOutputs: [{ kpi_id, outputs }] — every KPI mapped to this process and the outputs that prove it (for the tags)
 * proving:   optional { kpiId, outputs: [] } — on a KPI page: tick which outputs prove this KPI
 */
export default function CopisEditor({ process, kpiOutputs = [], proving, onCancel, onSaved }) {
  const [parts, setParts] = useState(() => Object.fromEntries(COPIS_PARTS.map(([k]) => [k, (process[k] || []).map((t) => row(t))])));
  const [proves, setProves] = useState(() => new Set(proving?.outputs || []));   // keyed by ORIGINAL text, or row key for new rows
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const setPart = (k, fn) => setParts((p) => ({ ...p, [k]: fn(p[k]) }));
  const edit = (k, i, text) => setPart(k, (rows) => rows.map((r, j) => (j === i ? { ...r, text } : r)));
  const remove = (k, i) => setPart(k, (rows) => rows.filter((_, j) => j !== i));
  const move = (k, i, d) => setPart(k, (rows) => { const a = [...rows]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const add = (k) => setPart(k, (rows) => [...rows, row('', null)]);
  const proveKey = (r) => r.orig ?? r.key;
  const toggle = (r) => setProves((s) => { const n = new Set(s); const k = proveKey(r); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const tagsFor = (r) => (r.orig ? kpiOutputs.filter((k) => (k.outputs || []).includes(r.orig) && k.kpi_id !== proving?.kpiId).map((k) => k.kpi_id) : []);

  const save = async () => {
    const clean = Object.fromEntries(COPIS_PARTS.map(([k]) => [k, parts[k].map((r) => ({ ...r, text: r.text.trim() })).filter((r) => r.text)]));
    const texts = clean.outputs.map((r) => r.text);
    if (new Set(texts).size !== texts.length) { setErr(new Error('Two outputs have the same wording — make each output distinct.')); return; }
    setBusy(true); setErr(null);
    try {
      const output_renames = clean.outputs.filter((r) => r.orig && r.orig !== r.text).map((r) => ({ from: r.orig, to: r.text }));
      await api(`/processes/${process.id}`, { method: 'PUT', body: { ...Object.fromEntries(COPIS_PARTS.map(([k]) => [k, clean[k].map((r) => r.text)])), output_renames } });
      if (proving) {
        const outputs = clean.outputs.filter((r) => proves.has(proveKey(r))).map((r) => r.text);
        await api(`/kpis/${proving.kpiId}/process/${process.id}`, { method: 'PUT', body: { outputs } });
      }
      onSaved?.();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="copis-edit">
      <ErrorNote error={err} />
      <div className="sgrid copis-edit-grid">
        {COPIS_PARTS.map(([k, letter, label]) => (
          <div key={k}>
            <h4><em>{letter}</em>{label}</h4>
            {parts[k].map((r, i) => {
              const tags = k === 'outputs' ? tagsFor(r) : [];
              return (
                <div key={r.key} className="copis-row">
                  <div className="copis-row-line">
                    {k === 'steps' && <span className="copis-n">{i + 1}.</span>}
                    <textarea rows={2} value={r.text} onChange={(e) => edit(k, i, e.target.value)} aria-label={`${label} ${i + 1}`} />
                    <span className="copis-tools">
                      <button type="button" className="icon-mini" onClick={() => move(k, i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={13} /></button>
                      <button type="button" className="icon-mini" onClick={() => move(k, i, 1)} disabled={i === parts[k].length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
                      <button type="button" className="icon-mini" onClick={() => remove(k, i)} aria-label={`Remove ${label} ${i + 1}`}><Trash2 size={13} /></button>
                    </span>
                  </div>
                  {k === 'outputs' && (proving || tags.length > 0 || (r.orig && r.orig !== r.text.trim())) && (
                    <div className="copis-row-meta">
                      {proving && <label className="kpi-out"><input type="checkbox" checked={proves.has(proveKey(r))} onChange={() => toggle(r)} /> proves {proving.kpiId}</label>}
                      {tags.map((t) => <span key={t} className="kpi-proves-tag" title={`Also proves ${t}`}>{t}</span>)}
                      {r.orig && r.orig !== r.text.trim() && (tags.length > 0 || proves.has(r.orig)) && <span className="small muted">renamed — its KPI links follow</span>}
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn sm ghost" onClick={() => add(k)}><Plus size={14} /> Add</button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="small muted">Renaming an output keeps every KPI it proves. Removing one removes it as proof. Hand-off steps, swimlanes and reports stay mapped to the process.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save COPIS'}</button>
      </div>
    </div>
  );
}
