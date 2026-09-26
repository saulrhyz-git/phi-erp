import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { ErrorNote, Loading, Modal, SheetHead } from '../components/ui.jsx';

const BLANK = { email: '', name: '', role_id: '', password: '', process_ids: [], domains: [], active: true };

export default function Users() {
  const { user: me, can } = useAuth();
  const { data, error, loading, reload } = useApi('/users');
  const roles = useApi(can('roles') ? '/roles' : null);
  const procs = useApi('/processes');
  const domains = useApi('/domains');
  const [form, setForm] = useState(null);
  const [reset, setReset] = useState(null);
  const [err, setErr] = useState(null);
  const roleList = roles.data || (data ? [...new Map(data.map((u) => [u.role_id, { id: u.role_id, name: u.role_name }])).values()] : []);

  const save = async () => {
    try {
      const body = { name: form.name, role_id: Number(form.role_id), process_ids: form.process_ids, domains: form.domains };
      if (form.id) await api(`/users/${form.id}`, { method: 'PUT', body: { ...body, active: form.active } });
      else await api('/users', { method: 'POST', body: { ...body, email: form.email, password: form.password } });
      setForm(null); setErr(null); reload();
    } catch (e) { setErr(e); }
  };
  const doReset = async () => {
    try { await api(`/users/${reset.id}/password`, { method: 'POST', body: { password: reset.password } }); setReset(null); setErr(null); }
    catch (e) { setErr(e); }
  };
  const toggle = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  const f = (k) => ({ value: form?.[k] ?? '', onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const selRole = roleList.find((r) => String(r.id) === String(form?.role_id));

  return (
    <section className="sheet">
      <SheetHead title="Users" actions={can('users', 'add') && <button className="btn primary" onClick={() => { setErr(null); setForm({ ...BLANK, role_id: roleList.find((r) => r.name === 'Process Owner')?.id ?? '' }); }}>Add user</button>}>
        Each user has one role. Domains decide which toolkit records a domain-scoped role can change; processes decide which SIPOCs and steps they validate.
        {can('roles') && <> Permissions are set per role on the <Link to="/roles">Roles</Link> page.</>}
      </SheetHead>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        <div className="tablewrap">
          <table className="t" style={{ minWidth: 900 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Domains</th><th>Processes</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{!u.active && <div><span className="badge bad">Deactivated</span></div>}{u.must_change_password && <div className="small">Temporary password</div>}</td>
                  <td>{u.email}</td>
                  <td><b>{u.role_name}</b></td>
                  <td>{u.domains.length ? <div className="chips-row">{u.domains.map((d) => <span key={d} className="domain">{d}</span>)}</div> : <span className="muted">—</span>}</td>
                  <td className="w-md">{u.process_ids.join(', ') || <span className="muted">—</span>}</td>
                  <td>{fmtDateTime(u.last_login_at) || <span className="muted">Never</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {can('users', 'edit') && <>
                      <button className="btn sm ghost" onClick={() => { setErr(null); setForm({ ...u, role_id: String(u.role_id) }); }}>Edit</button>{' '}
                      <button className="btn sm ghost" onClick={() => { setErr(null); setReset({ id: u.id, name: u.name, password: '' }); }}>Reset password</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!form} title={form?.id ? `Edit ${form.name}` : 'Add user'} onClose={() => setForm(null)}
        footer={<><button className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" onClick={save}>{form?.id ? 'Save changes' : 'Add user'}</button></>}>
        {form && (
          <>
            <ErrorNote error={err} />
            <div className="grid2">
              <label className="field"><span>Full name</span><input type="text" {...f('name')} /></label>
              <label className="field"><span>Email</span><input type="email" {...f('email')} disabled={!!form.id} /></label>
            </div>
            <label className="field"><span>Role</span>
              <select {...f('role_id')} disabled={form.id === me.id}>
                <option value="">Choose a role…</option>
                {roleList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            {selRole?.description && <p className="small" style={{ marginTop: -6 }}>{selRole.description}</p>}
            {!form.id && <label className="field"><span>Temporary password (10+ characters)</span><input type="text" {...f('password')} autoComplete="off" /></label>}
            <div className="field">
              <span className="small"><b>Domains</b> — records this user can change when their role grants “own domain”</span>
              <div className="checks">
                {domains.data?.map((d) => (
                  <label key={d.id}><input type="checkbox" checked={form.domains.includes(d.id)} onChange={() => toggle('domains', d.id)} /> <b>{d.id}</b> {d.name}</label>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="small"><b>Processes</b> — SIPOCs and hand-off steps this user validates when their role grants “own”</span>
              <div className="checks">
                {procs.data?.map((p) => (
                  <label key={p.id}><input type="checkbox" checked={form.process_ids.includes(p.id)} onChange={() => toggle('process_ids', p.id)} /> {p.id} {p.name}</label>
                ))}
              </div>
            </div>
            {form.id && form.id !== me.id && (
              <label className="row small" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Account active
              </label>
            )}
          </>
        )}
      </Modal>
      <Modal open={!!reset} title={reset ? `Reset password for ${reset.name}` : ''} onClose={() => setReset(null)}
        footer={<><button className="btn ghost" onClick={() => setReset(null)}>Cancel</button><button className="btn primary" onClick={doReset}>Set temporary password</button></>}>
        {reset && (
          <>
            <ErrorNote error={err} />
            <label className="field"><span>Temporary password (10+ characters)</span>
              <input type="text" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} autoComplete="off" /></label>
            <p className="small">Share it privately. They'll be asked to change it when they sign in.</p>
          </>
        )}
      </Modal>
    </section>
  );
}
