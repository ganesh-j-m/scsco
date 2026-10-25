import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useToast } from "@/context/ToastContext";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";
import { approvalTone, fmtDate, pretty } from "@/components/portal";
import { useAuth } from "@/context/AuthContext";
import type { CertificateRow } from "@/types/admin";

export default function PortalCertificates() {
  const { user } = useAuth();
  const toast = useToast();
  const isStudent = user?.role === "STUDENT";
  const types = useApi<{ data: string[] }>("/certificates/types");
  const mine = useApi<{ data: CertificateRow[] }>(isStudent ? "/certificates/my" : null);
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/certificates", { body: { type, reason } });
      toast.success("Request submitted successfully.");
      setType(""); setReason("");
      void mine.reload();
    } catch (e) { setError(apiMessage(e, "Unable to submit the request")); }
    finally { setBusy(false); }
  };

  if (!isStudent) return <><PageHeader title="Certificates" /><div className="card"><EmptyState title="Students only" hint="Certificate requests can be made from a student account." /></div></>;

  return (
    <>
      <PageHeader title="Certificates" subtitle="Request a certificate and track its status" />
      <div className="card mb-6 max-w-2xl space-y-3 p-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <FormField label="Certificate" id="c-type"><select id="c-type" className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">Select</option>{types.data?.data.map((t) => <option key={t}>{t}</option>)}</select></FormField>
        <FormField label="Reason (optional)" id="c-reason"><textarea id="c-reason" rows={2} className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
        <div className="flex justify-end"><button className="btn-primary" disabled={!type || busy} onClick={submit}>{busy && <Spinner />} Submit request</button></div>
      </div>
      <h2 className="mb-3 font-medium">My requests</h2>
      {mine.loading ? <LoadingState rows={3} /> : mine.error ? <ErrorState message={mine.error} onRetry={mine.reload} /> : !mine.data?.data.length ? <div className="card"><EmptyState title="No requests yet" /></div> : (
        <div className="card divide-y divide-slate-100">
          {mine.data.data.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
              <div><p className="font-medium">{c.type}</p><p className="text-xs text-slate-500">Requested {fmtDate(c.createdAt)}{c.issuedAt ? ` · Approved ${fmtDate(c.issuedAt)}` : ""}</p>{c.remarks && <p className="mt-1 text-xs text-slate-600">Remarks: {c.remarks}</p>}</div>
              <Badge tone={approvalTone(c.status)}>{pretty(c.status)}</Badge>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
