import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useLookup } from "@/hooks/useLookup";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import { fmtDate } from "@/components/portal";
import type { ExamRow, SubjectRow } from "@/types/admin";
import type { Paged } from "@/types";

export default function Examinations() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [courseId, setCourseId] = useState("");
  const [when, setWhen] = useState("");
  const courses = useLookup("courses");
  const list = usePaged<ExamRow>("/exams", { search: q, courseId, when });
  const [editing, setEditing] = useState<ExamRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ExamRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/exams/${deleting.id}`, { method: "DELETE" }); toast.success("Record deleted successfully."); setDeleting(null); void list.reload(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<ExamRow>[] = [
    { key: "name", header: "Exam", cell: (x) => <><p className="font-medium">{x.name}</p><p className="text-xs text-slate-500">{x.course.name} · Sem {x.semester}</p></> },
    { key: "subject", header: "Subject", cell: (x) => x.subject.name },
    { key: "date", header: "Date", cell: (x) => fmtDate(x.date) },
    { key: "time", header: "Time", cell: (x) => `${x.startTime} – ${x.endTime}` },
    { key: "room", header: "Room", cell: (x) => x.room ?? "—" },
    { key: "actions", header: "Actions", className: "text-right", cell: (x) => <RowActions actions={[{ label: `Edit ${x.name}`, icon: Pencil, onClick: () => setEditing(x) }, { label: `Delete ${x.name}`, icon: Trash2, danger: true, onClick: () => setDeleting(x) }]} /> },
  ];

  return (
    <>
      <PageHeader title="Examinations" subtitle="Exam schedule with room clash detection" actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Schedule exam</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search exam or subject" aria-label="Search exams" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by course" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input w-auto" aria-label="Filter by time" value={when} onChange={(e) => setWhen(e.target.value)}><option value="">All dates</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No exams scheduled" emptyHint="Schedule the first exam." />
      </div>
      <ExamModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this exam?" message={`${deleting?.name} will be removed. This is blocked once results are entered.`} busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}

const schema = z.object({
  name: z.string().trim().min(2, "Enter an exam name"),
  courseId: z.string().min(1, "Choose a course"),
  subjectId: z.string().min(1, "Choose a subject"),
  date: z.string().min(1, "Choose a date"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  room: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
});
type Values = z.infer<typeof schema>;
const empty: Values = { name: "", courseId: "", subjectId: "", date: "", startTime: "10:00", endTime: "13:00", room: "", instructions: "" };

function ExamModal({ target, onClose, onSaved }: { target: ExamRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const exam = target && target !== "new" ? target : null;
  const courses = useLookup("courses");
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });
  const courseId = watch("courseId");
  const subjectId = watch("subjectId");
  const subjects = useApi<Paged<SubjectRow>>(courseId ? `/subjects?courseId=${courseId}&pageSize=100&sortBy=semester&sortDir=asc` : null);
  const chosen = subjects.data?.data.find((s) => s.id === subjectId);

  useEffect(() => {
    setError(null);
    if (target) reset(exam ? { name: exam.name, courseId: exam.courseId, subjectId: exam.subjectId, date: exam.date.slice(0, 10), startTime: exam.startTime, endTime: exam.endTime, room: exam.room ?? "", instructions: exam.instructions ?? "" } : empty);
  }, [target, exam, reset]);

  const submit = async (v: Values) => {
    if (!chosen) { setError("Choose a subject"); return; }
    setError(null);
    try {
      const body = { ...v, semester: chosen.semester };
      if (exam) await api(`/exams/${exam.id}`, { method: "PATCH", body }); else await api("/exams", { body });
      toast.success(exam ? "Changes saved successfully." : "Exam scheduled successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={exam ? "Edit exam" : "Schedule exam"} onClose={onClose} wide>
      <form onSubmit={handleSubmit(submit)} className="space-y-3" noValidate>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <FormField label="Exam name" id="e-name" error={errors.name?.message}><input id="e-name" className="input" placeholder="Internal Assessment 1" {...register("name")} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Course" id="e-course" error={errors.courseId?.message}><select id="e-course" className="input" {...register("courseId", { onChange: () => setValue("subjectId", "") })}><option value="">Select</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="Subject" id="e-subject" error={errors.subjectId?.message}><select id="e-subject" className="input" disabled={!courseId} {...register("subjectId")}><option value="">Select</option>{subjects.data?.data.map((s) => <option key={s.id} value={s.id}>Sem {s.semester} · {s.name}</option>)}</select></FormField>
          <FormField label="Date" id="e-date" error={errors.date?.message}><input id="e-date" type="date" className="input" {...register("date")} /></FormField>
          <FormField label="Room (optional)" id="e-room"><input id="e-room" className="input" {...register("room")} /></FormField>
          <FormField label="Start time" id="e-start" error={errors.startTime?.message}><input id="e-start" type="time" className="input" {...register("startTime")} /></FormField>
          <FormField label="End time" id="e-end" error={errors.endTime?.message}><input id="e-end" type="time" className="input" {...register("endTime")} /></FormField>
        </div>
        <FormField label="Instructions (optional)" id="e-inst"><textarea id="e-inst" rows={3} className="input" {...register("instructions")} /></FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {exam ? "Save changes" : "Schedule exam"}</button>
        </div>
      </form>
    </Modal>
  );
}
