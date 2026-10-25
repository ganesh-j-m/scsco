import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Pencil, Plus, Power, Search, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { Avatar, DataTable, RowActions, type Column, type SortState } from "@/components/DataTable";
import { apiMessage, FormField, generatePassword, PhotoField } from "@/components/forms";
import type { Academic, ParentRow, StudentRow } from "@/types/admin";

const num = (label: string) => z.string().regex(/^\d+$/, `Enter ${label}`);
const schema = z.object({
  studentId: z.string().trim().min(3, "At least 3 characters"),
  prn: z.string().trim().optional(),
  name: z.string().trim().min(2, "Enter a name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  departmentId: z.string().min(1, "Select a department"),
  courseId: z.string().min(1, "Select a course"),
  year: num("the year"),
  semester: num("the semester"),
  division: z.string().trim().min(1, "Enter a division"),
  admissionYear: z.string().regex(/^(20)\d{2}$/, "Enter a year like 2025"),
  address: z.string().trim().optional(),
  parentId: z.string().optional(),
  photoUrl: z.string().optional(),
  password: z.string().optional(),
});
type Values = z.infer<typeof schema>;

const empty: Values = {
  studentId: "", prn: "", name: "", email: "", phone: "", dateOfBirth: "", gender: "", departmentId: "", courseId: "", year: "1",
  semester: "1", division: "A", admissionYear: String(new Date().getFullYear()), address: "", parentId: "", photoUrl: "", password: "",
};

export default function Students() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [departmentId, setDepartmentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortState>({ by: "createdAt", dir: "desc" });

  const academic = useApi<Academic>("/lookups/academic");
  const list = usePaged<StudentRow>("/students", { search: q, departmentId, courseId, year, status, sortBy: sort.by, sortDir: sort.dir });

  const [editing, setEditing] = useState<StudentRow | "new" | null>(null);
  const [viewing, setViewing] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const courseOptions = useMemo(
    () => (academic.data?.courses ?? []).filter((c) => !departmentId || c.departmentId === departmentId),
    [academic.data, departmentId],
  );

  const toggleSort = (by: string) => setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }));

  const toggleStatus = async (s: StudentRow) => {
    try {
      await api(`/students/${s.id}/status`, { method: "PATCH", body: { status: s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
      toast.success(s.status === "ACTIVE" ? "Student deactivated." : "Student activated.");
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to update status")); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/students/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to delete student")); }
    finally { setBusy(false); }
  };

  const columns: Column<StudentRow>[] = [
    { key: "name", header: "Student", sortKey: "name", cell: (s) => (
      <div className="flex items-center gap-3"><Avatar src={s.photoUrl} name={s.user.name} /><div><p className="font-medium">{s.user.name}</p><p className="text-xs text-slate-500">{s.user.email}</p></div></div>
    ) },
    { key: "studentId", header: "Student ID", sortKey: "studentId", cell: (s) => <span className="font-medium">{s.studentId}</span> },
    { key: "course", header: "Course", cell: (s) => <><p>{s.course.name}</p><p className="text-xs text-slate-500">{s.department.code}</p></> },
    { key: "class", header: "Class", sortKey: "year", cell: (s) => `Year ${s.year} · Sem ${s.semester} · Div ${s.division}` },
    { key: "status", header: "Status", cell: (s) => <Badge tone={s.status === "ACTIVE" ? "green" : "red"}>{s.status === "ACTIVE" ? "Active" : "Inactive"}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (s) => (
      <RowActions actions={[
        { label: `View ${s.studentId}`, icon: Eye, onClick: () => setViewing(s) },
        { label: `Edit ${s.studentId}`, icon: Pencil, onClick: () => setEditing(s) },
        { label: s.status === "ACTIVE" ? `Deactivate ${s.studentId}` : `Activate ${s.studentId}`, icon: Power, onClick: () => toggleStatus(s) },
        { label: `Delete ${s.studentId}`, icon: Trash2, danger: true, onClick: () => setDeleting(s) },
      ]} />
    ) },
  ];

  return (
    <>
      <PageHeader title="Students" subtitle="Admit, update and manage student records" actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add student</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by name, ID, PRN or email" aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {(academic.data?.departments.length ?? 0) > 1 && (
            <select className="input w-auto" aria-label="Filter by department" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setCourseId(""); }}>
              <option value="">All departments</option>
              {academic.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select className="input w-auto" aria-label="Filter by course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">All courses</option>
            {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input w-auto" aria-label="Filter by year" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} sort={sort} onSort={toggleSort} emptyTitle="No students found" emptyHint="Add a student or change the filters." />
      </div>

      <StudentModal target={editing} academic={academic.data ?? undefined} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <Modal open={!!viewing} title="Student details" onClose={() => setViewing(null)}>
        {viewing && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {([
                ["Name", viewing.user.name], ["Student ID", viewing.studentId], ["PRN", viewing.prn], ["Email", viewing.user.email], ["Phone", viewing.user.phone],
                ["Date of birth", viewing.dateOfBirth && new Date(viewing.dateOfBirth).toLocaleDateString("en-IN")], ["Gender", viewing.gender],
                ["Department", viewing.department.name], ["Course", viewing.course.name], ["Year / Semester", `${viewing.year} / ${viewing.semester}`],
                ["Division", viewing.division], ["Admission year", viewing.admissionYear], ["Parent", viewing.parent?.user.name], ["Address", viewing.address],
              ] as [string, string | number | null | undefined][]).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v || "-"}</dd></div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end"><button className="btn-primary" onClick={() => setViewing(null)}>Close</button></div>
          </>
        )}
      </Modal>
      <ConfirmDialog open={!!deleting} title="Delete this student?" message={`${deleting?.user.name} (${deleting?.studentId}) and their login, attendance, results and fee records will be permanently removed. Deactivate instead if you only want to block access.`} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </>
  );
}

function StudentModal({ target, academic, onClose, onSaved }: { target: StudentRow | "new" | null; academic?: Academic; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const student = target && target !== "new" ? target : null;
  const parents = useApi<{ data: Pick<ParentRow, "id" | "user">[] }>(target ? "/lookups/parents" : null);
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });
  const dept = watch("departmentId");
  const photo = watch("photoUrl");

  useEffect(() => {
    setApiError(null);
    if (!target) return;
    reset(student ? {
      ...empty, studentId: student.studentId, prn: student.prn ?? "", name: student.user.name, email: student.user.email, phone: student.user.phone ?? "",
      dateOfBirth: student.dateOfBirth?.slice(0, 10) ?? "", gender: student.gender ?? "", departmentId: student.department.id, courseId: student.course.id,
      year: String(student.year), semester: String(student.semester), division: student.division, admissionYear: String(student.admissionYear),
      address: student.address ?? "", parentId: student.parentId ?? "", photoUrl: student.photoUrl ?? "",
    } : { ...empty, departmentId: academic?.departments.length === 1 ? academic.departments[0]!.id : "", password: generatePassword() });
  }, [target, student, academic, reset]);

  const courses = (academic?.courses ?? []).filter((c) => c.departmentId === dept);

  const onSubmit = async (v: Values) => {
    setApiError(null);
    if (isNew && (!v.password || v.password.length < 8)) return setApiError("Initial password must be at least 8 characters");
    const { studentId, password, ...rest } = v;
    const body = { ...rest, year: Number(v.year), semester: Number(v.semester), admissionYear: Number(v.admissionYear) };
    try {
      if (isNew) await api("/students", { body: { ...body, studentId, password } });
      else await api(`/students/${student!.id}`, { method: "PATCH", body });
      toast.success(isNew ? "Student created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
  };

  const err = (k: keyof Values) => errors[k]?.message;

  return (
    <Modal open={!!target} title={isNew ? "Add student" : "Edit student"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        <PhotoField value={photo} onChange={(u) => setValue("photoUrl", u)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Student ID (login)" id="s-id" error={err("studentId")}><input id="s-id" className="input uppercase" disabled={!isNew} {...register("studentId")} /></FormField>
          <FormField label="PRN" id="s-prn"><input id="s-prn" className="input" {...register("prn")} /></FormField>
          <FormField label="Full name" id="s-name" error={err("name")} className="sm:col-span-2"><input id="s-name" className="input" {...register("name")} /></FormField>
          <FormField label="Email" id="s-email" error={err("email")}><input id="s-email" type="email" className="input" {...register("email")} /></FormField>
          <FormField label="Phone" id="s-phone"><input id="s-phone" className="input" {...register("phone")} /></FormField>
          <FormField label="Date of birth" id="s-dob"><input id="s-dob" type="date" className="input" {...register("dateOfBirth")} /></FormField>
          <FormField label="Gender" id="s-gender"><select id="s-gender" className="input" {...register("gender")}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></FormField>
          <FormField label="Department" id="s-dept" error={err("departmentId")}>
            <select id="s-dept" className="input" {...register("departmentId", { onChange: () => setValue("courseId", "") })}><option value="">Select</option>{academic?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </FormField>
          <FormField label="Course" id="s-course" error={err("courseId")}>
            <select id="s-course" className="input" disabled={!dept} {...register("courseId")}><option value="">Select</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </FormField>
          <FormField label="Year" id="s-year" error={err("year")}><select id="s-year" className="input" {...register("year")}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}</select></FormField>
          <FormField label="Semester" id="s-sem" error={err("semester")}><select id="s-sem" className="input" {...register("semester")}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => <option key={y} value={y}>{y}</option>)}</select></FormField>
          <FormField label="Division" id="s-div" error={err("division")}><input id="s-div" className="input uppercase" {...register("division")} /></FormField>
          <FormField label="Admission year" id="s-ay" error={err("admissionYear")}><input id="s-ay" inputMode="numeric" className="input" {...register("admissionYear")} /></FormField>
          <FormField label="Parent" id="s-parent" className="sm:col-span-2">
            <select id="s-parent" className="input" {...register("parentId")}><option value="">No parent linked</option>{parents.data?.data.map((p) => <option key={p.id} value={p.id}>{p.user.name} ({p.user.loginId})</option>)}</select>
          </FormField>
          <FormField label="Address" id="s-addr" className="sm:col-span-2"><textarea id="s-addr" rows={2} className="input" {...register("address")} /></FormField>
          {isNew && (
            <FormField label="Initial password" id="s-pw" className="sm:col-span-2">
              <div className="flex gap-2"><input id="s-pw" className="input font-mono" {...register("password")} /><button type="button" className="btn-secondary" onClick={() => setValue("password", generatePassword())}><Wand2 className="h-4 w-4" /> Generate</button></div>
              <p className="mt-1 text-xs text-slate-500">Share this with the student. It is stored only as a hash and cannot be viewed later.</p>
            </FormField>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create student" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
