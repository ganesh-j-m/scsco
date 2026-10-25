import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField, PhotoField } from "@/components/forms";
import { approvalTone, pretty } from "@/components/portal";

export interface FieldSpec {
  key: string;
  label: string;
  type: "text" | "textarea" | "date" | "image" | "url";
  required?: boolean;
  placeholder?: string;
  max?: number;
  half?: boolean;
}
type Row = { id: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" } & Record<string, unknown>;

/** One reusable list + add/edit/delete screen for every publishable website item. */
export function ContentManager({ title, subtitle, noun, endpoint, fields, columns, searchHint, note }: {
  title: string; subtitle: string; noun: string; endpoint: string; fields: FieldSpec[];
  columns: (row: Row) => { header: string; cell: ReactNode }[]; searchHint: string; note?: string;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const list = usePaged<Row>(endpoint, { search: q, status });
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`${endpoint}/${deleting.id}`, { method: "DELETE" }); toast.success("Record deleted successfully."); setDeleting(null); void list.reload(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const sample = columns({ id: "", status: "DRAFT" });
  const cols: Column<Row>[] = [
    ...sample.map((c, i) => ({ key: `c${i}`, header: c.header, cell: (r: Row) => columns(r)[i].cell })),
    { key: "status", header: "Status", cell: (r) => <Badge tone={r.status === "ARCHIVED" ? "slate" : approvalTone(r.status === "PUBLISHED" ? "APPROVED" : "PENDING")}>{pretty(r.status)}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (r) => <RowActions actions={[{ label: `Edit ${noun}`, icon: Pencil, onClick: () => setEditing(r) }, { label: `Delete ${noun}`, icon: Trash2, danger: true, onClick: () => setDeleting(r) }]} /> },
  ];

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add {noun}</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder={searchHint} aria-label={`Search ${title}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select>
        </div>
        <DataTable columns={cols} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle={`No ${title.toLowerCase()} yet`} emptyHint={`Add the first ${noun}.`} />
      </div>
      {note && <p className="mt-3 text-xs text-slate-500">{note}</p>}
      <EditModal target={editing} noun={noun} endpoint={endpoint} fields={fields} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title={`Delete this ${noun}?`} message="It will be permanently removed from the website." busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}

function EditModal({ target, noun, endpoint, fields, onClose, onSaved }: { target: Row | "new" | null; noun: string; endpoint: string; fields: FieldSpec[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const row = target && target !== "new" ? target : null;
  const [v, setV] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("DRAFT");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setErrors({}); setApiError(null);
    setStatus(row?.status ?? "DRAFT");
    setV(Object.fromEntries(fields.map((f) => {
      const raw = row?.[f.key];
      return [f.key, typeof raw === "string" ? (f.type === "date" ? raw.slice(0, 10) : raw) : ""];
    })));
  }, [target, row, fields]);

  const save = async () => {
    const errs: Record<string, string> = {};
    for (const f of fields) if (f.required && !(v[f.key] ?? "").trim()) errs[f.key] = f.type === "image" ? "Upload an image" : "This field is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true); setApiError(null);
    try {
      const body = { ...v, status };
      if (row) await api(`${endpoint}/${row.id}`, { method: "PATCH", body }); else await api(endpoint, { body });
      toast.success(row ? "Changes saved successfully." : `${noun.charAt(0).toUpperCase() + noun.slice(1)} created successfully.`);
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={!!target} title={row ? `Edit ${noun}` : `Add ${noun}`} onClose={onClose} wide>
      {apiError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `cm-${f.key}`;
          return (
            <FormField key={f.key} label={f.label + (f.required ? " *" : "")} id={id} error={errors[f.key]} className={f.half ? "" : "sm:col-span-2"}>
              {f.type === "textarea" ? <textarea id={id} rows={5} maxLength={f.max} className="input" placeholder={f.placeholder} value={v[f.key] ?? ""} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} />
                : f.type === "image" ? <PhotoField noun="image" value={v[f.key]} onChange={(url) => setV((s) => ({ ...s, [f.key]: url }))} />
                : <input id={id} type={f.type === "date" ? "date" : "text"} maxLength={f.max} className="input" placeholder={f.placeholder} value={v[f.key] ?? ""} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} />}
            </FormField>
          );
        })}
        <FormField label="Status" id="cm-status" className="sm:col-span-2">
          <select id="cm-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="DRAFT">Draft (hidden from the website)</option><option value="PUBLISHED">Published (visible on the website)</option><option value="ARCHIVED">Archived (hidden)</option></select>
        </FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving} onClick={save}>{saving && <Spinner />} {row ? "Save changes" : `Create ${noun}`}</button>
      </div>
    </Modal>
  );
}
