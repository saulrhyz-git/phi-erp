import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await login(email, password); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="authwrap">
      <div className="authcard">
        <header>
          <h1>PHI Process Blueprint</h1>
          <p>Primary Homes, Inc. · Odoo 19 implementation</p>
        </header>
        <form onSubmit={submit}>
          {error && <div className="notice error">{error}</div>}
          <label className="field"><span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="field"><span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="muted small" style={{ marginBottom: 0 }}>No account? Ask the blueprint admin in Project Development.</p>
        </form>
      </div>
    </div>
  );
}
