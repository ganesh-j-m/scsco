import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, Pagination } from "@/components/ui";
import type { PageMeta } from "@/types";

export interface Column<T> {
  key: string;
  header: string;
  sortKey?: string;
  cell: (row: T) => ReactNode;
  className?: string;
}
export interface SortState {
  by: string;
  dir: "asc" | "desc";
}

export function DataTable<T extends { id: string }>({
  columns, rows, loading, error, onRetry, meta, onPage, sort, onSort, emptyTitle, emptyHint,
}: {
  columns: Column<T>[];
  rows: T[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  meta: PageMeta | null;
  onPage: (p: number) => void;
  sort?: SortState;
  onSort?: (key: string) => void;
  emptyTitle: string;
  emptyHint?: string;
}) {
  if (loading && !rows.length) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows.length) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 text-left font-medium ${c.className ?? ""}`}>
                  {c.sortKey && onSort ? (
                    <button onClick={() => onSort(c.sortKey!)} className="inline-flex items-center gap-1 hover:text-slate-900">
                      {c.header} {sort?.by === c.sortKey && <span aria-hidden>{sort.dir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-60" : ""}`}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ""}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onChange={onPage} />}
    </>
  );
}

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function RowActions({ actions }: { actions: RowAction[] }) {
  return (
    <div className="flex justify-end gap-1">
      {actions.map((a) => (
        <button
          key={a.label}
          title={a.label}
          aria-label={a.label}
          disabled={a.disabled}
          onClick={a.onClick}
          className={`rounded p-1.5 disabled:opacity-40 ${a.danger ? "text-red-600 hover:bg-red-50" : "hover:bg-slate-100"}`}
        >
          <a.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export function Avatar({ src, name }: { src?: string | null; name: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-medium text-brand-700" aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
