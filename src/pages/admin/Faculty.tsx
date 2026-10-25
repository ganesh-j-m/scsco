import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Power, Search, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { Avatar, DataTable, RowActions, type Column, type SortState } from "@/components/DataTable";
import { apiMessage, FormField, generatePassword, PhotoField } from "@/components/forms";
import type { Academic, FacultyRow } from "@/types/admin";

const schema = z.object({
  employeeId: z.string().trim().min(3, "At least 3 characters"),
  name: z.string().trim().min(2, "Enter a name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  departmentId: z.string().min(1, "Select a department"),
  designation: z.string().trim().optional(),
  qualification: z.string().trim().optional(),
  photoUrl: z.string().optional(),
  password: z.string().optional(),
});
type Values = z.infer<typeof schema>;
const empty: Values = { employeeId: "", name: "", email: "", phone: "", departmentId: "", designation: "", qualification: "", photoUrl: "", password: "" };

export default function Faculty() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const academic = useApi<Academic>("/lookups/academic");
  const list = usePaged<FacultyRow>("/faculty", { search: q, departmentId, status, sortBy: sort.by, sortDir: sort.dir });
  const [editing, setEditing] = useState<FacultyRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<FacultyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleStatus = async (f: FacultyRow) => {
    try {
      await api(`/faculty/${f.id}/status`, { method: "PATCH", body: { status: f.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
      toast.success(f.status === "ACTIVE" ? "Faculty deactivated." : "Faculty activated.");
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to update status")); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/faculty/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to delete. Deactivate this person instead if they have attendance or form records.")); }
    finally { setBusy(false); }
  };

  const columns: Column<FacultyRow>[] = [
    { key: "name", header: "Faculty", sortKey: "name", cell: (f) => (
      <div className="flex items-center gap-3"><Avatar src={f.photoUrl} name={f.user.name} /><div><p className="font-medium">{f.user.name}</p><p className="text-xs text-slate-500">{f.user.email}</p></div></div>
    ) },
    { key: "employeeId", header: "Employee ID", sortKey: "employeeId", cell: (f) => <span className="font-medium">{f.employeeId}</span> },
    { key: "department", header: "Department", cell: (f) => <><p>{f.department.name}</p>{f.headOf && <Badge tone="amber">HOD</Badge>}</> },
    { key: "designation", header: "Designation", cell: (f) => f.designation ?? "-" },
    { key: "subjects", header: "Subjects", cell: (f) => f._count.subjects },
    { key: "status", header: "Status", cell: (f) => <Badge tone={f.status === "ACTIVE" ? "green" : "red"}>{f.status === "ACTIVE" ? "Active" : "Inactive"}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (f) => (
      <RowActions actions={[
        { label: `Edit ${f.employeeId}`, icon: Pencil, onClick: () => setEditing(f) },
        { label: f.status === "ACTIVE" ? `Deactivate ${f.employeeId}` : `Activate ${f.employeeId}`, icon: Power, onClick: () => toggleStatus(f) },
        { label: `Delete ${f.employeeId}`, icon: Trash2, danger: true, onClick: () => setDeleting(f) },
      ]} />
    ) },
  ];

  return (
    <>
      <PageHeader title="Faculty" subtitle="Manage teaching staff and their departments" actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add faculty</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by name, ID or email" aria-label="Search faculty" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {(academic.data?.departments.length ?? 0) > 1 && (
            <select className="input w-auto" aria-label="Filter by department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>{academic.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} sort={sort} onSort={(by) => setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }))} emptyTitle="No faculty found" emptyHint="Add a faculty member or change the filters." />
      </div>
      <FacultyModal target={editing} academic={academic.data ?? undefined} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this faculty member?" message={`${deleting?.user.name} (${deleting?.employeeId}) and their login will be permanently removed. This is blocked if they have attendance or form records; deactivate them instead.`} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </>
  );
}

function FacultyModal({ target, academic, onClose, onSaved }: { target: FacultyRow | "new" | null; academic?: Academic; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const faculty = target && target !== "new" ? target : null;
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });
  const photo = watch("photoUrl");

  useEffect(() => {
    setApiError(null);
    if (!target) return;
    reset(faculty ? {
      ...empty, employeeId: faculty.employeeId, name: faculty.user.name, email: faculty.user.email, phone: faculty.user.phone ?? "", departmentId: faculty.department.id,
      designation: faculty.designation ?? "", qualification: faculty.qualification ?? "", photoUrl: faculty.photoUrl ?? "",
    } : { ...empty, departmentId: academic?.departments.length === 1 ? academic.departments[0]!.id : "", password: generatePassword() });
  }, [target, faculty, academic, reset]);

  const onSubmit = async (v: Values) => {
    setApiError(null);
    if (isNew && (!v.password || v.password.length < 8)) return setApiError("Initial password must be at least 8 characters");
    const { employeeId, password, ...rest } = v;
    try {
      if (isNew) await api("/faculty", { body: { ...rest, employeeId, password } });
      else await api(`/faculty/${faculty!.id}`, { method: "PATCH", body: rest });
      toast.success(isNew ? "Faculty created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={isNew ? "Add faculty" : "Edit faculty"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        <PhotoField value={photo} onChange={(u) => setValue("photoUrl", u)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Employee ID (login)" id="f-id" error={errors.employeeId?.message}><input id="f-id" className="input uppercase" disabled={!isNew} {...register("employeeId")} /></FormField>
          <FormField label="Department" id="f-dept" error={errors.departmentId?.message}>
            <select id="f-dept" className="input" {...register("departmentId")}><option value="">Select</option>{academic?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </FormField>
          <FormField label="Full name" id="f-name" error={errors.name?.message} className="sm:col-span-2"><input id="f-name" className="input" {...register("name")} /></FormField>
          <FormField label="Email" id="f-email" error={errors.email?.message}><input id="f-email" type="email" className="input" {...register("email")} /></FormField>
          <FormField label="Phone" id="f-phone"><input id="f-phone" className="input" {...register("phone")} /></FormField>
          <FormField label="Designation" id="f-des"><input id="f-des" className="input" placeholder="Assistant Professor" {...register("designation")} /></FormField>
          <FormField label="Qualification" id="f-qual"><input id="f-qual" className="input" placeholder="M.Sc., NET" {...register("qualification")} /></FormField>
          {isNew && (
            <FormField label="Initial password" id="f-pw" className="sm:col-span-2">
              <div className="flex gap-2"><input id="f-pw" className="input font-mono" {...register("password")} /><button type="button" className="btn-secondary" onClick={() => setValue("password", generatePassword())}><Wand2 className="h-4 w-4" /> Generate</button></div>
              <p className="mt-1 text-xs text-slate-500">Share this with the faculty member. It cannot be viewed later.</p>
            </FormField>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create faculty" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
