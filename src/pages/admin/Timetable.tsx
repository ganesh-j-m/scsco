import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import type { Academic, FacultyRow, SubjectRow, TimetableRow, Weekday } from "@/types/admin";

const DAYS: { value: Weekday; label: string }[] = [
  { value: "MON", label: "Monday" }, { value: "TUE", label: "Tuesday" }, { value: "WED", label: "Wednesday" }, { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" }, { value: "SAT", label: "Saturday" }, { value: "SUN", label: "Sunday" },
];
const dayLabel = (d: Weekday) => DAYS.find((x) => x.value === d)?.label ?? d;

const schema = z.object({
  day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  startTime: z.string().min(1, "Select a start time"),
  endTime: z.string().min(1, "Select an end time"),
  departmentId: z.string().min(1, "Select a department"),
  courseId: z.string().min(1, "Select a course"),
  year: z.string().regex(/^\d+$/),
  division: z.string().trim().min(1, "Enter a division"),
  subjectId: z.string().min(1, "Select a subject"),
  facultyId: z.string().min(1, "Select a faculty member"),
  room: z.string().trim().optional(),
});
type Values = z.infer<typeof schema>;
const empty: Values = { day: "MON", startTime: "", endTime: "", departmentId: "", courseId: "", year: "1", division: "A", subjectId: "", facultyId: "", room: "" };

export default function Timetable() {
  const toast = useToast();
  const { user } = useAuth();
  const isFaculty = user?.role === "FACULTY";
  const canWrite = true; // faculty can add / change their own lectures; the server blocks everything else
  const academic = useApi<Academic>("/lookups/academic");
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [day, setDay] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [year, setYear] = useState("");
  const [division, setDivision] = useState("");
  const divisionQ = useDebounce(division);
  const list = usePaged<TimetableRow>("/timetable", { search: q, day, departmentId, courseId, year, division: divisionQ }, 20);
  const [editing, setEditing] = useState<TimetableRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<TimetableRow | null>(null);
  const [busy, setBusy] = useState(false);

  const courseOptions = useMemo(() => (academic.data?.courses ?? []).filter((c) => !departmentId || c.departmentId === departmentId), [academic.data, departmentId]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/timetable/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to delete slot")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<TimetableRow>[] = [
    { key: "day", header: "Day", cell: (t) => <span className="font-medium">{dayLabel(t.day)}</span> },
    { key: "time", header: "Time", cell: (t) => `${t.startTime} - ${t.endTime}` },
    { key: "class", header: "Class", cell: (t) => <><p>{t.course?.name ?? "-"}</p><p className="text-xs text-slate-500">Year {t.year} · Div {t.division}</p></> },
    { key: "subject", header: "Subject", cell: (t) => <><p>{t.subject.name}</p><p className="text-xs text-slate-500">{t.subject.code}</p></> },
    { key: "faculty", header: "Faculty", cell: (t) => t.faculty.user.name },
    { key: "room", header: "Room", cell: (t) => t.room ?? "-" },
    ...(canWrite ? [{ key: "actions", header: "Actions", className: "text-right", cell: (t: TimetableRow) => (
      <RowActions actions={[
        { label: `Edit ${t.subject.code} slot`, icon: Pencil, onClick: () => setEditing(t) },
        { label: `Delete ${t.subject.code} slot`, icon: Trash2, danger: true, onClick: () => setDeleting(t) },
      ]} />
    ) }] : []),
  ];

  return (
    <>
      <PageHeader title="Timetable" subtitle={!isFaculty ? "Weekly lectures. Clashes for teacher, class and room are blocked." : "Your weekly lectures. When you add or change one, your class is notified."} actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> {isFaculty ? "Add lecture" : "Add slot"}</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by subject" aria-label="Search timetable" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by day" value={day} onChange={(e) => setDay(e.target.value)}><option value="">All days</option>{DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
          {!isFaculty && (academic.data?.departments.length ?? 0) > 1 && (
            <select className="input w-auto" aria-label="Filter by department" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setCourseId(""); }}><option value="">All departments</option>{academic.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          )}
          {!isFaculty && <select className="input w-auto" aria-label="Filter by course" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All courses</option>{courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <select className="input w-auto" aria-label="Filter by year" value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select>
          <input className="input w-24 uppercase" placeholder="Div" aria-label="Filter by division" value={division} onChange={(e) => setDivision(e.target.value)} />
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No timetable slots" emptyHint={canWrite ? "Add the first lecture slot." : "No lectures are assigned to you yet."} />
      </div>
      {isFaculty
        ? <FacultySlotModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
        : <SlotModal target={editing} academic={academic.data ?? undefined} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />}
      <ConfirmDialog open={!!deleting} title="Delete this slot?" message={deleting ? `${deleting.subject.name} on ${dayLabel(deleting.day)}, ${deleting.startTime}-${deleting.endTime} will be removed from the timetable.` : ""} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </>
  );
}

function SlotModal({ target, academic, onClose, onSaved }: { target: TimetableRow | "new" | null; academic?: Academic; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const slot = target && target !== "new" ? target : null;
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });
  const dept = watch("departmentId");
  const courseId = watch("courseId");
  const subjects = useApi<{ data: SubjectRow[] }>(courseId ? `/subjects?courseId=${courseId}&pageSize=100&sortBy=name&sortDir=asc` : null);
  const faculty = useApi<{ data: FacultyRow[] }>(dept ? `/faculty?departmentId=${dept}&status=ACTIVE&pageSize=100&sortBy=name&sortDir=asc` : null);
  const courses = (academic?.courses ?? []).filter((c) => c.departmentId === dept);

  useEffect(() => {
    setApiError(null);
    if (!target) return;
    reset(slot ? {
      day: slot.day, startTime: slot.startTime, endTime: slot.endTime, departmentId: slot.departmentId, courseId: slot.courseId, year: String(slot.year),
      division: slot.division, subjectId: slot.subject.id, facultyId: slot.faculty.id, room: slot.room ?? "",
    } : { ...empty, departmentId: academic?.departments.length === 1 ? academic.departments[0]!.id : "" });
  }, [target, slot, academic, reset]);

  const onSubject = (id: string) => {
    // Pre-select the subject's assigned teacher to save a step; it can still be changed.
    const s = subjects.data?.data.find((x) => x.id === id);
    if (s?.facultyId) setValue("facultyId", s.facultyId);
  };

  const onSubmit = async (v: Values) => {
    setApiError(null);
    const body = { ...v, year: Number(v.year), room: v.room ?? "" };
    try {
      if (isNew) await api("/timetable", { body });
      else await api(`/timetable/${slot!.id}`, { method: "PATCH", body });
      toast.success(isNew ? "Timetable slot created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={isNew ? "Add timetable slot" : "Edit timetable slot"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Day" id="t-day"><select id="t-day" className="input" {...register("day")}>{DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></FormField>
          <FormField label="Start time" id="t-start" error={errors.startTime?.message}><input id="t-start" type="time" className="input" {...register("startTime")} /></FormField>
          <FormField label="End time" id="t-end" error={errors.endTime?.message}><input id="t-end" type="time" className="input" {...register("endTime")} /></FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Department" id="t-dept" error={errors.departmentId?.message}>
            <select id="t-dept" className="input" {...register("departmentId", { onChange: () => { setValue("courseId", ""); setValue("subjectId", ""); setValue("facultyId", ""); } })}><option value="">Select</option>{academic?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </FormField>
          <FormField label="Course" id="t-course" error={errors.courseId?.message}>
            <select id="t-course" className="input" disabled={!dept} {...register("courseId", { onChange: () => setValue("subjectId", "") })}><option value="">Select</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </FormField>
          <FormField label="Year" id="t-year"><select id="t-year" className="input" {...register("year")}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}</select></FormField>
          <FormField label="Division" id="t-div" error={errors.division?.message}><input id="t-div" className="input uppercase" {...register("division")} /></FormField>
          <FormField label="Subject" id="t-sub" error={errors.subjectId?.message}>
            <select id="t-sub" className="input" disabled={!courseId} {...register("subjectId", { onChange: (e) => onSubject(e.target.value) })}><option value="">Select</option>{subjects.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name} (Sem {s.semester})</option>)}</select>
          </FormField>
          <FormField label="Faculty" id="t-fac" error={errors.facultyId?.message}>
            <select id="t-fac" className="input" disabled={!dept} {...register("facultyId")}><option value="">Select</option>{faculty.data?.data.map((f) => <option key={f.id} value={f.id}>{f.user.name}</option>)}</select>
          </FormField>
          <FormField label="Room" id="t-room" className="sm:col-span-2"><input id="t-room" className="input" placeholder="Room 101" {...register("room")} /></FormField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create slot" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

interface MySubject { id: string; name: string; code: string; semester: number; courseId: string; course: { name: string; departmentId: string } }

/** Simple "Add lecture" form for a teacher: only their own subjects; the class is notified when it is saved. */
function FacultySlotModal({ target, onClose, onSaved }: { target: TimetableRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const slot = target && target !== "new" ? target : null;
  const mine = useApi<{ data: MySubject[] }>(target ? "/timetable/my-subjects" : null);
  const blank = { subjectId: "", day: "MON" as Weekday, startTime: "", endTime: "", year: "1", division: "A", room: "" };
  const [v, setV] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof blank>(k: K, val: (typeof blank)[K]) => setV((p) => ({ ...p, [k]: val }));

  useEffect(() => {
    setErr(null);
    if (!target) return;
    setV(slot ? { subjectId: slot.subject.id, day: slot.day, startTime: slot.startTime, endTime: slot.endTime, year: String(slot.year), division: slot.division, room: slot.room ?? "" } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const subjects = mine.data?.data ?? [];
  const onSubject = (id: string) => {
    const s = subjects.find((x) => x.id === id);
    setV((p) => ({ ...p, subjectId: id, year: s ? String(Math.ceil(s.semester / 2)) : p.year }));
  };

  const save = async () => {
    const s = subjects.find((x) => x.id === v.subjectId);
    if (!s) return setErr("Select a subject");
    if (!v.startTime || !v.endTime) return setErr("Select the start and end time");
    if (v.endTime <= v.startTime) return setErr("End time must be after start time");
    if (!v.division.trim()) return setErr("Enter the division");
    setBusy(true); setErr(null);
    const body = {
      day: v.day, startTime: v.startTime, endTime: v.endTime, departmentId: s.course.departmentId, courseId: s.courseId,
      year: Number(v.year), division: v.division.trim().toUpperCase(), subjectId: s.id, facultyId: "self", room: v.room.trim(),
    };
    try {
      if (isNew) await api("/timetable", { body });
      else await api(`/timetable/${slot!.id}`, { method: "PATCH", body });
      toast.success(isNew ? "Lecture added. Your class has been notified." : "Lecture updated. Your class has been notified.");
      onSaved();
    } catch (e) { setErr(apiMessage(e, "Unable to save the lecture")); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!target} title={isNew ? "Add lecture" : "Edit lecture"} onClose={onClose}>
      <div className="space-y-3">
        {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {mine.data && subjects.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No subjects are assigned to you yet. Ask the HOD or admin to assign your subjects first.</p>}
        <FormField label="Subject" id="f-sub">
          <select id="f-sub" className="input" value={v.subjectId} onChange={(e) => onSubject(e.target.value)}>
            <option value="">Select</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.course.name} · Sem {s.semester}</option>)}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Day" id="f-day"><select id="f-day" className="input" value={v.day} onChange={(e) => set("day", e.target.value as Weekday)}>{DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></FormField>
          <FormField label="Start time" id="f-start"><input id="f-start" type="time" className="input" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} /></FormField>
          <FormField label="End time" id="f-end"><input id="f-end" type="time" className="input" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} /></FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Year" id="f-year"><select id="f-year" className="input" value={v.year} onChange={(e) => set("year", e.target.value)}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}</select></FormField>
          <FormField label="Division" id="f-div"><input id="f-div" className="input uppercase" maxLength={5} value={v.division} onChange={(e) => set("division", e.target.value)} /></FormField>
          <FormField label="Room" id="f-room"><input id="f-room" className="input" placeholder="Room 101" value={v.room} onChange={(e) => set("room", e.target.value)} /></FormField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || subjects.length === 0} onClick={save}>{busy && <Spinner />} {isNew ? "Add lecture" : "Save changes"}</button>
        </div>
      </div>
    </Modal>
  );
}
