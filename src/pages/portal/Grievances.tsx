import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useToast } from "@/context/ToastContext";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";
import { approvalTone, fmtDate, pretty } from "@/components/portal";
import type { GrievanceRow } from "@/types/admin";

export default function PortalGrievances() {
  const toast = useToast();
  const cats = useApi<{ data: string[] }>("/grievances/categories");
  const mine = useApi<{ data: GrievanceRow[] }>("/grievances/my");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/grievances", { body: { category, subject, description } });
      toast.success("Grievance submitted successfully.");
      setCategory(""); setSubject(""); setDescription("");
      void mine.reload();
    } catch (e) { setError(apiMessage(e, "Unable to submit the grievance")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Grievances" subtitle="Raise an issue with the college. Only you and the administration can see it." />
      <div className="card mb-6 max-w-2xl space-y-3 p-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Category" id="g-cat"><select id="g-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Select</option>{cats.data?.data.map((c) => <option key={c}>{c}</option>)}</select></FormField>
          <FormField label="Subject" id="g-sub"><input id="g-sub" className="input" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} /></FormField>
        </div>
        <FormField label="Describe the issue" id="g-desc"><textarea id="g-desc" rows={4} className="input" maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
        <div className="flex justify-end"><button className="btn-primary" disabled={busy || !category || subject.trim().length < 4 || description.trim().length < 10} onClick={submit}>{busy && <Spinner />} Submit grievance</button></div>
      </div>
      <h2 className="mb-3 font-medium">My grievances</h2>
      {mine.loading ? <LoadingState rows={3} /> : mine.error ? <ErrorState message={mine.error} onRetry={mine.reload} /> : !mine.data?.data.length ? <div className="card"><EmptyState title="No grievances submitted" /></div> : (
        <div className="card divide-y divide-slate-100">
          {mine.data.data.map((g) => (
            <div key={g.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{g.subject}</p><p className="text-xs text-slate-500">{g.category} · {fmtDate(g.createdAt)}</p></div><Badge tone={approvalTone(g.status)}>{pretty(g.status)}</Badge></div>
              {g.response && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700"><strong>Response:</strong> {g.response}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
