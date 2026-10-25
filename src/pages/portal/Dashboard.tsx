import { Link } from "react-router-dom";
import { Bell, CalendarClock, ClipboardList, IndianRupee, UserCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fmtDate, inr, useChildren } from "@/components/portal";
import type { ExamRow, FeeRow, MyAttendance, MyResults, NotificationRow, PortalFormRow } from "@/types/admin";

const STUDENT_ROLES = ["STUDENT", "PARENT"];

function Tile({ icon: Icon, label, value, hint, to, tone }: { icon: typeof Bell; label: string; value: string; hint?: string; to: string; tone?: string }) {
  return (
    <Link to={to} className="card block p-4 transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
      <div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4 text-brand-600" aria-hidden />{label}</div>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </Link>
  );
}

export default function PortalDashboard() {
  const { user } = useAuth();
  const isFamily = !!user && STUDENT_ROLES.includes(user.role);
  const kids = useChildren();
  const sid = isFamily ? kids.studentId : "";
  const att = useApi<MyAttendance>(sid ? `/attendance/my?studentId=${sid}` : null);
  const fees = useApi<{ totals: { amount: number; paid: number; due: number }; data: FeeRow[] }>(sid ? `/fees/my?studentId=${sid}` : null);
  const exams = useApi<{ data: ExamRow[] }>(sid ? `/exams/my?studentId=${sid}` : null);
  const results = useApi<MyResults>(sid ? `/results/my?studentId=${sid}` : null);
  const forms = useApi<{ data: PortalFormRow[] }>("/forms/portal/list");
  const notes = useApi<{ data: NotificationRow[]; unread: number }>("/notifications?pageSize=5");

  const openForms = (forms.data?.data ?? []).filter((f) => f.state === "open" && f.submissions === 0);
  const latest = results.data?.summary?.[0];
  const pct = att.data?.overall.percentage;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome, ${user?.name ?? ""}`} />
      {isFamily && kids.loading ? <LoadingState rows={3} /> : kids.error && isFamily ? <ErrorState message={kids.error} onRetry={kids.reload} /> : (
        <>
          {isFamily && kids.picker}
          {isFamily && !kids.kids.length && <div className="card mb-6"><EmptyState title="No student linked" hint="No student profile is linked to this account yet." /></div>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sid && <Tile icon={UserCheck} label="Attendance" to="/portal/attendance" value={att.data ? (att.data.overall.total ? `${pct}%` : "No classes yet") : "…"} tone={pct !== undefined && att.data!.overall.total > 0 ? (pct >= 75 ? "text-green-700" : pct >= 60 ? "text-amber-700" : "text-red-700") : ""} hint={att.data?.overall.total ? `${att.data.overall.attended} of ${att.data.overall.total} classes` : undefined} />}
            {sid && <Tile icon={IndianRupee} label="Fees due" to="/portal/fees" value={fees.data ? inr(fees.data.totals.due) : "…"} tone={fees.data && fees.data.totals.due > 0 ? "text-red-600" : "text-green-700"} hint={fees.data ? `${inr(fees.data.totals.paid)} paid` : undefined} />}
            {sid && <Tile icon={ClipboardList} label="Latest result" to="/portal/results" value={results.data ? (latest ? `${latest.percentage}%` : "None yet") : "…"} hint={latest ? `Semester ${latest.semester} · ${latest.academicYear}` : undefined} />}
            <Tile icon={ClipboardList} label="Forms to fill" to="/portal/forms" value={forms.data ? String(openForms.length) : "…"} hint={openForms[0]?.title} />
            <Tile icon={Bell} label="Unread notifications" to="/portal/notifications" value={notes.data ? String(notes.data.unread) : "…"} />
          </div>

          {sid && (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="exams-h">
                <h2 id="exams-h" className="mb-3 flex items-center gap-2 font-medium"><CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />Upcoming exams</h2>
                <div className="card divide-y divide-slate-100">
                  {exams.loading ? <LoadingState rows={2} /> : exams.error ? <ErrorState message={exams.error} onRetry={exams.reload} /> : !exams.data?.data.length ? <EmptyState title="No upcoming exams" hint="Scheduled exams appear here." /> : exams.data.data.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span><span className="font-medium">{e.subject.name}</span><span className="ml-2 text-xs text-slate-500">{e.name}</span></span>
                      <span className="text-xs text-slate-500">{fmtDate(e.date)} · {e.startTime}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section aria-labelledby="notes-h">
                <h2 id="notes-h" className="mb-3 flex items-center gap-2 font-medium"><Bell className="h-4 w-4 text-brand-600" aria-hidden />Recent notifications</h2>
                <div className="card divide-y divide-slate-100">
                  {notes.loading ? <LoadingState rows={2} /> : notes.error ? <ErrorState message={notes.error} onRetry={notes.reload} /> : !notes.data?.data.length ? <EmptyState title="Nothing new" hint="Announcements and reminders appear here." /> : notes.data.data.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 text-sm"><p className={n.readAt ? "" : "font-medium"}>{n.title}</p><p className="text-xs text-slate-500">{new Date(n.createdAt).toLocaleDateString("en-IN")}</p></div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
