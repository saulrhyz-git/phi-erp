import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

// Mirrors server/src/lib/permissions.js#can. The server always re-checks; this only decides what to show.
// scope: which modules are scoped by domain or by process ('own' only means something there).
const PROCESS_SCOPED = ['processes', 'matrix'];
export function canUser(user, module, action, ctx = {}) {
  const level = user?.permissions?.[module]?.[action] ?? 'none';
  if (level === 'all') return true;
  if (level !== 'own') return false;
  if (PROCESS_SCOPED.includes(module)) {
    return 'processId' in ctx ? user.process_ids.includes(ctx.processId) : user.process_ids.length > 0;
  }
  return 'domain' in ctx ? !!ctx.domain && user.domains.includes(ctx.domain) : user.domains.length > 0;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out

  const refresh = useCallback(async () => {
    try {
      setUser(await api('/auth/me'));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauth = () => setUser(null);
    const onPw = () => refresh();
    window.addEventListener('phi:unauthorized', onUnauth);
    window.addEventListener('phi:password-required', onPw);
    return () => {
      window.removeEventListener('phi:unauthorized', onUnauth);
      window.removeEventListener('phi:password-required', onPw);
    };
  }, [refresh]);

  const login = async (email, password) => {
    await api('/auth/login', { method: 'POST', body: { email, password } });
    await refresh();
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  const can = (module, action = 'view', ctx) => canUser(user, module, action, ctx);
  // Levels ('none' | 'own' | 'all'), handy for explaining what a user can do.
  const level = (module, action) => user?.permissions?.[module]?.[action] ?? 'none';

  return (
    <AuthCtx.Provider value={{ user, refresh, login, logout, can, level }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
