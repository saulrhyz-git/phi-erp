import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

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

  const canEditProcess = (pid) => !!user && (user.role === 'admin' || (user.role === 'owner' && user.process_ids.includes(pid)));
  const isEditor = !!user && (user.role === 'admin' || user.role === 'owner');
  const isAdmin = user?.role === 'admin';

  return (
    <AuthCtx.Provider value={{ user, refresh, login, logout, canEditProcess, isEditor, isAdmin }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
