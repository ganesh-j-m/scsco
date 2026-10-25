import { useEffect, useState } from "react";
import { Download, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import { fmtDate, pretty } from "@/components/portal";
import type { CourseWorkOptions, CourseWorkRoster, CourseWorkRow } from "@/types/admin";

type Kind = "ASSIGNMENT" | "MATERIAL";
const kb = (n: number | null) => (n === null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const toLocalInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const tone = (s: string) => (s === "PUBLISHED" ? "green" : s === "ARCHIVED" ? "slate" : "amber");

export function Assignments() { return <CourseWorkAdmin kind="ASSIGNMENT" />; }
export function StudyMaterial() { return <CourseWorkAdmin kind="MATERIAL" />; }

function CourseWorkAdmin({ kind }: { kind: Kind }) {
  const toast = useToast();
  const isA = kind === "ASSIGNMENT";
  const noun = isA ? "assignment" : "study material";
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const list = usePaged<CourseWorkRow>("/coursework", { kind, search: q });
  const [editing, setEditing] = useState<CourseWorkRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<CourseWorkRow | null>(null);
  const [viewing, setViewing] = useState<CourseWorkRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/coursework/${deleting.id}`, { method: "DELETE" }); toast.success("Record deleted successfully."); setDeleting(null); void list.reload(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<CourseWorkRow>[] = [
    { key: "title", header: isA ? "Assignment" : "Material", cell: (r) => <><p className="font-medium">{r.title}</p><p className="text-xs text-slate-500">{r.fileName ? `${r.fileName} · ${kb(r.fileSize)}` : "No attachment"}</p></> },
    { key: "class", header: "Class", cell: (r) => <><p>{r.subject.name}</p><p className="text-xs text-slate-500">{r.subject.course.name} · Year {r.year} · {r.division ? `Div ${r.division}` : "All divisions"}</p></> },
    ...(isA ? [{ key: "due", header: "Due", cell: (r: CourseWorkRow) => (r.dueDate ? new Date(r.dueDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—") },
      { key: "subs", header: "Submitted", cell: (r: CourseWorkRow) => r._count.submissions }] : []),
    { key: "status", header: "Status", cell: (r) => <Badge tone={tone(r.status)}>{pretty(r.status)}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (r) => (
      <RowActions actions={[
        ...(isA ? [{ label: "Submissions", icon: Users, onClick: () => setViewing(r) }] : []),
        ...(r.hasFile ? [{ label: "Download file", icon: Download, onClick: () => { window.location.href = `/api/coursework/${r.id}/file`; } }] : []),
        { label: "Edit", icon: Pencil, onClick: () => setEditing(r) },
        { label: "Delete", icon: Trash2, danger: true, onClick: () => setDeleting(r) },
      ]} />
    ) },
  ];

  return (
    <>
      <PageHeader title={isA ? "Assignments" : "Study material"} subtitle={isA ? "Give work to a class, collect files and add marks" : "Share notes and documents with a class"}
        actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New {noun}</button>} />
      <div className="card">
        <div className="border-b border-slate-200 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder={`Search ${noun}`} aria-label={`Search ${noun}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle={`No ${noun} yet`} emptyHint={`Create the first ${noun} for your class.`} />
      </div>
      {editing && <EditModal kind={kind} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />}
      {viewing && <SubmissionsModal item={viewing} onClose={() => { setViewing(null); void list.reload(); }} />}
      <ConfirmDialog open={!!deleting} title={`Delete this ${noun}?`} message={`"${deleting?.title}"${isA ? ", all submissions and their files" : " and its file"} will be permanently removed.`} busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}

function EditModal({ kind, item, onClose, onSaved }: { kind: Kind; item: CourseWorkRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isA = kind === "ASSIGNMENT";
  const opts = useApi<CourseWorkOptions>("/coursework/options");
  const [f, setF] = useState({
    title: item?.title ?? "", description: item?.description ?? "", subjectId: item?.subjectId ?? "", year: String(item?.year ?? 1), division: item?.division ?? "",
    dueDate: toLocalInput(item?.dueDate ?? null), maxMarks: item?.maxMarks ? String(item.maxMarks) : "", status: item?.status ?? "PUBLISHED",
  });
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const subject = opts.data?.subjects.find((s) => s.id === f.subjectId);
  useEffect(() => { if (subject && Number(f.year) > subject.course.durationYears) setF((p) => ({ ...p, year: "1" })); }, [subject, f.year]);

  const save = async () => {
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append("kind", kind); fd.append("title", f.title); fd.append("description", f.description); fd.append("subjectId", f.subjectId);
    fd.append("year", f.year); fd.append("division", f.division); fd.append("status", f.status);
    if (isA) { fd.append("dueDate", f.dueDate ? new Date(f.dueDate).toISOString() : ""); fd.append("maxMarks", f.maxMarks); }
    if (file) fd.append("file", file);
    if (removeFile) fd.append("removeFile", "true");
    try {
      await api(item ? `/coursework/${item.id}` : "/coursework", { method: item ? "PATCH" : "POST", form: fd });
      toast.success(item ? "Changes saved successfully." : "Record created successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e, "Unable to save")); }
    finally { setBusy(false); }
  };

  const valid = f.title.trim().length >= 3 && !!f.subjectId && (item ? true : isA || !!file);
  return (
    <Modal open title={`${item ? "Edit" : "New"} ${isA ? "assignment" : "study material"}`} onClose={onClose} wide>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {opts.loading ? <LoadingState rows={3} /> : opts.error ? <ErrorState message={opts.error} onRetry={opts.reload} /> : !opts.data?.subjects.length ? (
        <EmptyState title="No subjects available" hint="You can only post for subjects assigned to you. Ask the admin to assign a subject." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Title" id="cw-title" className="sm:col-span-2"><input id="cw-title" className="input" maxLength={150} value={f.title} onChange={set("title")} /></FormField>
          <FormField label="Subject" id="cw-subject"><select id="cw-subject" className="input" value={f.subjectId} onChange={set("subjectId")}><option value="">Select a subject</option>{opts.data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.course.name}</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Year" id="cw-year"><select id="cw-year" className="input" value={f.year} onChange={set("year")}>{Array.from({ length: subject?.course.durationYears ?? 3 }, (_, i) => <option key={i + 1} value={i + 1}>Year {i + 1}</option>)}</select></FormField>
            <FormField label="Division" id="cw-div"><input id="cw-div" className="input" maxLength={5} placeholder="All" value={f.division} onChange={set("division")} /></FormField>
          </div>
          {isA && <FormField label="Due date and time" id="cw-due"><input id="cw-due" type="datetime-local" className="input" value={f.dueDate} onChange={set("dueDate")} /></FormField>}
          {isA && <FormField label="Maximum marks" id="cw-marks"><input id="cw-marks" inputMode="numeric" className="input" value={f.maxMarks} onChange={set("maxMarks")} /></FormField>}
          <FormField label="Description" id="cw-desc" className="sm:col-span-2"><textarea id="cw-desc" rows={3} className="input" maxLength={3000} value={f.description} onChange={set("description")} /></FormField>
          <FormField label={isA ? "Attachment (optional)" : "File"} id="cw-file" className="sm:col-span-2">
            <input id="cw-file" type="file" className="input" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-slate-500">PDF, Word, PowerPoint, Excel, PNG or JPG, up to 10 MB.{item?.fileName && !file && ` Current file: ${item.fileName}.`}</p>
            {item?.hasFile && isA && !file && <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={removeFile} onChange={(e) => setRemoveFile(e.target.checked)} /> Remove the current attachment</label>}
          </FormField>
          <FormField label="Status" id="cw-status"><select id="cw-status" className="input" value={f.status} onChange={set("status")}><option value="PUBLISHED">Published (students can see it)</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select></FormField>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy && <Spinner />} Save</button></div>
    </Modal>
  );
}

function SubmissionsModal({ item, onClose }: { item: CourseWorkRow; onClose: () => void }) {
  const toast = useToast();
  const data = useApi<CourseWorkRoster>(`/coursework/${item.id}/submissions`);
  const [grading, setGrading] = useState<{ id: string; name: string; marks: string; feedback: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!grading) return;
    setBusy(true);
    try {
      await api(`/coursework/${item.id}/submissions/${grading.id}`, { method: "PATCH", body: { marks: grading.marks, feedback: grading.feedback } });
      toast.success("Marks saved successfully."); setGrading(null); data.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to save marks")); }
    finally { setBusy(false); }
  };
  return (
    <Modal open title={`Submissions · ${item.title}`} onClose={onClose} wide>
      {grading ? (
        <div className="space-y-3">
          <p className="font-medium">Marks · {grading.name}</p>
          <FormField label={`Marks${item.maxMarks ? ` (out of ${item.maxMarks})` : ""}`} id="gr-marks"><input id="gr-marks" inputMode="numeric" className="input" value={grading.marks} onChange={(e) => setGrading({ ...grading, marks: e.target.value })} /></FormField>
          <FormField label="Feedback" id="gr-fb"><textarea id="gr-fb" rows={3} className="input" maxLength={1000} value={grading.feedback} onChange={(e) => setGrading({ ...grading, feedback: e.target.value })} /></FormField>
          <p className="text-xs text-slate-500">After marks are saved the student can no longer replace their file.</p>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setGrading(null)}>Back</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} Save</button></div>
        </div>
      ) : data.loading ? <LoadingState rows={4} /> : data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : data.data && (
        <>
          <p className="mb-3 text-sm text-slate-600">{data.data.submitted} of {data.data.total} students submitted{item.maxMarks ? ` · out of ${item.maxMarks} marks` : ""}</p>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Submission</th><th className="px-3 py-2">Marks</th><th className="px-3 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.rows.map(({ student, submission: s }) => (
                  <tr key={student.id}>
                    <td className="px-3 py-2"><p className="font-medium">{student.name}</p><p className="text-xs text-slate-500">{student.studentId} · Div {student.division}</p></td>
                    <td className="px-3 py-2">{s ? <><a className="text-brand-600 hover:underline" href={`/api/coursework/${item.id}/submissions/${s.id}/file`} download>{s.fileName}</a><p className="text-xs text-slate-500">{new Date(s.submittedAt).toLocaleString("en-IN")} {s.late && <Badge tone="red">Late</Badge>}</p>{s.note && <p className="text-xs text-slate-600">“{s.note}”</p>}</> : <span className="text-slate-400">Not submitted</span>}</td>
                    <td className="px-3 py-2">{s?.marks ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{s && <button className="text-brand-600 hover:underline" onClick={() => setGrading({ id: s.id, name: student.name, marks: s.marks?.toString() ?? "", feedback: s.feedback ?? "" })}>{s.marks === null ? "Add marks" : "Edit"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
