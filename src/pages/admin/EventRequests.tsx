import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { PageHeader, Spinner } from "@/components/ui";
import { call, errText, fmtDate, StatusBadge, Timeline, type EventReq } from "@/components/eventRequests";

type Decision = "APPROVE" | "REJECT" | "CHANGES" | "MEET";

export default function EventRequestsAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast); toastRef.current = toast;
  const [rows, setRows] = useState<EventReq[] | null>(null);
  const [filter, setFilter] = useState("ACTION");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventReq | null>(null);
  const [message, setMessage] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try { setRows((await call<{ data: EventReq[] }>("/")).data); }
    catch (e) { setRows([]); toastRef.current.error(errText(e, "Unable to load")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setDetail(null); setMessage(""); setProposedDate("");
    try { setDetail(await call<EventReq>(`/${id}`)); } catch (e) { toastRef.current.error(errText(e, "Unable to load")); }
  };

  const decide = async (r: EventReq, decision: Decision) => {
    if (decision !== "APPROVE" && message.trim().length < 3) { toastRef.current.error("Please write a short message for the student."); return; }
    setBusy(true);
    try {
      await call(`/${r.id}/decide`, "POST", { decision, message, proposedDate: decision === "CHANGES" ? proposedDate : "" });
      toastRef.current.success("Done. The student has been notified.");
      setOpen(null); await load();
    } catch (e) { toastRef.current.error(errText(e, "Unable to save")); }
    finally { setBusy(false); }
  };

  const shown = (rows ?? []).filter((r) => (filter === "ACTION" ? !!r.canAct : filter === "ALL" ? true : r.status === filter));
  const actionCount = (rows ?? []).filter((r) => !!r.canAct).length;

  return (
    <>
      <PageHeader title="Event requests" subtitle={user?.role === "HOD" ? "Event permission requests from your department's students" : "Event permission requests waiting for the Principal"}
        actions={<select className="input w-auto" aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="ACTION">Needs my decision ({actionCount})</option><option value="ALL">All</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CHANGES_REQUESTED">Change asked</option>
        </select>} />
      {rows === null ? <Spinner /> : shown.length === 0 ? <p className="text-sm text-slate-500">{filter === "ACTION" ? "Nothing is waiting for you." : "No requests."}</p> : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="card p-4">
              <button className="flex w-full flex-wrap items-start justify-between gap-2 text-left" onClick={() => toggle(r.id)} aria-expanded={open === r.id}>
                <span>
                  <span className="block font-medium">{r.title}</span>
                  <span className="text-xs text-slate-500">{r.requesterName} · {r.requesterClass}</span>
                  <span className="block text-xs text-slate-500">{fmtDate(r.eventDate)}{r.endDate ? ` - ${fmtDate(r.endDate)}` : ""} · {r.venue}</span>
                </span>
                <StatusBadge status={r.status} />
              </button>
              {open === r.id && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <p className="whitespace-pre-line text-sm text-slate-600">{r.description}</p>
                  {(r.expectedParticipants || r.budget) && <p className="text-xs text-slate-500">{[r.expectedParticipants ? `${r.expectedParticipants} participants` : "", r.budget ? `Budget: ${r.budget}` : ""].filter(Boolean).join(" · ")}</p>}
                  {detail?.id === r.id && detail.actions ? <Timeline actions={detail.actions} /> : <Spinner />}

                  {r.canAct && (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                      <label className="block text-xs font-medium text-slate-600" htmlFor={`m-${r.id}`}>Message to the student (needed for everything except Approve)</label>
                      <textarea id={`m-${r.id}`} rows={2} className="input" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
                        placeholder={r.canAct === "PRINCIPAL" ? "Reason, or office time e.g. Tomorrow 11 AM to 12 PM" : "Reason, or what to change"} />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-slate-600" htmlFor={`d-${r.id}`}>Suggested new date (for Change date):</label>
                        <input id={`d-${r.id}`} type="date" min={today} className="input w-auto py-1" value={proposedDate} onChange={(e) => setProposedDate(e.target.value)} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-primary" disabled={busy} onClick={() => decide(r, "APPROVE")}>{r.canAct === "HOD" ? "Approve and send to Principal" : "Approve event"}</button>
                        <button className="btn-secondary" disabled={busy} onClick={() => decide(r, "CHANGES")}>Change date / ask change</button>
                        {r.canAct === "PRINCIPAL" && <button className="btn-secondary" disabled={busy} onClick={() => decide(r, "MEET")}>Call to office</button>}
                        <button className="btn-secondary text-red-600" disabled={busy} onClick={() => decide(r, "REJECT")}>Reject</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
