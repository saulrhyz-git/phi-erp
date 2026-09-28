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
      <section className="authside" aria-hidden="true">
        <div className="sb-brand" style={{ padding: 0 }}><span className="sb-logo">PHI</span><div><b>Process Blueprint</b><small>Primary Homes, Inc.</small></div></div>
        <div>
          <h1>One place for the Odoo 19 rollout.</h1>
          <p>Process blueprint, SOW review, re-engineering decisions and the project toolkit — shared by the whole team.</p>
        </div>
        <small style={{ color: '#7F93AE' }}>Primary Group of Builders · Project Development</small>
      </section>
      <div className="authmain">
      <div className="authcard">
        <header>
          <h1>Sign in</h1>
          <p>Use your PHI blueprint account.</p>
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
    </div>
  );
}
