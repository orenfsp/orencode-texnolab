import { useCallback, useEffect, useState } from "react";
import { api, type Dictionaries } from "./api";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

let dictCache: Promise<Dictionaries> | null = null;

export function useDictionaries() {
  const [dicts, setDicts] = useState<Dictionaries | null>(null);
  useEffect(() => {
    dictCache ??= api<Dictionaries>("/api/dict");
    dictCache.then(setDicts).catch(() => { dictCache = null; });
  }, []);
  return dicts;
}
