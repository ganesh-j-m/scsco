import { useRef, useState, type ReactNode } from "react";
import { Search, Upload } from "lucide-react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { Spinner, EmptyState, ErrorState, LoadingState, Pagination } from "@/components/ui";
import type { PageMeta } from "@/types";

export interface Column<T> {
  key: string;
  header: string;
  sortKey?: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns, rows, meta, loading, error, onRetry, onPage, sortBy, sortDir, onSort, emptyTitle, actions,
}: {
  columns: Column<T>[]; rows: T[] | undefined; meta: PageMeta | undefined; loading: boolean; error: string | null; onRetry: () => void;
  onPage: (p: number) => void; sortBy: string; sortDir: "asc" | "desc"; onSort: (k: string) => void; emptyTitle: string; actions?: (row: T) => ReactNode;
}) {
  if (loading && !rows) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows?.length) return <EmptyState title={emptyTitle} hint="Try a different search or add a new record." />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 text-left font-medium">
                  {c.sortKey ? (
                    <button onClick={() => onSort(c.sortKey!)} className="inline-flex items-center gap-1 hover:text-slate-900">
                      {c.header} {sortBy === c.sortKey && <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  ) : c.header}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-60" : ""}`}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                {columns.map((c) => <td key={c.key} className={`px-4 py-3 ${c.className ?? ""}`}>{c.render(r)}</td>)}
                {actions && <td className="px-4 py-3"><div className="flex justify-end gap-1">{actions(r)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onChange={onPage} />}
    </>
  );
}

export function Toolbar({ search, onSearch, placeholder, children }: { search: string; onSearch: (v: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
        <input className="input pl-9" placeholder={placeholder} aria-label={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      {children}
    </div>
  );
}

export function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className={`rounded p-1.5 disabled:opacity-40 ${danger ? "text-red-600 hover:bg-red-50" : "hover:bg-slate-100"}`}>
      {children}
    </button>
  );
}

export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: FieldError | { message?: string }; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error?.message && <p className="mt-1 text-xs text-red-600">{error.message}</p>}
    </div>
  );
}

export function TextInput({ id, label, reg, error, type = "text", disabled, hint }: { id: string; label: string; reg: UseFormRegisterReturn; error?: FieldError; type?: string; disabled?: boolean; hint?: string }) {
  return <Field id={id} label={label} error={error} hint={hint}><input id={id} type={type} disabled={disabled} className="input disabled:bg-slate-100" {...reg} /></Field>;
}

export function SelectInput({ id, label, reg, error, children, disabled }: { id: string; label: string; reg: UseFormRegisterReturn; error?: FieldError; children: ReactNode; disabled?: boolean }) {
  return <Field id={id} label={label} error={error}><select id={id} disabled={disabled} className="input disabled:bg-slate-100" {...reg}>{children}</select></Field>;
}

/** Uploads an image to the backend and returns its URL through onChange. */
export function ImageUploader({ value, onChange, label = "Photo" }: { value?: string; onChange: (url: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/uploads/image", { form });
      onChange(r.url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded-lg object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">None</div>}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <button type="button" className="btn-secondary" onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Spinner /> : <Upload className="h-4 w-4" />} {value ? "Change" : "Upload"}</button>
        {value && <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => onChange("")}>Remove</button>}
      </div>
    </div>
  );
}

export const apiErrorText = (e: unknown, fallback = "Unable to save changes.") =>
  e instanceof ApiError ? e.details?.map((d) => d.message).join(", ") || e.message : fallback;
