import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column, type SortState } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import type { Academic, CourseRow } from "@/types/admin";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  code: z.string().trim().min(2, "At least 2 characters"),
  departmentId: z.string().min(1, "Select a department"),
  durationYears: z.string().regex(/^[1-6]$/, "Select the duration"),
  description: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
type Values = z.infer<typeof schema>;
const empty: Values = { name: "", code: "", departmentId: "", durationYears: "3", description: "", status: "ACTIVE" };

export default function Courses() {
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "PRINCIPAL";
  const academic = useApi<Academic>("/lookups/academic");
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const list = usePaged<CourseRow>("/courses", { search: q, departmentId, status, sortBy: sort.by, sortDir: sort.dir });
  const [editing, setEditing] = useState<CourseRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<CourseRow | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (c: CourseRow) => {
    try {
      await api(`/courses/${c.id}`, { method: "PATCH", body: { status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
      toast.success(c.status === "ACTIVE" ? "Course deactivated." : "Course activated.");
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to update status")); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/courses/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to delete course")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<CourseRow>[] = [
    { key: "name", header: "Course", sortKey: "name", cell: (c) => <><p className="font-medium">{c.name}</p>{c.description && <p className="line-clamp-1 text-xs text-slate-500">{c.description}</p>}</> },
    { key: "code", header: "Code", sortKey: "code", cell: (c) => c.code },
    { key: "department", header: "Department", cell: (c) => c.department.name },
    { key: "duration", header: "Duration", cell: (c) => `${c.durationYears} yr` },
    { key: "counts", header: "Subjects / Students", cell: (c) => `${c._count.subjects} / ${c._count.students}` },
    { key: "status", header: "Status", cell: (c) => <Badge tone={c.status === "ACTIVE" ? "green" : "red"}>{c.status === "ACTIVE" ? "Active" : "Inactive"}</Badge> },
    ...(canWrite ? [{ key: "actions", header: "Actions", className: "text-right", cell: (c: CourseRow) => (
      <RowActions actions={[
        { label: `Edit ${c.code}`, icon: Pencil, onClick: () => setEditing(c) },
        { label: c.status === "ACTIVE" ? `Deactivate ${c.code}` : `Activate ${c.code}`, icon: Power, onClick: () => toggle(c) },
        { label: `Delete ${c.code}`, icon: Trash2, danger: true, onClick: () => setDeleting(c) },
      ]} />
    ) }] : []),
  ];

  return (
    <>
      <PageHeader title="Courses" subtitle="Programmes offered by each department" actions={canWrite && <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add course</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by name or code" aria-label="Search courses" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {(academic.data?.departments.length ?? 0) > 1 && (
            <select className="input w-auto" aria-label="Filter by department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">All departments</option>{academic.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          )}
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} sort={sort} onSort={(by) => setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }))} emptyTitle="No courses found" emptyHint="Add a course under a department." />
      </div>
      <CourseModal target={editing} departments={academic.data?.departments ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this course?" message={`${deleting?.name} will be permanently removed. This is blocked while subjects, students or exams are linked to it.`} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </>
  );
}

function CourseModal({ target, departments, onClose, onSaved }: { target: CourseRow | "new" | null; departments: Academic["departments"]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const course = target && target !== "new" ? target : null;
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    setApiError(null);
    if (target) reset(course ? { name: course.name, code: course.code, departmentId: course.departmentId, durationYears: String(course.durationYears), description: course.description ?? "", status: course.status } : empty);
  }, [target, course, reset]);

  const onSubmit = async (v: Values) => {
    setApiError(null);
    const body = { ...v, durationYears: Number(v.durationYears) };
    try {
      if (isNew) await api("/courses", { body });
      else await api(`/courses/${course!.id}`, { method: "PATCH", body });
      toast.success(isNew ? "Course created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={isNew ? "Add course" : "Edit course"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        <FormField label="Name" id="c-name" error={errors.name?.message}><input id="c-name" className="input" {...register("name")} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Code" id="c-code" error={errors.code?.message}><input id="c-code" className="input uppercase" {...register("code")} /></FormField>
          <FormField label="Department" id="c-dept" error={errors.departmentId?.message}><select id="c-dept" className="input" {...register("departmentId")}><option value="">Select</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></FormField>
          <FormField label="Duration (years)" id="c-dur" error={errors.durationYears?.message}><select id="c-dur" className="input" {...register("durationYears")}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></FormField>
          <FormField label="Status" id="c-status"><select id="c-status" className="input" {...register("status")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></FormField>
        </div>
        <FormField label="Description" id="c-desc"><textarea id="c-desc" rows={3} className="input" {...register("description")} /></FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create course" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
