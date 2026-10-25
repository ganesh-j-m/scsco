import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column, type SortState } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import type { DepartmentRow } from "@/types/admin";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  code: z.string().trim().min(2, "At least 2 characters"),
  description: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
type Values = z.infer<typeof schema>;
const empty: Values = { name: "", code: "", description: "", status: "ACTIVE" };

export default function Departments() {
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "PRINCIPAL";
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const list = usePaged<DepartmentRow>("/departments", { search: q, status, sortBy: sort.by, sortDir: sort.dir });
  const [editing, setEditing] = useState<DepartmentRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (d: DepartmentRow) => {
    try {
      await api(`/departments/${d.id}`, { method: "PATCH", body: { status: d.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
      toast.success(d.status === "ACTIVE" ? "Department deactivated." : "Department activated.");
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to update status")); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/departments/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to delete department")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<DepartmentRow>[] = [
    { key: "name", header: "Department", sortKey: "name", cell: (d) => <><p className="font-medium">{d.name}</p>{d.description && <p className="line-clamp-1 text-xs text-slate-500">{d.description}</p>}</> },
    { key: "code", header: "Code", sortKey: "code", cell: (d) => d.code },
    { key: "hod", header: "HOD", cell: (d) => d.hod ? d.hod.user.name : <span className="text-slate-500">Not assigned</span> },
    { key: "counts", header: "Courses / Faculty / Students", cell: (d) => `${d._count.courses} / ${d._count.faculty} / ${d._count.students}` },
    { key: "status", header: "Status", cell: (d) => <Badge tone={d.status === "ACTIVE" ? "green" : "red"}>{d.status === "ACTIVE" ? "Active" : "Inactive"}</Badge> },
    ...(canWrite ? [{ key: "actions", header: "Actions", className: "text-right", cell: (d: DepartmentRow) => (
      <RowActions actions={[
        { label: `Edit ${d.code}`, icon: Pencil, onClick: () => setEditing(d) },
        { label: d.status === "ACTIVE" ? `Deactivate ${d.code}` : `Activate ${d.code}`, icon: Power, onClick: () => toggle(d) },
        { label: `Delete ${d.code}`, icon: Trash2, danger: true, onClick: () => setDeleting(d) },
      ]} />
    ) }] : []),
  ];

  return (
    <>
      <PageHeader title="Departments" subtitle="Academic departments of the college" actions={canWrite && <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add department</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by name or code" aria-label="Search departments" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} sort={sort} onSort={(by) => setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }))} emptyTitle="No departments found" emptyHint="Add the first department to get started." />
      </div>
      <DepartmentModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this department?" message={`${deleting?.name} will be permanently removed. This is blocked while courses, faculty or students are linked to it.`} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </>
  );
}

function DepartmentModal({ target, onClose, onSaved }: { target: DepartmentRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const dept = target && target !== "new" ? target : null;
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    setApiError(null);
    if (target) reset(dept ? { name: dept.name, code: dept.code, description: dept.description ?? "", status: dept.status } : empty);
  }, [target, dept, reset]);

  const onSubmit = async (v: Values) => {
    setApiError(null);
    try {
      if (isNew) await api("/departments", { body: v });
      else await api(`/departments/${dept!.id}`, { method: "PATCH", body: v });
      toast.success(isNew ? "Department created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={isNew ? "Add department" : "Edit department"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        <FormField label="Name" id="d-name" error={errors.name?.message}><input id="d-name" className="input" {...register("name")} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Code" id="d-code" error={errors.code?.message}><input id="d-code" className="input uppercase" placeholder="CS" {...register("code")} /></FormField>
          <FormField label="Status" id="d-status"><select id="d-status" className="input" {...register("status")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></FormField>
        </div>
        <FormField label="Description" id="d-desc"><textarea id="d-desc" rows={3} className="input" {...register("description")} /></FormField>
        <p className="text-xs text-slate-500">The head of department is assigned from the HODs page.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create department" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
