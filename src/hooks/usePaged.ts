import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, qs } from "@/lib/api";
import type { Paged } from "@/types";

type Filters = Record<string, string | number | undefined>;

/** Server-side paginated list. Going back to page 1 on any filter change happens automatically. */
export function usePaged<T>(path: string, filters: Filters, pageSize = 10) {
  const key = JSON.stringify(filters);
  const [pageState, setPageState] = useState({ key, page: 1 });
  const page = pageState.key === key ? pageState.page : 1;
  const setPage = useCallback((p: number) => setPageState({ key, page: p }), [key]);

  const [result, setResult] = useState<Paged<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const r = await api<Paged<T>>(`${path}${qs({ page, pageSize, ...(JSON.parse(key) as Filters) })}`);
      if (id === latest.current) setResult(r);
    } catch (e) {
      if (id === latest.current) setError(e instanceof ApiError ? e.message : "Unable to load data");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [path, key, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows: result?.data ?? [], meta: result?.meta ?? null, loading, error, reload: load, page, setPage };
}
