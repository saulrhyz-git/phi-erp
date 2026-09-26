import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { SheetHead } from '../components/ui.jsx';

export default function Account() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) { setMsg({ type: 'error', text: 'The new passwords do not match.' }); return; }
    try {
      await api('/auth/password', { method: 'POST', body: { current, next } });
      const forced = user.must_change_password;
      setMsg({ type: 'ok', text: 'Password changed.' });
      setCurrent(''); setNext(''); setConfirm('');
      await refresh();
      if (forced) nav('/');
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  };

  return (
    <section className="sheet">
      <SheetHead title="Your account">{user.name} · {user.email}</SheetHead>
      {user.must_change_password && <div className="notice">Set a new password before you continue. Your current one is temporary.</div>}
      <p className="lede">Role: <b>{user.role_name}</b>. Domains: <b>{user.domains.length ? user.domains.join(', ') : 'none'}</b>. Processes you validate: <b>{user.process_ids.length ? user.process_ids.join(', ') : 'none'}</b>. Ask the Project Manager to change these.</p>
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
        <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
        <label className="field"><span>New password (10+ characters)</span><input type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required /></label>
        <label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
        <button className="btn primary">Change password</button>
      </form>
    </section>
  );
}
