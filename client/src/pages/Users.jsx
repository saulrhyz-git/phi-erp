import { useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { ErrorNote, Loading, Modal, SheetHead } from '../components/ui.jsx';

const ROLES = { admin: 'Admin — edits everything, manages users', owner: 'Process owner — validates and edits assigned processes', viewer: 'Viewer — reads and comments' };
const BLANK = { email: '', name: '', role: 'owner', password: '', process_ids: [], active: true };

export default function Users() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useApi('/users');
  const procs = useApi('/processes');
  const [form, setForm] = useState(null);
  const [reset, setReset] = useState(null);
  const [err, setErr] = useState(null);

  const save = async () => {
    try {
      if (form.id) await api(`/users/${form.id}`, { method: 'PUT', body: { name: form.name, role: form.role, active: form.active, process_ids: form.process_ids } });
      else await api('/users', { method: 'POST', body: { email: form.email, name: form.name, role: form.role, password: form.password, process_ids: form.process_ids } });
      setForm(null); setErr(null); reload();
    } catch (e) { setErr(e); }
  };
  const doReset = async () => {
    try { await api(`/users/${reset.id}/password`, { method: 'POST', body: { password: reset.password } }); setReset(null); setErr(null); }
    catch (e) { setErr(e); }
  };
  const toggle = (pid) => setForm((f) => ({ ...f, process_ids: f.process_ids.includes(pid) ? f.process_ids.filter((x) => x !== pid) : [...f.process_ids, pid] }));
  const f = (k) => ({ value: form?.[k] ?? '', onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <section className="sheet">
      <SheetHead title="Users & process owners" actions={<button className="btn primary" onClick={() => { setErr(null); setForm({ ...BLANK }); }}>Add user</button>}>
        Assign each process owner to the processes they validate. New users and password resets get a temporary password they must change on first sign-in.
      </SheetHead>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        <div className="tablewrap">
          <table className="t" style={{ minWidth: 820 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Processes</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                  <td><b>{u.name}</b>{!u.active && <div className="small muted">Deactivated</div>}{u.must_change_password && <div className="small muted">Temporary password</div>}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td className="w-md">{u.role === 'admin' ? 'All' : (u.process_ids.join(', ') || <span className="muted">None</span>)}</td>
                  <td>{fmtDateTime(u.last_login_at) || <span className="muted">Never</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => { setErr(null); setForm({ ...u }); }}>Edit</button>{' '}
                    <button className="btn sm ghost" onClick={() => { setErr(null); setReset({ id: u.id, name: u.name, password: '' }); }}>Reset password</button>
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
              <select {...f('role')} disabled={form.id === me.id}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            {!form.id && <label className="field"><span>Temporary password (10+ characters)</span><input type="text" {...f('password')} autoComplete="off" /></label>}
            {form.role === 'owner' && (
              <div className="field">
                <span className="small muted">Processes this owner validates</span>
                <div className="checks">
                  {procs.data?.map((p) => (
                    <label key={p.id}><input type="checkbox" checked={form.process_ids.includes(p.id)} onChange={() => toggle(p.id)} /> {p.id} {p.name}</label>
                  ))}
                </div>
              </div>
            )}
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
            <p className="small muted">Share it privately. They'll be asked to change it when they sign in.</p>
          </>
        )}
      </Modal>
    </section>
  );
}
