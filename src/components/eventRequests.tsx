import { CheckCircle2, Clock, MessageSquare, XCircle, Ban, CalendarClock, UserRound } from "lucide-react";

export type ReqStatus = "PENDING_HOD" | "PENDING_PRINCIPAL" | "MEET_PRINCIPAL" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface EventAction { id: string; actorName: string; actorRole: string; action: string; message: string | null; proposedDate: string | null; createdAt: string }
export interface EventReq {
  id: string; title: string; description: string; eventDate: string; endDate: string | null; venue: string;
  expectedParticipants: number | null; budget: string | null; requesterName: string; requesterClass: string;
  status: ReqStatus; changesFrom: string | null; createdAt: string; canAct?: "HOD" | "PRINCIPAL" | null; actions?: EventAction[];
}

export const STATUS: Record<ReqStatus, { label: string; cls: string }> = {
  PENDING_HOD: { label: "Waiting for HOD", cls: "bg-amber-100 text-amber-700" },
  PENDING_PRINCIPAL: { label: "Waiting for Principal", cls: "bg-blue-100 text-blue-700" },
  MEET_PRINCIPAL: { label: "Meet the Principal", cls: "bg-violet-100 text-violet-700" },
  CHANGES_REQUESTED: { label: "Change asked", cls: "bg-orange-100 text-orange-700" },
  APPROVED: { label: "Approved", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-100 text-slate-600" },
};

export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");
export const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`/api/event-requests${path === "/" ? "" : path}`, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j as { error?: string }).error;
    if (msg) throw new Error(msg);
    throw new Error(r.status === 502 || r.status === 503 || r.status === 504 ? "The server is waking up. Please try again in a minute." : `Request failed (error ${r.status})`);
  }
  return j as T;
}
export const errText = (e: unknown, fb: string) => (e instanceof Error && e.message ? e.message : fb);

export function StatusBadge({ status }: { status: ReqStatus }) {
  const s = STATUS[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const ACTION: Record<string, { text: string; icon: typeof Clock; cls: string }> = {
  SUBMITTED: { text: "Request sent", icon: Clock, cls: "text-slate-500" },
  RESUBMITTED: { text: "Updated and sent again", icon: Clock, cls: "text-slate-500" },
  HOD_APPROVED: { text: "HOD approved", icon: CheckCircle2, cls: "text-green-600" },
  HOD_REJECTED: { text: "HOD rejected", icon: XCircle, cls: "text-red-600" },
  HOD_CHANGES: { text: "HOD asked for a change", icon: CalendarClock, cls: "text-orange-600" },
  PRINCIPAL_APPROVED: { text: "Principal approved", icon: CheckCircle2, cls: "text-green-600" },
  PRINCIPAL_REJECTED: { text: "Principal rejected", icon: XCircle, cls: "text-red-600" },
  PRINCIPAL_CHANGES: { text: "Principal asked for a change", icon: CalendarClock, cls: "text-orange-600" },
  PRINCIPAL_MEET: { text: "Principal wants to meet", icon: UserRound, cls: "text-violet-600" },
  CANCELLED: { text: "Cancelled by student", icon: Ban, cls: "text-slate-500" },
};

export function Timeline({ actions }: { actions: EventAction[] }) {
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4">
      {actions.map((a) => {
        const m = ACTION[a.action] ?? { text: a.action, icon: MessageSquare, cls: "text-slate-500" };
        return (
          <li key={a.id} className="relative text-sm">
            <span className={`absolute -left-[26px] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-white ${m.cls}`}><m.icon className="h-4 w-4" aria-hidden /></span>
            <p className="font-medium">{m.text} <span className="font-normal text-slate-500">· {a.actorName}</span></p>
            {a.message && <p className="mt-0.5 whitespace-pre-line text-slate-600">{a.message}</p>}
            {a.proposedDate && <p className="mt-0.5 text-xs text-orange-700">Suggested date: {fmtDate(a.proposedDate)}</p>}
            <p className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString("en-IN")}</p>
          </li>
        );
      })}
    </ol>
  );
}