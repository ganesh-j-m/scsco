import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { PageHeader, Spinner } from "@/components/ui";
import { FormField } from "@/components/forms";
import { call, dateInput, errText, fmtDate, StatusBadge, Timeline, type EventReq } from "@/components/eventRequests";

const blank = { title: "", description: "", eventDate: "", endDate: "", venue: "", expectedParticipants: "", budget: "" };
type Form = typeof blank;

export default function PortalEventRequests() {
  const toast = useToast();
  const toastRef = useRef(toast); toastRef.current = toast;
  const [rows, setRows] = useState<EventReq[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventReq | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try { setRows((await call<{ data: EventReq[] }>("/")).data); }
    catch (e) { setRows([]); toastRef.current.error(errText(e, "Unable to load")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setDetail(null);
    try { setDetail(await call<EventReq>(`/${id}`)); } catch (e) { toastRef.current.error(errText(e, "Unable to load")); }
  };

  const set = <K extends keyof Form>(k: K, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const startEdit = (r: EventReq) => {
    const asked = [...(r.actions ?? [])].reverse().find((a) => a.proposedDate);
    setEditId(r.id); setError(null);
    setForm({ title: r.title, description: r.description, eventDate: dateInput(asked?.proposedDate ?? r.eventDate), endDate: dateInput(r.endDate), venue: r.venue, expectedParticipants: r.expectedParticipants ? String(r.expectedParticipants) : "", budget: r.budget ?? "" });
  };

  const submit = async () => {
    if (!form) return;
    setBusy(true); setError(null);
    try {
      if (editId) await call(`/${editId}`, "PATCH", form); else await call("/", "POST", form);
      toastRef.current.success(editId ? "Updated and sent again." : "Request sent to your HOD.");
      setForm(null); setEditId(null); setOpen(null); await load();
    } catch (e) { setError(errText(e, "Unable to send the request")); }
    finally { setBusy(false); }
  };

  const cancel = async (r: EventReq) => {
    if (!window.confirm("Cancel this event request?")) return;
    try { await call(`/${r.id}/cancel`, "POST"); toastRef.current.success("Request cancelled."); setOpen(null); await load(); }
    catch (e) { toastRef.current.error(errText(e, "Unable to cancel")); }
  };

  return (
    <>
      <PageHeader title="Event requests" subtitle="Ask for permission online. Your HOD approves first, then the Principal." />
      {!form && <button className="btn-primary mb-4" onClick={() => { setEditId(null); setError(null); setForm({ ...blank }); }}><Plus className="h-4 w-4" /> New event request</button>}

      {form && (
        <div className="card mb-6 max-w-3xl space-y-3 p-4">
          <h2 className="font-medium">{editId ? "Update your request" : "New event request"}</h2>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <FormField label="Event name" id="er-title"><input id="er-title" className="input" maxLength={150} value={form.title} onChange={(e) => set("title", e.target.value)} /></FormField>
          <FormField label="Plan / details (what, who, how)" id="er-desc"><textarea id="er-desc" rows={5} className="input" maxLength={3000} value={form.description} onChange={(e) => set("description", e.target.value)} /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Event date" id="er-date"><input id="er-date" type="date" min={today} className="input" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} /></FormField>
            <FormField label="End date (if more than a day)" id="er-end"><input id="er-end" type="date" min={form.eventDate || today} className="input" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></FormField>
            <FormField label="Venue" id="er-venue"><input id="er-venue" className="input" maxLength={150} value={form.venue} onChange={(e) => set("venue", e.target.value)} /></FormField>
            <FormField label="Expected participants (optional)" id="er-pax"><input id="er-pax" type="number" min={1} className="input" value={form.expectedParticipants} onChange={(e) => set("expectedParticipants", e.target.value)} /></FormField>
            <FormField label="Budget (optional)" id="er-budget"><input id="er-budget" className="input" maxLength={100} placeholder="e.g. Rs. 5000" value={form.budget} onChange={(e) => set("budget", e.target.value)} /></FormField>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setForm(null); setEditId(null); }}>Cancel</button>
            <button className="btn-primary" disabled={busy || form.title.trim().length < 3 || form.description.trim().length < 10 || !form.eventDate || form.venue.trim().length < 2} onClick={submit}>{busy && <Spinner />} {editId ? "Send again" : "Send to HOD"}</button>
          </div>
        </div>
      )}

      {rows === null ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-slate-500">No event requests yet.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card p-4">
              <button className="flex w-full flex-wrap items-start justify-between gap-2 text-left" onClick={() => toggle(r.id)} aria-expanded={open === r.id}>
                <span>
                  <span className="block font-medium">{r.title}</span>
                  <span className="text-xs text-slate-500">{fmtDate(r.eventDate)}{r.endDate ? ` - ${fmtDate(r.endDate)}` : ""} · {r.venue}</span>
                </span>
                <StatusBadge status={r.status} />
              </button>
              {open === r.id && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <p className="whitespace-pre-line text-sm text-slate-600">{r.description}</p>
                  {(r.expectedParticipants || r.budget) && <p className="text-xs text-slate-500">{[r.expectedParticipants ? `${r.expectedParticipants} participants` : "", r.budget ? `Budget: ${r.budget}` : ""].filter(Boolean).join(" · ")}</p>}
                  {detail?.id === r.id && detail.actions ? <Timeline actions={detail.actions} /> : <Spinner />}
                  <div className="flex flex-wrap gap-2">
                    {r.status === "CHANGES_REQUESTED" && detail?.id === r.id && <button className="btn-primary" onClick={() => startEdit(detail)}>Edit and send again</button>}
                    {!["APPROVED", "REJECTED", "CANCELLED"].includes(r.status) && <button className="btn-secondary text-red-600" onClick={() => cancel(r)}>Cancel request</button>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
