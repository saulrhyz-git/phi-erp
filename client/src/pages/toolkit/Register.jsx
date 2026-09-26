import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtDateTime } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useApi } from '../../hooks.js';
import { Comments, ErrorNote, Loading, Modal, SheetHead } from '../../components/ui.jsx';
import { computeTasks, daysBetween, fmtShort, todayYmd } from '../../schedule.js';
import { Badge, DomainTag, allowedDomains, useToolkit } from './common.jsx';

function Field({ col, value, onChange, disabled }) {
  const p = { value: value ?? '', disabled, onChange: (e) => onChange(e.target.value), 'aria-label': col.label };
  if (col.type === 'textarea') return <textarea {...p} />;
  if (col.type === 'select') return <select {...p}>{col.options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}</select>;
  if (col.type === 'date') return <input type="date" {...p} />;
  return <input type="text" {...p} />;
}

function Cell({ col, v }) {
  if (col.badge || col.short) return <Badge v={v} />;
  if (col.type === 'date') return <span style={{ whiteSpace: 'nowrap' }}>{fmtShort(v)}</span>;
  if (!v) return <span className="muted">—</span>;
  return <div className="cellclip">{v}</div>;
}

function download(name, rows) {
  const esc = (s) => { const t = String(s ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function PrintableForms({ forms }) {
  const print = () => { document.body.classList.add('print-forms'); window.print(); setTimeout(() => document.body.classList.remove('print-forms'), 500); };
  return (
    <section style={{ marginTop: 28 }}>
      <div className="row noprint"><h3 style={{ margin: 0 }}>Blank forms</h3><span style={{ flex: 1 }} /><button className="btn" onClick={print}>Print blank forms</button></div>
      <p className="lede small noprint">Print, collect signatures, scan the signed copy into Documents, then log it above.</p>
      {forms.map((f) => (
        <div className="form-print" key={f.title}>
          <header>{f.title}</header>
          <table><tbody>{f.fields.map((x) => <tr key={x}><td className="lab">{x}</td><td className="blank" /></tr>)}</tbody></table>
          <p>{f.statement}</p>
          <table>
            <thead><tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr></thead>
            <tbody>{f.signatories.map((s) => <tr key={s}><td>{s}</td><td className="blank" /><td className="blank" /><td className="blank" /></tr>)}</tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

export default function Register() {
  const { register } = useParams();
  const key = register.replace(/-/g, '_');
  const { meta, reloadSummary } = useToolkit();
  const { user, can, level } = useAuth();
  const reg = meta.registers.find((r) => r.key === key);
  const allowed = reg && can(key);
  const { data, error, loading, reload } = useApi(allowed ? `/toolkit/r/${key}` : null);
  const isMs = reg?.special === 'milestones';
  const tasks = useApi(isMs ? '/toolkit/tasks' : null);
  const settings = useApi(isMs ? '/toolkit/settings' : null);
  const [search, setSearch] = useState('');
  const [dom, setDom] = useState('');
  const [open, setOpen] = useState(null);    // { rec, form, domain, mode: 'new'|'edit'|'view' }
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const taskByCode = useMemo(() => {
    if (!isMs || !tasks.data || !settings.data) return {};
    return Object.fromEntries(computeTasks(settings.data, tasks.data).map((t) => [t.code, t]));
  }, [isMs, tasks.data, settings.data]);

  if (!reg) return <div className="sheet"><h2>Register not found</h2></div>;
  if (!allowed) return <div className="sheet"><h2>{reg.label}</h2><p className="lede">Your role doesn't include this register.</p></div>;

  const listCols = reg.columns.filter((c) => !c.detail);
  const addLevel = level(key, 'add');
  const canAddAny = can(key, 'add');
  const canEdit = (r) => can(key, 'edit', { domain: r.domain_id });
  const canDel = (r) => can(key, 'delete', { domain: r.domain_id });
  const today = todayYmd();

  let rows = (data || []).map((r) => ({ ...r, task: isMs ? taskByCode[r.data.task_code] : null }));
  if (isMs) rows.sort((a, b) => (a.task?.start || '9').localeCompare(b.task?.start || '9'));
  if (dom === 'mine') rows = rows.filter((r) => user.domains.includes(r.domain_id));
  else if (dom === 'project') rows = rows.filter((r) => !r.domain_id);
  else if (dom) rows = rows.filter((r) => r.domain_id === dom);
  if (search.trim()) {
    const s = search.toLowerCase();
    rows = rows.filter((r) => Object.values(r.data).some((v) => String(v).toLowerCase().includes(s)) || (r.task?.name || '').toLowerCase().includes(s));
  }

  const blank = () => Object.fromEntries(reg.columns.map((c) => [c.key, '']));
  const startNew = (prefill) => {
    const opts = allowedDomains(user, addLevel, meta.domains);
    setErr(null);
    setOpen({ mode: 'new', form: { ...blank(), ...(prefill || {}) }, domain: addLevel === 'own' ? (opts[0]?.id ?? '') : '' });
  };
  const startOpen = (r) => { setErr(null); setOpen({ mode: canEdit(r) ? 'edit' : 'view', rec: r, form: { ...blank(), ...r.data }, domain: r.domain_id || '' }); };
  const save = async () => {
    setBusy(true);
    try {
      const body = { data: open.form, domain_id: open.domain || null };
      if (open.mode === 'new') await api(`/toolkit/r/${key}`, { method: 'POST', body });
      else await api(`/toolkit/r/${key}/${open.rec.id}`, { method: 'PUT', body });
      setOpen(null); reload(); reloadSummary();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const del = async (r) => {
    const title = r.data[reg.titleField] || `#${r.id}`;
    if (!window.confirm(`Delete "${String(title).slice(0, 80)}"? The deletion is recorded in the audit log.`)) return;
    try { await api(`/toolkit/r/${key}/${r.id}`, { method: 'DELETE' }); setOpen(null); reload(); reloadSummary(); } catch (e) { alert(e.message); }
  };
  const exportCsv = () => {
    const head = ['Domain', ...(isMs ? ['Milestone', 'Planned date'] : []), ...reg.columns.map((c) => c.label), 'Last updated', 'Updated by'];
    const body = rows.map((r) => [r.domain_id || 'Project', ...(isMs ? [r.task?.name || '', r.task?.start || ''] : []), ...reg.columns.map((c) => r.data[c.key]), r.updated_at, r.updated_by_name]);
    download(`PHI_${reg.key}_${today}.csv`, [head, ...body]);
  };

  const editable = open && open.mode !== 'view';
  const domainOptions = open ? allowedDomains(user, level(key, open.mode === 'new' ? 'add' : 'edit'), meta.domains) : [];
  const setF = (k, v) => setOpen((o) => ({ ...o, form: { ...o.form, [k]: v } }));

  return (
    <section className="sheet">
      <SheetHead title={reg.title}
        actions={<>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
          {canAddAny && <button className="btn primary" onClick={() => startNew()}>Add</button>}
        </>}>
        {reg.description}
      </SheetHead>
      {reg.howTo?.length > 0 && <div className="howto noprint"><b>HOW TO USE</b><ul>{reg.howTo.map((h) => <li key={h}>{h}</li>)}</ul></div>}
      <div className="toolbar noprint">
        <input type="search" placeholder="Search this register" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={dom} onChange={(e) => setDom(e.target.value)} aria-label="Domain">
          <option value="">All domains</option>
          {user.domains.length > 0 && <option value="mine">My domain{user.domains.length > 1 ? 's' : ''}</option>}
          <option value="project">Project-wide</option>
          {meta.domains.map((d) => <option key={d.id} value={d.id}>{d.id} — {d.name}</option>)}
        </select>
        <span className="small"><b>{rows.length}</b> of {data?.length ?? 0}</span>
        {level(key, 'edit') === 'own' && <span className="lock">You can change records tagged {user.domains.join(', ') || '(no domain assigned — ask the PM)'}</span>}
        {level(key, 'edit') === 'none' && <span className="lock">Read-only for your role</span>}
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        <div className="tablewrap reg-table">
          <table className="t" style={{ minWidth: Math.max(760, listCols.length * 130) }}>
            <thead><tr>
              <th>Domain</th>
              {isMs && <><th>Milestone / gate</th><th>Planned</th><th>Days</th></>}
              {listCols.map((c) => <th key={c.key}>{c.label}</th>)}
              <th />
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={listCols.length + (isMs ? 5 : 2)} className="empty">Nothing here yet{canAddAny ? ' — use Add to create the first record.' : '.'}</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><DomainTag id={r.domain_id} user={user} /></td>
                  {isMs && <>
                    <td className="w-md"><b>{r.task?.name?.replace(/^(MILESTONE|GATE): /, '') || r.data.task_code}</b>{r.task?.name?.startsWith('GATE') && <div><span className="badge warn">GATE</span></div>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(r.task?.start)}</td>
                    <td>{r.task ? daysBetween(today, r.task.start) : ''}</td>
                  </>}
                  {listCols.map((c) => <td key={c.key} className={c.wide ? 'wide' : undefined}><Cell col={c} v={r.data[c.key]} /></td>)}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => startOpen(r)}>{canEdit(r) ? 'Edit' : 'Open'}{r.comment_count ? ` (${r.comment_count})` : ''}</button>{' '}
                    {key === 'status_reports' && canAddAny && <button className="btn sm ghost" onClick={() => startNew({ ...r.data, week_ending: '' })}>Duplicate</button>}{' '}
                    {canDel(r) && <button className="btn sm danger" onClick={() => del(r)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reg.special === 'signoffs' && <PrintableForms forms={reg.forms} />}

      <Modal wide open={!!open} onClose={() => setOpen(null)}
        title={open ? `${open.mode === 'new' ? 'Add to' : open.mode === 'edit' ? 'Edit' : 'View'} ${reg.label}${open.rec && reg.codeField ? ` — ${open.rec.data[reg.codeField]}` : ''}` : ''}
        footer={<>
          {open?.rec && canDel(open.rec) && <button className="btn danger" onClick={() => del(open.rec)}>Delete</button>}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={() => setOpen(null)}>{editable ? 'Cancel' : 'Close'}</button>
          {editable && <button className="btn primary" onClick={save} disabled={busy}>{open.mode === 'new' ? 'Add record' : 'Save changes'}</button>}
        </>}>
        {open && (
          <>
            <ErrorNote error={err} />
            {open.mode === 'view' && <div className="notice">Read-only: {open.rec.domain_id ? `this record belongs to ${open.rec.domain_id}` : 'this is a project-wide record'} and your role can't change it.</div>}
            <label className="field"><span>Domain</span>
              {editable ? (
                <select value={open.domain} onChange={(e) => setOpen({ ...open, domain: e.target.value })}>
                  {domainOptions.map((d) => <option key={d.id} value={d.id}>{d.id ? `${d.id} — ${d.name}` : d.name}</option>)}
                </select>
              ) : <div><DomainTag id={open.domain} user={user} /></div>}
            </label>
            {isMs && open.rec?.task && <p className="small"><b>{open.rec.task.name}</b> · planned {fmtShort(open.rec.task.start)} (from the master schedule)</p>}
            <div className="grid2">
              {reg.columns.map((c) => (
                <label key={c.key} className="field" style={c.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                  <span>{c.label}{reg.codeField === c.key && reg.codePrefix && open.mode === 'new' ? ' (leave blank to number automatically)' : ''}</span>
                  <Field col={c} value={open.form[c.key]} onChange={(v) => setF(c.key, v)} disabled={!editable} />
                </label>
              ))}
            </div>
            {open.rec && <p className="small">Last updated {fmtDateTime(open.rec.updated_at)}{open.rec.updated_by_name ? ` by ${open.rec.updated_by_name}` : ''}. Every change is kept in the audit log.</p>}
            {open.rec && <Comments type="tk_record" id={open.rec.id} />}
          </>
        )}
      </Modal>
    </section>
  );
}
