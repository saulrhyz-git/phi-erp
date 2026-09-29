import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Trash2, Archive, RotateCcw } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useApi } from '../../hooks.js';
import { ErrorNote, Loading, Modal, SheetHead } from '../../components/ui.jsx';
import { useToolkit } from './common.jsx';

const TABS = [['registers', 'Registers'], ['phases', 'Schedule phases'], ['domains', 'Domains'], ['guide', 'Guide page']];
const TYPES = [['text', 'Short text'], ['textarea', 'Long text'], ['date', 'Date'], ['select', 'Pick-list']];
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const move = (arr, i, d) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };

function Saved({ msg }) { return msg ? <div className={`notice ${msg.type}`}>{msg.text}</div> : null; }

// ------------------------------------------------------------------ registers
function RegisterEditor({ reg, groups, usage, editable, onSaved }) {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMsg(null), [reg.key]);
  useEffect(() => {
    setF({
      label: reg.label, title: reg.title || reg.label, group: reg.group, description: reg.description || '',
      howTo: (reg.howTo || []).join('\n'), titleField: reg.titleField, codeField: reg.codeField || '', codePrefix: reg.codePrefix || '',
      columns: reg.columns.map((c) => ({ ...c, optionsText: (c.options || []).filter(Boolean).join('\n') })),
      forms: (reg.forms || []).map((x) => ({ ...x, fieldsText: x.fields.join('\n'), signText: x.signatories.join('\n') })),
    });
  }, [reg]);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setCol = (i, k, v) => setF({ ...f, columns: f.columns.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  const live = f.columns.filter((c) => !c.archived);
  const save = async (archived) => {
    setBusy(true);
    try {
      const body = {
        label: f.label, title: f.title, group: f.group, description: f.description, howTo: lines(f.howTo),
        titleField: f.titleField, codeField: f.codeField || null, codePrefix: f.codePrefix || null,
        columns: f.columns.map((c) => ({
          key: c.key || '', label: c.label, type: c.type, options: c.type === 'select' ? lines(c.optionsText) : undefined,
          detail: !!c.detail, wide: !!c.wide, badge: !!c.badge, status: !!c.status, archived: !!c.archived,
        })),
        ...(reg.special === 'signoffs' ? { forms: f.forms.map((x) => ({ title: x.title, fields: lines(x.fieldsText), statement: x.statement || '', signatories: lines(x.signText) })) } : {}),
        ...(archived !== undefined ? { archived } : {}),
      };
      await api(`/toolkit/config/registers/${reg.key}`, { method: 'PUT', body });
      setMsg({ type: 'ok', text: archived === true ? 'Register archived — hidden from the toolkit, records kept.' : archived === false ? 'Register restored.' : 'Saved. Everyone sees the change on their next page load.' });
      onSaved();
    } catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const dis = !editable;

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{reg.label}</h3>
        <span className="small muted">{usage || 0} records{reg.special ? ` · special: ${reg.special}` : ''}{reg.archived ? ' · archived' : ''}</span>
        <span style={{ flex: 1 }} />
        {editable && (reg.archived
          ? <button className="btn sm" onClick={() => save(false)} disabled={busy}><RotateCcw size={14} /> Restore register</button>
          : <button className="btn sm danger" onClick={() => { if (window.confirm(`Archive ${reg.label}? It disappears from the toolkit; its ${usage || 0} records are kept and come back if you restore it.`)) save(true); }} disabled={busy}><Archive size={14} /> Archive</button>)}
      </div>
      <Saved msg={msg} />
      <div className="grid2">
        <label className="field"><span>Menu name</span><input type="text" value={f.label} onChange={set('label')} disabled={dis} /></label>
        <label className="field"><span>Page title</span><input type="text" value={f.title} onChange={set('title')} disabled={dis} /></label>
        <label className="field"><span>Menu group</span>
          <input type="text" list="tk-groups" value={f.group} onChange={set('group')} disabled={dis} />
          <datalist id="tk-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
        <label className="field"><span>Record title column</span>
          <select value={f.titleField} onChange={set('titleField')} disabled={dis}>{live.map((c) => <option key={c.key || c.label} value={c.key}>{c.label}</option>)}</select></label>
        <label className="field"><span>Auto-numbered ID column (optional)</span>
          <select value={f.codeField} onChange={set('codeField')} disabled={dis}><option value="">None</option>{live.filter((c) => c.type === 'text' && c.key).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
        <label className="field"><span>ID prefix, e.g. R- or CR-</span><input type="text" value={f.codePrefix} onChange={set('codePrefix')} disabled={dis || !f.codeField} placeholder="R-" /></label>
        <label className="field" style={{ gridColumn: '1/-1' }}><span>Description (shown under the page title)</span><textarea value={f.description} onChange={set('description')} disabled={dis} style={{ minHeight: 60 }} /></label>
        <label className="field" style={{ gridColumn: '1/-1' }}><span>“How to use” notes — one per line</span><textarea value={f.howTo} onChange={set('howTo')} disabled={dis} style={{ minHeight: 70 }} /></label>
      </div>

      <h4 style={{ margin: '8px 0 8px' }}>Columns</h4>
      <p className="small muted" style={{ marginTop: 0 }}>Removing a column archives it: it disappears from forms and lists, and existing values are kept. Pick-list: one option per line. <b>Status</b> lets people with “Update status” change that column without full edit rights.</p>
      <div className="tablewrap">
        <table className="t cfg-cols">
          <thead><tr><th /><th>Label</th><th>Type</th><th>Pick-list options</th><th title="Show in the register list">In list</th><th>Wide</th><th>Badge</th><th>Status</th><th /></tr></thead>
          <tbody>
            {f.columns.map((c, i) => (
              <tr key={c.key || `new${i}`} style={{ opacity: c.archived ? 0.5 : 1 }}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm ghost" aria-label="Move up" disabled={dis || i === 0} onClick={() => setF({ ...f, columns: move(f.columns, i, -1) })}><ArrowUp size={14} /></button>
                  <button className="btn sm ghost" aria-label="Move down" disabled={dis || i === f.columns.length - 1} onClick={() => setF({ ...f, columns: move(f.columns, i, 1) })}><ArrowDown size={14} /></button>
                </td>
                <td style={{ minWidth: 170 }}><input type="text" value={c.label} onChange={(e) => setCol(i, 'label', e.target.value)} disabled={dis || c.archived} aria-label="Column label" />
                  <div className="small muted">{c.key ? `key: ${c.key}` : 'new column'}{c.archived ? ' · archived' : ''}</div></td>
                <td><select value={c.type} onChange={(e) => setCol(i, 'type', e.target.value)} disabled={dis || c.archived || (c.key && usage > 0 && c.type === 'select')} aria-label="Column type">{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td style={{ minWidth: 200 }}>{c.type === 'select'
                  ? <textarea value={c.optionsText} onChange={(e) => setCol(i, 'optionsText', e.target.value)} disabled={dis || c.archived} style={{ minHeight: 60 }} aria-label="Options, one per line" />
                  : <span className="muted small">—</span>}</td>
                <td><input type="checkbox" checked={!c.detail} onChange={(e) => setCol(i, 'detail', !e.target.checked)} disabled={dis || c.archived} aria-label="Show in list" /></td>
                <td><input type="checkbox" checked={!!c.wide} onChange={(e) => setCol(i, 'wide', e.target.checked)} disabled={dis || c.archived} aria-label="Wide" /></td>
                <td><input type="checkbox" checked={!!c.badge} onChange={(e) => setCol(i, 'badge', e.target.checked)} disabled={dis || c.archived || c.type !== 'select'} aria-label="Show as badge" /></td>
                <td><input type="checkbox" checked={!!c.status} onChange={(e) => setCol(i, 'status', e.target.checked)} disabled={dis || c.archived || c.type !== 'select'} aria-label="Status column" /></td>
                <td>{editable && (c.archived
                  ? <button className="btn sm ghost" onClick={() => setCol(i, 'archived', false)} title="Restore column"><RotateCcw size={14} /></button>
                  : c.key
                    ? <button className="btn sm ghost" onClick={() => setCol(i, 'archived', true)} disabled={c.key === f.titleField} title={c.key === f.titleField ? 'This is the record title column' : 'Archive column'}><Archive size={14} /></button>
                    : <button className="btn sm ghost" onClick={() => setF({ ...f, columns: f.columns.filter((_, j) => j !== i) })} title="Remove"><Trash2 size={14} /></button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setF({ ...f, columns: [...f.columns, { key: '', label: 'New column', type: 'text', optionsText: '' }] })}><Plus size={14} /> Add column</button>}

      {reg.special === 'signoffs' && (
        <>
          <h4 style={{ margin: '20px 0 8px' }}>Printable sign-off forms</h4>
          {f.forms.map((x, i) => (
            <div key={i} className="cfg-form">
              <div className="grid2">
                <label className="field" style={{ gridColumn: '1/-1' }}><span>Form title</span><input type="text" value={x.title} disabled={dis}
                  onChange={(e) => setF({ ...f, forms: f.forms.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)) })} /></label>
                <label className="field"><span>Fields — one per line</span><textarea value={x.fieldsText} disabled={dis}
                  onChange={(e) => setF({ ...f, forms: f.forms.map((y, j) => (j === i ? { ...y, fieldsText: e.target.value } : y)) })} /></label>
                <label className="field"><span>Signatories — one per line</span><textarea value={x.signText} disabled={dis}
                  onChange={(e) => setF({ ...f, forms: f.forms.map((y, j) => (j === i ? { ...y, signText: e.target.value } : y)) })} /></label>
                <label className="field" style={{ gridColumn: '1/-1' }}><span>Statement</span><textarea value={x.statement} disabled={dis} style={{ minHeight: 50 }}
                  onChange={(e) => setF({ ...f, forms: f.forms.map((y, j) => (j === i ? { ...y, statement: e.target.value } : y)) })} /></label>
              </div>
              {editable && <button className="btn sm danger" onClick={() => setF({ ...f, forms: f.forms.filter((_, j) => j !== i) })}><Trash2 size={14} /> Remove form</button>}
            </div>
          ))}
          {editable && <button className="btn sm" onClick={() => setF({ ...f, forms: [...f.forms, { title: 'FORM — New sign-off', fieldsText: 'Reference\nScope', signText: 'Process Owner\nProject Manager', statement: '' }] })}><Plus size={14} /> Add form</button>}
        </>
      )}
      {editable && <div className="cfg-save"><button className="btn primary" onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save register'}</button></div>}
    </div>
  );
}

function Registers({ data, editable, reload, reloadMeta }) {
  const [sel, setSel] = useState(data.registers[0]?.key);
  const [adding, setAdding] = useState(null);
  const [err, setErr] = useState(null);
  const regs = data.registers;
  const reg = regs.find((r) => r.key === sel) || regs[0];
  const done = () => { reload(); reloadMeta(); };
  const reorder = async (i, d) => {
    const keys = move(regs.map((r) => r.key), i, d);
    try { await api('/toolkit/config/registers/order', { method: 'POST', body: { keys } }); done(); } catch (e) { setErr(e); }
  };
  const create = async () => {
    try {
      const r = await api('/toolkit/config/registers', { method: 'POST', body: adding });
      setAdding(null); setSel(r.key); done();
    } catch (e) { setErr(e); }
  };
  return (
    <div className="cfg">
      <aside className="cfg-list">
        {editable && <button className="btn sm primary" style={{ width: '100%', marginBottom: 8 }} onClick={() => { setErr(null); setAdding({ label: '', group: data.groups[0] || 'Control', description: '', copyPermissionsFrom: 'raid' }); }}><Plus size={14} /> New register</button>}
        <ErrorNote error={err} />
        {regs.map((r, i) => (
          <div key={r.key} className={`cfg-item${r.key === reg?.key ? ' on' : ''}${r.archived ? ' arch' : ''}`}>
            <button type="button" className="cfg-pick" onClick={() => setSel(r.key)}>
              <b>{r.label}</b><small>{r.group}{r.archived ? ' · archived' : ''} · {data.usage.registers[r.key] || 0}</small>
            </button>
            {editable && <span className="cfg-move">
              <button className="btn sm ghost" aria-label={`Move ${r.label} up`} disabled={i === 0} onClick={() => reorder(i, -1)}><ArrowUp size={13} /></button>
              <button className="btn sm ghost" aria-label={`Move ${r.label} down`} disabled={i === regs.length - 1} onClick={() => reorder(i, 1)}><ArrowDown size={13} /></button>
            </span>}
          </div>
        ))}
      </aside>
      <div className="cfg-main">
        {reg && <RegisterEditor reg={reg} groups={data.groups} usage={data.usage.registers[reg.key]} editable={editable} onSaved={done} />}
      </div>
      <Modal open={!!adding} title="New register" onClose={() => setAdding(null)}
        footer={<><button className="btn ghost" onClick={() => setAdding(null)}>Cancel</button><button className="btn primary" onClick={create}>Create register</button></>}>
        {adding && (
          <>
            <ErrorNote error={err} />
            <label className="field"><span>Name</span><input type="text" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} placeholder="e.g. Vendor deliverables" /></label>
            <label className="field"><span>Menu group</span><input type="text" list="tk-groups-new" value={adding.group} onChange={(e) => setAdding({ ...adding, group: e.target.value })} />
              <datalist id="tk-groups-new">{data.groups.map((g) => <option key={g} value={g} />)}</datalist></label>
            <label className="field"><span>Description</span><textarea value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} /></label>
            <label className="field"><span>Give custom roles the same access as</span>
              <select value={adding.copyPermissionsFrom} onChange={(e) => setAdding({ ...adding, copyPermissionsFrom: e.target.value })}>
                {regs.filter((r) => !r.archived).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
            <p className="small muted">The register starts with Item, Details, Owner, Due and Status columns — change them after it's created.</p>
          </>
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ phases
function Phases({ data, editable, reload, reloadMeta }) {
  const [rows, setRows] = useState(data.phases);
  const [msg, setMsg] = useState(null);
  const existing = useMemo(() => new Set(data.phases.map((p) => p.code)), [data.phases]);
  useEffect(() => setRows(data.phases), [data.phases]);
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === 'dark' ? { custom: true } : {}) } : r)));
  const save = async () => {
    try {
      await api('/toolkit/config/phases', { method: 'PUT', body: { phases: rows.map(({ code, label, dark, light, custom }) => ({ code: code.trim().toUpperCase(), label, dark, ...(light ? { light } : {}), ...(custom ? { custom } : {}) })) } });
      setMsg({ type: 'ok', text: 'Phases saved.' }); reload(); reloadMeta();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };
  return (
    <>
      <p className="lede small">Phases group the master schedule and colour the Gantt. A phase that still has schedule items can't be removed. Changing a colour here replaces the theme colour for that phase.</p>
      <Saved msg={msg} />
      <div className="tablewrap">
        <table className="t">
          <thead><tr><th /><th>Code</th><th>Name</th><th>Colour</th><th>Schedule items</th><th /></tr></thead>
          <tbody>{rows.map((p, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sm ghost" aria-label="Move up" disabled={!editable || i === 0} onClick={() => setRows(move(rows, i, -1))}><ArrowUp size={14} /></button>
                <button className="btn sm ghost" aria-label="Move down" disabled={!editable || i === rows.length - 1} onClick={() => setRows(move(rows, i, 1))}><ArrowDown size={14} /></button>
              </td>
              <td style={{ width: 110 }}><input type="text" value={p.code} disabled={!editable || existing.has(p.code)} onChange={(e) => set(i, 'code', e.target.value.toUpperCase())} aria-label="Phase code" /></td>
              <td><input type="text" value={p.label} disabled={!editable} onChange={(e) => set(i, 'label', e.target.value)} aria-label="Phase name" /></td>
              <td style={{ whiteSpace: 'nowrap' }}><input type="color" value={p.dark} disabled={!editable} onChange={(e) => set(i, 'dark', e.target.value)} aria-label="Phase colour" className="cfg-color" />
                {p.custom && editable && <button className="btn sm ghost" onClick={() => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, custom: false } : r)))} title="Use the theme colour again">Reset</button>}</td>
              <td>{data.usage.phases[p.code] || 0}</td>
              <td>{editable && !data.usage.phases[p.code] && <button className="btn sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${p.code}`}><Trash2 size={14} /></button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {editable && <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => setRows([...rows, { code: '', label: '', dark: '#5B6B7F', custom: true }])}><Plus size={14} /> Add phase</button>
        <span style={{ flex: 1 }} /><button className="btn primary" onClick={save}>Save phases</button></div>}
    </>
  );
}

// ------------------------------------------------------------------ domains
function Domains({ data, editable, reload, reloadMeta }) {
  const [names, setNames] = useState({});
  const [add, setAdd] = useState({ id: '', name: '' });
  const [msg, setMsg] = useState(null);
  const run = async (fn, ok) => { try { await fn(); setMsg({ type: 'ok', text: ok }); reload(); reloadMeta(); } catch (e) { setMsg({ type: 'error', text: e.message }); } };
  return (
    <>
      <p className="lede small">Domains decide which toolkit records a domain-scoped user can change. A domain in use by records, schedule items or users can't be deleted.</p>
      <Saved msg={msg} />
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Code</th><th>Name</th><th>In use</th><th /></tr></thead>
        <tbody>{data.domains.map((d) => (
          <tr key={d.id}>
            <td className="ref">{d.id}</td>
            <td><input type="text" value={names[d.id] ?? d.name} disabled={!editable} onChange={(e) => setNames({ ...names, [d.id]: e.target.value })} aria-label={`Name of ${d.id}`} /></td>
            <td>{data.usage.domains[d.id] || 0}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{editable && <>
              <button className="btn sm" disabled={(names[d.id] ?? d.name) === d.name} onClick={() => run(() => api(`/toolkit/config/domains/${d.id}`, { method: 'PUT', body: { name: names[d.id] } }), 'Domain renamed.')}>Save</button>{' '}
              <button className="btn sm ghost" disabled={!!data.usage.domains[d.id]} onClick={() => window.confirm(`Delete domain ${d.id}?`) && run(() => api(`/toolkit/config/domains/${d.id}`, { method: 'DELETE' }), 'Domain deleted.')} aria-label={`Delete ${d.id}`}><Trash2 size={14} /></button>
            </>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {editable && (
        <div className="row" style={{ marginTop: 12 }}>
          <input type="text" placeholder="Code, e.g. HR" value={add.id} onChange={(e) => setAdd({ ...add, id: e.target.value.toUpperCase() })} style={{ width: 150 }} aria-label="New domain code" />
          <input type="text" placeholder="Name, e.g. Human Resources" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} style={{ width: 320 }} aria-label="New domain name" />
          <button className="btn" onClick={() => run(async () => { await api('/toolkit/config/domains', { method: 'POST', body: add }); setAdd({ id: '', name: '' }); }, 'Domain added.')}><Plus size={14} /> Add domain</button>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ guide
function Guide({ data, editable, reload, reloadMeta }) {
  const g = data.guide;
  const [f, setF] = useState({ ...g, rules: g.rules.join('\n'), confirm: g.confirm.join('\n'), folders: g.folders.join('\n') });
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      await api('/toolkit/config/guide', { method: 'PUT', body: { intro: f.intro, rules: lines(f.rules), confirm: lines(f.confirm), schedule_note: f.schedule_note, folders: lines(f.folders), naming: f.naming } });
      setMsg({ type: 'ok', text: 'Guide saved.' }); reload(); reloadMeta();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };
  const p = (k) => ({ value: f[k], onChange: set(k), disabled: !editable });
  return (
    <>
      <p className="lede small">Text on the toolkit's Guide & status page. Lists take one item per line.</p>
      <Saved msg={msg} />
      <label className="field"><span>Introduction</span><textarea {...p('intro')} style={{ minHeight: 60 }} /></label>
      <div className="grid2">
        <label className="field"><span>The rules</span><textarea {...p('rules')} style={{ minHeight: 120 }} /></label>
        <label className="field"><span>Must confirm with AWB / management</span><textarea {...p('confirm')} style={{ minHeight: 120 }} /></label>
        <label className="field"><span>Project folders</span><textarea {...p('folders')} style={{ minHeight: 160 }} /></label>
        <label className="field"><span>How the schedule was built</span><textarea {...p('schedule_note')} style={{ minHeight: 160 }} /></label>
      </div>
      <label className="field"><span>File naming convention</span><textarea {...p('naming')} style={{ minHeight: 60 }} /></label>
      {editable && <div className="cfg-save"><button className="btn primary" onClick={save}>Save guide</button></div>}
    </>
  );
}

export default function ToolkitConfig() {
  const { can } = useAuth();
  const { reloadMeta } = useToolkit();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'registers';
  const { data, error, loading, reload } = useApi('/toolkit/config');
  const editable = can('toolkit_config', 'edit');
  const Tab = { registers: Registers, phases: Phases, domains: Domains, guide: Guide }[tab] || Registers;
  return (
    <section className="sheet">
      <SheetHead code="Toolkit" title="Configure toolkit">
        Change the toolkit without code: registers and their columns and pick-lists, schedule phases, domains and the guide page. Every change is recorded in the audit log.
        {!editable && ' Your role can view this configuration but not change it.'}
      </SheetHead>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : data && <Tab data={data} editable={editable} reload={reload} reloadMeta={reloadMeta} />}
    </section>
  );
}
