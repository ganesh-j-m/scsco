import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { Modal, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";

/** Status + remarks dialog shared by admissions, certificates and grievances. */
export function ReviewModal({ open, title, summary, endpoint, statuses, field, initialStatus, initialText, onClose, onSaved }: {
  open: boolean; title: string; summary: ReactNode; endpoint: string; statuses: { value: string; label: string }[];
  field: "remarks" | "response"; initialStatus: string; initialText?: string | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState(initialText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setStatus(initialStatus); setText(initialText ?? ""); setError(null); } }, [open, initialStatus, initialText]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, { method: "PATCH", body: { status, [field]: text } });
      toast.success("Changes saved successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{summary}</div>
      <div className="space-y-3">
        <FormField label="Status" id="rv-status"><select id="rv-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></FormField>
        <FormField label={field === "response" ? "Response to the user" : "Remarks"} id="rv-text"><textarea id="rv-text" rows={4} className="input" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} Save</button>
      </div>
    </Modal>
  );
}

export const APPROVAL_STATUSES = [
  { value: "PENDING", label: "Pending" }, { value: "IN_REVIEW", label: "In review" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" },
];
export const GRIEVANCE_STATUSES = [
  { value: "OPEN", label: "Open" }, { value: "IN_REVIEW", label: "In review" }, { value: "RESOLVED", label: "Resolved" }, { value: "REJECTED", label: "Rejected" },
];
