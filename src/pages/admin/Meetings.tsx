import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronUp, MapPin, Plus, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";

type Claim = "INVITED" | "REQUESTED" | "APPROVED" | "REJECTED";
interface Meeting {
  id: string; title: string; topic: string | null; date: string; startTime: string; endTime: string | null; venue: string;
  audience: "ALL" | "DEPARTMENT" | "HOD"; status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  counts?: Record<Claim, number>; total?: number; myStatus?: Claim; myRemarks?: string | null;
}
interface Participant { id: string; userId: string; name: string; role: string; department: string; designation: string; status: Claim; note: string | null; remarks: string | null }
interface Dept { id: string; name: string }

const AUD: Record<string, string> = { ALL: "All departments (all faculty + HODs)", DEPARTMENT: "Selected department(s)", HOD: "Only HODs" };
const CLAIM_LABEL: Record<Claim, string> = { INVITED: "Not confirmed", REQUESTED: "Waiting for Principal", APPROVED: "Attended (approved)", REJECTED: "Not approved" };
const CLAIM_CLR: Record<Claim, string> = { INVITED: "bg-slate-100 text-slate-600", REQUESTED: "bg-amber-100 text-amber-700", APPROVED: "bg-green-100 text-green-700", REJECTED: "bg-red-100 text-red-700" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`/api/meetings${path}`, {
    method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Request failed");
  return j as T;
}

const emptyForm = { title: "", topic: "", date: "", startTime: "11:00", endTime: "", venue: "", audience: "ALL", departmentIds: [] as string[] };

export default function Meetings() {
  const toastApi = useToast();
  const toastRef = useRef(toastApi); toastRef.current = toastApi;
  const { user } = useAuth();
  const manager = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"].includes(user?.role ?? "");

  const [rows, setRows] = useState<Meeting[] | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Participant[] | null>(null);

  const load = useCallback(async () => {
    try { const r = await call<{ data: Meeting[] }>("/"); setRows(r.data); }
    catch (e) { setRows([]); toastRef.current.error(apiMessage(e, "Unable to load meetings")); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (manager) call<{ data: Dept[] }>("/departments").then((r) => setDepts(r.data)).catch(() => undefined); }, [manager]);

  const loadDetail = async (id: string) => {
    setDetail(null);
    try { const r = await call<{ participants: Participant[] }>(`/${id}`); setDetail(r.participants); }
    catch (e) { toastRef.current.error(apiMessage(e, "Unable to load")); }
  };
  const toggle = (id: string) => { if (open === id) { setOpen(null); return; } setOpen(id); if (manager) void loadDetail(id); };

  const setF = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleDept = (id: string) => setForm((f) => (f ? { ...f, departmentIds: f.departmentIds.includes(id) ? f.departmentIds.filter((x) => x !== id) : [...f.departmentIds, id] } : f));

  const create = async () => {
    if (!form) return;
    setBusy(true); setError(null);
    try {
      const r = await call<{ invited: number }>("/", "POST", form);
      toastRef.current.success(`Meeting created. ${r.invited} people notified.`);
      setForm(null); await load();
    } catch (e) { setError(apiMessage(e, "Unable to create meeting")); }
    finally { setBusy(false); }
  };

  const setStatus = async (m: Meeting, status: Meeting["status"]) => {
    if (status === "CANCELLED" && !window.confirm("Cancel this meeting? Everyone will be notified.")) return;
    try { await call(`/${m.id}`, "PATCH", { status }); await load(); } catch (e) { toastRef.current.error(apiMessage(e, "Unable to update")); }
  };

  const decide = async (m: Meeting, decision: "APPROVED" | "REJECTED", userIds?: string[]) => {
    try {
      const r = await call<{ updated: number }>(`/${m.id}/decide`, "POST", { decision, userIds });
      toastRef.current.success(`${r.updated} updated.`);
      await load(); await loadDetail(m.id);
    } catch (e) { toastRef.current.error(apiMessage(e, "Unable to update")); }
  };

  const attend = async (m: Meeting) => {
    const note = window.prompt("Optional note for the Principal (leave empty to skip):") ?? undefined;
    try { await call(`/${m.id}/attend`, "POST", { note: note || undefined }); toastRef.current.success("Request sent to the Principal."); await load(); }
    catch (e) { toastRef.current.error(apiMessage(e, "Unable to send request")); }
  };

  return (
    <>
      <PageHeader title="Meetings" subtitle={manager ? "Call a meeting, notify faculty and confirm who attended" : "Meetings you are called to"} />
      {manager && !form && <button className="btn-primary mb-4" onClick={() => { setError(null); setForm({ ...emptyForm }); }}><Plus className="h-4 w-4" /> New meeting</button>}

      {manager && form && (
        <div className="card mb-6 max-w-3xl space-y-3 p-4">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <FormField label="Meeting title" id="m-title"><input id="m-title" className="input" maxLength={150} value={form.title} onChange={(e) => setF("title", e.target.value)} /></FormField>
          <FormField label="Topic / agenda" id="m-topic"><textarea id="m-topic" rows={3} className="input" maxLength={1000} value={form.topic} onChange={(e) => setF("topic", e.target.value)} /></FormField>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Date" id="m-date"><input id="m-date" type="date" className="input" value={form.date} onChange={(e) => setF("date", e.target.value)} /></FormField>
            <FormField label="Start time" id="m-st"><input id="m-st" type="time" className="input" value={form.startTime} onChange={(e) => setF("startTime", e.target.value)} /></FormField>
            <FormField label="End time (optional)" id="m-et"><input id="m-et" type="time" className="input" value={form.endTime} onChange={(e) => setF("endTime", e.target.value)} /></FormField>
            <FormField label="Venue / place" id="m-venue"><input id="m-venue" className="input" maxLength={150} value={form.venue} onChange={(e) => setF("venue", e.target.value)} /></FormField>
          </div>
          <FormField label="Who should attend?" id="m-aud">
            <select id="m-aud" className="input" value={form.audience} onChange={(e) => setF("audience", e.target.value)}>
              <option value="ALL">{AUD.ALL}</option><option value="DEPARTMENT">{AUD.DEPARTMENT}</option><option value="HOD">{AUD.HOD}</option>
            </select>
          </FormField>
          {form.audience !== "ALL" && (
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs text-slate-500">{form.audience === "HOD" ? "HODs of (leave all unticked = every department)" : "Departments (tick one or more)"}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {depts.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.departmentIds.includes(d.id)} onChange={() => toggleDept(d.id)} /> {d.name}</label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn border border-slate-300" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy || form.title.trim().length < 3 || !form.date || form.venue.trim().length < 2} onClick={create}>{busy && <Spinner />} Create and notify</button>
          </div>
        </div>
      )}

      {rows === null ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-slate-500">No meetings yet.</p> : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{m.title} {m.status !== "SCHEDULED" && <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${m.status === "CANCELLED" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{m.status === "CANCELLED" ? "Cancelled" : "Completed"}</span>}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{day(m.date)}, {m.startTime}{m.endTime ? `-${m.endTime}` : ""}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.venue}</span>
                    {manager && <span>{AUD[m.audience]}</span>}
                  </p>
                  {m.topic && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{m.topic}</p>}
                </div>
                {!manager && m.myStatus && <span className={`rounded-full px-2 py-1 text-xs ${CLAIM_CLR[m.myStatus]}`}>{CLAIM_LABEL[m.myStatus]}</span>}
              </div>

              {!manager && m.status !== "CANCELLED" && m.myStatus !== "APPROVED" && (
                <div className="mt-3 flex items-center gap-3">
                  <button className="btn-primary" disabled={m.myStatus === "REQUESTED"} onClick={() => attend(m)}><Check className="h-4 w-4" /> {m.myStatus === "REQUESTED" ? "Request sent" : m.myStatus === "REJECTED" ? "Send request again" : "I attended"}</button>
                  {m.myStatus === "REJECTED" && m.myRemarks && <span className="text-xs text-red-600">Principal: {m.myRemarks}</span>}
                </div>
              )}

              {manager && (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1">Invited {m.total}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">Pending {m.counts?.REQUESTED ?? 0}</span>
                    <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">Attended {m.counts?.APPROVED ?? 0}</span>
                    <button className="ml-auto flex items-center gap-1 text-brand-600" onClick={() => toggle(m.id)}>{open === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Attendance</button>
                  </div>
                  {open === m.id && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="mb-3 flex flex-wrap gap-2">
                        {m.status === "SCHEDULED" && <button className="btn border border-slate-300" onClick={() => setStatus(m, "COMPLETED")}>Mark completed</button>}
                        {m.status !== "CANCELLED" && <button className="btn border border-red-300 text-red-600" onClick={() => setStatus(m, "CANCELLED")}>Cancel meeting</button>}
                        {(m.counts?.REQUESTED ?? 0) > 0 && <button className="btn-primary" onClick={() => decide(m, "APPROVED")}>Approve all pending ({m.counts?.REQUESTED})</button>}
                      </div>
                      {detail === null ? <Spinner /> : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3">Name</th><th className="pr-3">Department</th><th className="pr-3">Status</th><th /></tr></thead>
                            <tbody>
                              {detail.map((p) => (
                                <tr key={p.id} className="border-t border-slate-100 align-top">
                                  <td className="py-2 pr-3">{p.name}{p.role === "HOD" && <span className="ml-1 text-xs text-brand-600">HOD</span>}{p.note && <p className="text-xs text-slate-500">"{p.note}"</p>}</td>
                                  <td className="pr-3 text-slate-600">{p.department}</td>
                                  <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${CLAIM_CLR[p.status]}`}>{CLAIM_LABEL[p.status]}</span></td>
                                  <td className="whitespace-nowrap text-right">
                                    {p.status === "REQUESTED" && (<>
                                      <button aria-label="Approve" className="p-1 text-green-600" onClick={() => decide(m, "APPROVED", [p.userId])}><Check className="h-4 w-4" /></button>
                                      <button aria-label="Reject" className="p-1 text-red-600" onClick={() => decide(m, "REJECTED", [p.userId])}><X className="h-4 w-4" /></button>
                                    </>)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
