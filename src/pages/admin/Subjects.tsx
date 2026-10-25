import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column, type SortState } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import type { Academic, FacultyRow, SubjectRow } from "@/types/admin";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  code: z.string().trim().min(2, "At least 2 characters"),
  courseId: z.string().min(1, "Select a course"),
  semester: z.string().regex(/^\d+$/, "Select a semester"),
  credits: z.string().regex(/^\d+$/, "Enter credits"),
  facultyId: z.string().optional(),
});
type Values = z.infer<typeof schema>;
const empty: Values = { name: "", code: "", courseId: "", semester: "1", credits: "4", facultyId: "" };

export default function Subjects() {
  const toast = useToast();
  const academic = useApi<Academic>("/lookups/academic");
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [departmentId, setDepartmentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [semester, setSemester] = useState("");
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const list = usePaged<SubjectRow>("/subjects", { search: q, departmentId, courseId, semester, sortBy: sort.by, sortDir: sort.dir });
  const [editing, setEditing] = useState<SubjectRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<SubjectRow | null>(null);
  const [busy, setBusy] = useState(false);

  const courseOptions = useMemo(() => (academic.data?.courses ?? []).filter((c) => !departmentId || c.departmentId === departmentId), [academic.data, departmentId]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/subjects/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to delete subject")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<SubjectRow>[] = [
    { key: "name", header: "Subject", sortKey: "name", cell: (s) => <p className="font-medium">{s.name}</p> },
    { key: "code", header: "Code", sortKey: "code", cell: (s) => s.code },
    { key: "course", header: "Course", cell: (s) => <><p>{s.course.name}</p><p className="text-xs text-slate-500">{s.course.department.code}</p></> },
    { key: "semester", header: "Semester", sortKey: "semester", cell: (s) => s.semester },
    { key: "credits", header: "Credits", cell: (s) => s.credits },
    { key: "faculty", header: "Faculty", cell: (s) => s.faculty ? s.faculty.user.name : <span className="text-slate-500">Not assigned</span> },
    { key: "actions", header: "Actions", className: "text-right", cell: (s) => (
      <RowActions actions={[
        { label: `Edit ${s.code}`, icon: Pencil, onClick: () => setEditing(s) },
        { label: `Delete ${s.code}`, icon: Trash2, danger: true, onClick: () => setDeleting(s) },
      ]} />
    ) },
  ];

  return (
    <>
      <PageHeader title="Subjects" subtitle="Subjects per course and semester, with the assigned teacher" actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add subject</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by name or code" aria-label="Search subjects" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {(academic.data?.departments.length ?? 0) > 1 && (
            <select className="input w-auto" aria-label="Filter by department" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setCourseId(""); }}><option value="">All departments</option>{academic.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          )}
          <select className="input w-auto" aria-label="Filter by course" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All courses</option>{courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input w-auto" aria-label="Filter by semester" value={semester} onChange={(e) => setSemester(e.target.value)}><option value="">All semesters</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Semester {n}</option>)}</select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} sort={sort} onSort={(by) => setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }))} emptyTitle="No subjects found" emptyHint="Add subjects for a course and assign a teacher." />
      </div>
      <SubjectModal target={editing} academic={academic.data ?? undefined} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this subject?" message={`${deleting?.name} (${deleting?.code}) and its timetable slots will be removed. This is blocked if attendance, results or exams use it.`} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </>
  );
}

function SubjectModal({ target, academic, onClose, onSaved }: { target: SubjectRow | "new" | null; academic?: Academic; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const subject = target && target !== "new" ? target : null;
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });
  const courseId = watch("courseId");
  const course = academic?.courses.find((c) => c.id === courseId);
  const faculty = useApi<{ data: FacultyRow[] }>(course ? `/faculty?departmentId=${course.departmentId}&status=ACTIVE&pageSize=100&sortBy=name&sortDir=asc` : null);

  useEffect(() => {
    setApiError(null);
    if (target) reset(subject ? { name: subject.name, code: subject.code, courseId: subject.courseId, semester: String(subject.semester), credits: String(subject.credits), facultyId: subject.facultyId ?? "" } : empty);
  }, [target, subject, reset]);

  const onSubmit = async (v: Values) => {
    setApiError(null);
    const body = { ...v, semester: Number(v.semester), credits: Number(v.credits), facultyId: v.facultyId ?? "" };
    try {
      if (isNew) await api("/subjects", { body });
      else await api(`/subjects/${subject!.id}`, { method: "PATCH", body });
      toast.success(isNew ? "Subject created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={isNew ? "Add subject" : "Edit subject"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        <FormField label="Subject name" id="sb-name" error={errors.name?.message}><input id="sb-name" className="input" {...register("name")} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Code" id="sb-code" error={errors.code?.message}><input id="sb-code" className="input uppercase" {...register("code")} /></FormField>
          <FormField label="Course" id="sb-course" error={errors.courseId?.message}>
            <select id="sb-course" className="input" {...register("courseId", { onChange: () => setValue("facultyId", "") })}><option value="">Select</option>{academic?.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </FormField>
          <FormField label="Semester" id="sb-sem" error={errors.semester?.message}><select id="sb-sem" className="input" {...register("semester")}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></FormField>
          <FormField label="Credits" id="sb-cr" error={errors.credits?.message}><input id="sb-cr" type="number" min={1} max={10} className="input" {...register("credits")} /></FormField>
        </div>
        <FormField label="Assigned faculty" id="sb-fac">
          <select id="sb-fac" className="input" disabled={!course} {...register("facultyId")}><option value="">Not assigned</option>{faculty.data?.data.map((f) => <option key={f.id} value={f.id}>{f.user.name} ({f.employeeId})</option>)}</select>
          <p className="mt-1 text-xs text-slate-500">Only active faculty of the course's department can be assigned.</p>
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create subject" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
