import { useState } from "react";
import { Download, Paperclip } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Badge, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";
import { useChildren } from "@/components/portal";
import type { PortalCourseWork } from "@/types/admin";

export function PortalAssignments() { return <Page kind="ASSIGNMENT" />; }
export function PortalStudyMaterial() { return <Page kind="MATERIAL" />; }

const when = (d: string) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function Page({ kind }: { kind: "ASSIGNMENT" | "MATERIAL" }) {
  const isA = kind === "ASSIGNMENT";
  const { user } = useAuth();
  const kids = useChildren();
  const list = useApi<{ data: PortalCourseWork[] }>(kids.studentId ? `/coursework/portal?kind=${kind}&studentId=${kids.studentId}` : null);
  const [submitting, setSubmitting] = useState<PortalCourseWork | null>(null);
  const canSubmit = isA && user?.role === "STUDENT"; // parents can view but only the student submits

  if (kids.loading) return <LoadingState rows={4} />;
  if (kids.error) return <ErrorState message={kids.error} onRetry={kids.reload} />;
  const title = isA ? "Assignments" : "Study material";
  if (!kids.kids.length) return <><PageHeader title={title} /><div className="card"><EmptyState title="No student linked" hint="This page is for student and parent accounts." /></div></>;

  return (
    <>
      <PageHeader title={title} subtitle={isA ? "Work given by your teachers. Upload your answer before the due time." : "Notes and documents shared by your teachers"} />
      {kids.picker}
      {list.loading ? <LoadingState rows={4} /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.data.length ? (
        <div className="card"><EmptyState title={isA ? "No assignments" : "No study material"} hint="New items appear here when your teachers publish them." /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.data.map((w) => {
            const overdue = !!w.dueDate && new Date(w.dueDate) < new Date() && !w.submission;
            return (
              <div key={w.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium">{w.title}</p><p className="text-xs text-slate-500">{w.subject.name} · {new Date(w.createdAt).toLocaleDateString("en-IN")}</p></div>
                  {isA && (w.submission ? <Badge tone={w.submission.marks !== null ? "green" : "blue"}>{w.submission.marks !== null ? "Checked" : "Submitted"}</Badge> : overdue ? <Badge tone="red">Overdue</Badge> : <Badge tone="amber">Pending</Badge>)}
                </div>
                {w.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{w.description}</p>}
                {isA && w.dueDate && <p className="mt-2 text-xs text-slate-500">Due {when(w.dueDate)}{w.maxMarks ? ` · ${w.maxMarks} marks` : ""}</p>}
                {w.hasFile && <a className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline" href={`/api/coursework/${w.id}/file?studentId=${kids.studentId}`} download><Download className="h-4 w-4" aria-hidden />{w.fileName}</a>}
                {isA && w.submission && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" aria-hidden />{w.submission.fileName}</p>
                    <p className="text-xs text-slate-500">Submitted {when(w.submission.submittedAt)} {w.submission.late && <Badge tone="red">Late</Badge>}</p>
                    {w.submission.marks !== null && <p className="mt-1 font-medium">Marks: {w.submission.marks}{w.maxMarks ? ` / ${w.maxMarks}` : ""}</p>}
                    {w.submission.feedback && <p className="text-slate-600">“{w.submission.feedback}”</p>}
                  </div>
                )}
                {canSubmit && w.submission?.marks == null && !w.submission?.feedback && (
                  <button className="btn-secondary mt-3" onClick={() => setSubmitting(w)}>{w.submission ? "Replace my file" : "Submit my work"}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {submitting && <SubmitModal item={submitting} onClose={() => setSubmitting(null)} onDone={() => { setSubmitting(null); list.reload(); }} />}
    </>
  );
}

function SubmitModal({ item, onClose, onDone }: { item: PortalCourseWork; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    const fd = new FormData(); fd.append("file", file); fd.append("note", note);
    try {
      const r = await api<{ late: boolean }>(`/coursework/portal/${item.id}/submit`, { form: fd });
      toast.success(r.late ? "Submitted. This is after the due time, so it is marked late." : "Submitted successfully.");
      onDone();
    } catch (e) { setError(apiMessage(e, "Unable to submit")); }
    finally { setBusy(false); }
  };
  return (
    <Modal open title={`Submit · ${item.title}`} onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <FormField label="Your file" id="sub-file">
        <input id="sub-file" type="file" className="input" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <p className="mt-1 text-xs text-slate-500">PDF, Word, PowerPoint, Excel, PNG or JPG, up to 10 MB. You can replace it until your teacher adds marks.</p>
      </FormField>
      <FormField label="Note to teacher (optional)" id="sub-note" className="mt-3"><textarea id="sub-note" rows={3} className="input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
      <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !file} onClick={send}>{busy && <Spinner />} Submit</button></div>
    </Modal>
  );
}
