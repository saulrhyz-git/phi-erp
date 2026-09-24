import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useApi(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api(path));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
