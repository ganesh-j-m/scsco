import { useCallback, useEffect, useState } from "react";
import { api, ApiError, qs } from "@/lib/api";
import { useDebounce } from "./useDebounce";
import type { Paged } from "@/types";

/** Server-side search / filter / sort / pagination for admin tables. */
export function useList<T>(endpoint: string, defaults: { pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState(defaults.sortBy ?? "createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaults.sortDir ?? "desc");
  const [result, setResult] = useState<Paged<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounce(search);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api<Paged<T>>(`${endpoint}${qs({ page, pageSize: defaults.pageSize ?? 10, search: debounced, sortBy, sortDir, ...filters })}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, page, debounced, sortBy, sortDir, filters]);

  useEffect(() => { void load(); }, [load]);
  // Any search/filter change goes back to page 1.
  useEffect(() => setPage(1), [debounced, filters]);

  const setFilter = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  return { result, loading, error, reload: load, page, setPage, search, setSearch, filters, setFilter, sortBy, sortDir, toggleSort };
}
