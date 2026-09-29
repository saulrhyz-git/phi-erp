import { useMemo, useState } from 'react';

// Searchable multi-select checklist. options: [{ value, label, hint }]
export default function LinkPicker({ label, options, value, onChange, disabled, height = 180 }) {
  const [q, setQ] = useState('');
  const sel = new Set((value || []).map(String));
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? options.filter((o) => `${o.value} ${o.label} ${o.hint || ''}`.toLowerCase().includes(t)) : options;
    return [...list].sort((a, b) => Number(sel.has(String(b.value))) - Number(sel.has(String(a.value))));
  }, [q, options, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (v) => {
    const next = sel.has(String(v)) ? (value || []).filter((x) => String(x) !== String(v)) : [...(value || []), v];
    onChange(next);
  };
  return (
    <div className="linkpick">
      <div className="linkpick-head"><span>{label}</span><span className="muted">{sel.size} selected</span></div>
      <input type="search" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Filter ${label}`} disabled={disabled} />
      <div className="linkpick-list" style={{ maxHeight: height }}>
        {shown.map((o) => (
          <label key={o.value} className={sel.has(String(o.value)) ? 'on' : ''}>
            <input type="checkbox" checked={sel.has(String(o.value))} onChange={() => toggle(o.value)} disabled={disabled} />
            <span><b>{o.value}</b> {o.label}{o.hint && <small> · {o.hint}</small>}</span>
          </label>
        ))}
        {shown.length === 0 && <div className="muted small" style={{ padding: 6 }}>Nothing matches.</div>}
      </div>
    </div>
  );
}

export const toOptions = (opts) => ({
  diagrams: (opts?.diagrams || []).map((d) => ({ value: d.id, label: d.title })),
  reengineering: (opts?.reengineering || []).map((r) => ({ value: r.id, label: r.title })),
  sow_items: (opts?.sow_items || []).map((i) => ({ value: i.no, label: i.feature, hint: i.section })),
});
