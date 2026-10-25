import { useCallback, useEffect, useState } from "react";
import { api, ApiError, qs } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from "@/components/ui";
import type { Paged } from "@/types";

interface Log {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  user: { loginId: string; name: string } | null;
}

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const [data, setData] = useState<Paged<Log> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await api<Paged<Log>>(`/audit-logs${qs({ page, pageSize: 20, search: debounced })}`)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Unable to load audit logs"); }
    finally { setLoading(false); }
  }, [page, debounced]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPage(1), [debounced]);

  return (
    <>
      <PageHeader title="Audit logs" subtitle="Security-relevant actions across the platform" />
      <div className="card">
        <div className="border-b border-slate-200 p-4">
          <input className="input max-w-sm" placeholder="Search action, entity or Login ID" aria-label="Search audit logs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : !data?.data.length ? <EmptyState title="No log entries" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Action</th><th className="px-4 py-3 font-medium">Entity</th><th className="px-4 py-3 font-medium">IP</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.data.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-4 py-3">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3">{l.user ? `${l.user.loginId}` : "-"}</td>
                      <td className="px-4 py-3 font-medium">{l.action}</td>
                      <td className="px-4 py-3 text-slate-600">{l.entity ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{l.ip ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
