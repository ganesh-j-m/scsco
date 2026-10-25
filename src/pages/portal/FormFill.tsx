import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { ErrorState, LoadingState, PageHeader, Spinner } from "@/components/ui";
import { FormRenderer } from "@/components/FormRenderer";
import { fmtDate } from "@/components/portal";
import type { PortalForm } from "@/types/admin";

export default function FormFill() {
  const { id = "" } = useParams();
  const toast = useToast();
  const [data, setData] = useState<PortalForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "new" | "edited">(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<PortalForm>(`/forms/portal/${id}`);
      setData(r);
      let draft: Record<string, unknown> | null = null;
      try { draft = r.answers ? null : JSON.parse(localStorage.getItem(`scsco:draft:${id}`) ?? "null"); } catch { /* storage unavailable */ }
      setAnswers(r.answers ?? draft ?? Object.fromEntries(r.fields.filter((f) => f.defaultValue).map((f) => [f.id, f.defaultValue])));
      setDone(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Unable to load the form"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // Keep an unsent draft on this device so a refresh or lost connection does not lose the answers.
  useEffect(() => {
    if (!data || done || Object.keys(answers).length === 0) return;
    const t = setTimeout(() => { try { localStorage.setItem(`scsco:draft:${id}`, JSON.stringify(answers)); } catch { /* ignore */ } }, 600);
    return () => clearTimeout(t);
  }, [answers, data, done, id]);

  const submit = async () => {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const r = await api<{ edited: boolean }>(`/forms/portal/${id}/submit`, { body: { answers } });
      try { localStorage.removeItem(`scsco:draft:${id}`); } catch { /* ignore */ }
      toast.success(r.edited ? "Your response was updated." : "Form submitted successfully.");
      setDone(r.edited ? "edited" : "new");
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && e.details?.length) {
        setErrors(Object.fromEntries(e.details.map((d) => [d.path, d.message])));
        setFormError("Please correct the highlighted answers.");
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      } else setFormError(e instanceof ApiError ? e.message : "Unable to submit the form");
    } finally { setBusy(false); }
  };

  if (error) return <><PageHeader title="Form" /><ErrorState message={error} onRetry={load} /><p className="mt-4 text-sm"><Link to="/portal/forms" className="text-brand-600 hover:underline">Back to forms</Link></p></>;
  if (!data) return <LoadingState rows={5} />;
  const { form, state } = data;

  if (done) return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">{done === "edited" ? "Response updated" : "Response submitted"}</h1>
      <p className="mt-1 text-sm text-slate-600">{form.title}</p>
      <div className="mt-5 flex justify-center gap-2"><Link className="btn-secondary" to="/portal/forms">Back to forms</Link>{(form.allowMultipleSubmissions || form.allowEditAfterSubmission) && <button className="btn-secondary" onClick={() => void load()}>{form.allowMultipleSubmissions ? "Submit another" : "Edit response"}</button>}</div>
    </div>
  );

  const locked = state !== "open" || !data.canSubmit;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={form.title} subtitle={form.description ?? undefined} />
      {form.instructions && <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{form.instructions}</p>}
      {state === "upcoming" && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This form opens on {fmtDate(form.startAt)}.</p>}
      {state === "ended" && <p role="status" className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">This form is closed.</p>}
      {state === "open" && data.submitted > 0 && !data.canSubmit && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">You have already submitted this form.</p>}
      {formError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
      <div className="card p-5">
        <FormRenderer onUploadFile={async (_fid, file) => { const fd = new FormData(); fd.append("file", file); try { return await api<{ id: string; name: string }>(`/forms/portal/${id}/upload`, { form: fd }); } catch (e) { throw new Error(e instanceof ApiError ? e.message : "Upload failed"); } }} sections={data.sections} fields={data.fields} answers={answers} errors={errors} disabled={locked} onChange={(fid, v) => { setAnswers((a) => ({ ...a, [fid]: v })); setErrors((er) => { const { [fid]: _x, ...rest } = er; return rest; }); }} />
        {!locked && <div className="mt-6 flex justify-end gap-2"><Link className="btn-secondary" to="/portal/forms">Cancel</Link><button className="btn-primary" disabled={busy} onClick={submit}>{busy && <Spinner />} {data.submitted > 0 && !form.allowMultipleSubmissions ? "Update response" : "Submit"}</button></div>}
      </div>
    </div>
  );
}
