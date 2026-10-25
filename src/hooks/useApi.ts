import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

// Small in-memory cache so moving between public pages feels instant.
// It is only a cache — the database stays the source of truth.
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 30_000;

export function useApi<T>(path: string | null) {
  const cached = path ? cache.get(path) : undefined;
  const [data, setData] = useState<T | null>((cached?.data as T) ?? null);
  const [loading, setLoading] = useState(!!path && !cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!path) return;
      const hit = cache.get(path);
      if (!force && hit && Date.now() - hit.at < TTL) {
        setData(hit.data as T);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await api<T>(path);
        cache.set(path, { at: Date.now(), data: res });
        setData(res);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Unable to load content");
      } finally {
        setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: () => load(true) };
}
