import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { ErrorNote, Loading, Modal, SheetHead } from '../components/ui.jsx';

const LABEL = { none: 'No', own: 'Own', all: 'All' };
const LEVEL_TEXT = { none: 'No access', own: 'Own domain / assigned processes only', all: 'All records' };

function Level({ v, na }) {
  if (na) return <span className="lvl na" aria-label="not applicable">·</span>;
  return <span className={`lvl ${v}`}>{v === 'all' ? 'All' : v === 'own' ? 'Own' : 'No'}</span>;
}

// Read-only or editable matrix of modules × actions for one role.
function Matrix({ groups, actions, perms, editable, onChange }) {
  return (
    <div className="tablewrap" style={{ maxHeight: '60vh' }}>
      <table className="perm">
        <thead><tr><th>Module</th>{actions.map((a) => <th key={a} style={{ textTransform: 'capitalize' }}>{a}</th>)}</tr></thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr className="grp"><td colSpan={actions.length + 1}>{g.label}</td></tr>
              {g.modules.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}{m.scope && <span className="small muted"> · scoped by {m.scope}</span>}</td>
                  {actions.map((a) => {
                    const na = !m.actions.includes(a);
                    const v = perms?.[m.key]?.[a] ?? 'none';
                    if (!editable || na) return <td key={a}><Level v={v} na={na} /></td>;
                    const opts = a === 'view' ? ['none', 'all'] : (m.scope ? ['none', 'own', 'all'] : ['none', 'all']);
                    return (
                      <td key={a}>
                        <select value={v} aria-label={`${m.label} ${a}`} onChange={(e) => onChange(m.key, a, e.target.value)}>
                          {opts.map((o) => <option key={o} value={o}>{LABEL[o]}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Roles() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi('/roles');
  const mods = useApi('/roles/modules');
  const [open, setOpen] = useState(null);     // role being viewed
  const [form, setForm] = useState(null);     // role being edited/created
  const [err, setErr] = useState(null);

  const setPerm = (m, a, v) => setForm((f) => {
    const p = { ...f.permissions, [m]: { ...f.permissions[m], [a]: v } };
    if (a === 'view' && v === 'none') p[m] = { view: 'none', add: 'none', edit: 'none', delete: 'none' };
    if (a !== 'view' && v !== 'none') p[m].view = 'all';
    return { ...f, permissions: p };
  });
  const setAll = (level) => setForm((f) => {
    const p = {};
    for (const g of mods.data.groups) for (const m of g.modules) {
      p[m.key] = Object.fromEntries(mods.data.actions.map((a) => [a, !m.actions.includes(a) ? 'none' : a === 'view' ? 'all' : (level === 'own' && !m.scope ? 'none' : level)]));
      if (['users', 'roles', 'audit_log'].includes(m.key) && level !== 'all') p[m.key] = { view: 'none', add: 'none', edit: 'none', delete: 'none' };
    }
    return { ...f, permissions: p };
  });
  const save = async () => {
    try {
      const body = { name: form.name, description: form.description, permissions: form.permissions };
      if (form.id) await api(`/roles/${form.id}`, { method: 'PUT', body });
      else await api('/roles', { method: 'POST', body });
      setForm(null); setErr(null); reload();
    } catch (e) { setErr(e); }
  };
  const del = async (r) => {
    if (!window.confirm(`Delete the role "${r.name}"?`)) return;
    try { await api(`/roles/${r.id}`, { method: 'DELETE' }); setOpen(null); reload(); } catch (e) { alert(e.message); }
  };

  return (
    <section className="sheet">
      <SheetHead title="Roles & permissions"
        actions={can('roles', 'add') && data && <button className="btn primary" onClick={() => { setErr(null); setForm({ name: '', description: '', permissions: data.find((r) => r.key === 'executive').permissions }); }}>New role</button>}>
        Each user has one role. For every module a role grants View, Add, Edit and Delete at one of three levels:
        <b> All</b> records, <b>Own</b> (records in the user's own domain, or processes assigned to them), or <b>No</b>.
        The two built-in roles are locked so the project can never lose its Project Manager access.
      </SheetHead>
      <ErrorNote error={error || mods.error} />
      {(loading && !data) || !mods.data ? <Loading /> : (
        <>
          <div className="tablewrap" style={{ marginBottom: 18 }}>
            <table className="t">
              <thead><tr><th>Role</th><th>What it can do</th><th>Users</th><th /></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{r.name}</b>{r.is_system && <div><span className="badge neutral">Built-in · locked</span></div>}</td>
                    <td className="w-lg">{r.description}</td>
                    <td>{r.active_users}{r.user_count !== r.active_users ? ` (+${r.user_count - r.active_users} inactive)` : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm ghost" onClick={() => setOpen(r)}>View matrix</button>{' '}
                      {!r.is_system && can('roles', 'edit') && <button className="btn sm ghost" onClick={() => { setErr(null); setForm({ ...r }); }}>Edit</button>}{' '}
                      {!r.is_system && can('roles', 'add') && <button className="btn sm ghost" onClick={() => { setErr(null); setForm({ name: `${r.name} (copy)`, description: r.description, permissions: r.permissions }); }}>Duplicate</button>}{' '}
                      {!r.is_system && can('roles', 'delete') && <button className="btn sm danger" onClick={() => del(r)} disabled={r.user_count > 0} title={r.user_count ? 'Move its users to another role first' : ''}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Access matrix — all roles</h3>
          <p className="lede small">{Object.entries(LEVEL_TEXT).map(([k, v]) => <span key={k} style={{ marginRight: 14 }}><Level v={k} /> {v}</span>)}</p>
          <div className="tablewrap" style={{ maxHeight: '70vh' }}>
            <table className="perm">
              <thead><tr><th>Module</th>{data.map((r) => <th key={r.id}>{r.name}<div className="small" style={{ fontWeight: 500 }}>view · add · edit · delete</div></th>)}</tr></thead>
              <tbody>
                {mods.data.groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="grp"><td colSpan={data.length + 1}>{g.label}</td></tr>
                    {g.modules.map((m) => (
                      <tr key={m.key}>
                        <td>{m.label}</td>
                        {data.map((r) => (
                          <td key={r.id} style={{ whiteSpace: 'nowrap' }}>
                            {mods.data.actions.map((a) => <Fragment key={a}><Level v={r.permissions[m.key]?.[a]} na={!m.actions.includes(a)} />{' '}</Fragment>)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal wide open={!!open} title={open ? `${open.name} — permissions` : ''} onClose={() => setOpen(null)}
        footer={<button className="btn" onClick={() => setOpen(null)}>Close</button>}>
        {open && mods.data && <><p className="small">{open.description}</p><Matrix groups={mods.data.groups} actions={mods.data.actions} perms={open.permissions} /></>}
      </Modal>
      <Modal wide open={!!form} title={form?.id ? `Edit role: ${form.name}` : 'New role'} onClose={() => setForm(null)}
        footer={<><button className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" onClick={save}>{form?.id ? 'Save role' : 'Create role'}</button></>}>
        {form && mods.data && (
          <>
            <ErrorNote error={err} />
            <label className="field"><span>Role name</span><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>Description</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ minHeight: 50 }} /></label>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="small"><b>Quick start:</b></span>
              <button className="btn sm ghost" type="button" onClick={() => setAll('none')}>View only</button>
              <button className="btn sm ghost" type="button" onClick={() => setAll('own')}>Edit own domain</button>
              <button className="btn sm ghost" type="button" onClick={() => setAll('all')}>Edit everything</button>
            </div>
            <Matrix groups={mods.data.groups} actions={mods.data.actions} perms={form.permissions} editable onChange={setPerm} />
          </>
        )}
      </Modal>
    </section>
  );
}
