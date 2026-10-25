import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import type { MyAttendance } from "@/types/admin";

const barTone = (p: number) => (p >= 75 ? "bg-green-500" : p >= 60 ? "bg-amber-500" : "bg-red-500");
const textTone = (p: number) => (p >= 75 ? "text-green-700" : p >= 60 ? "text-amber-700" : "text-red-700");

export default function PortalAttendance() {
  const children = useApi<{ data: { id: string; studentId: string; name: string }[] }>("/attendance/children");
  const [selected, setSelected] = useState("");
  const kids = children.data?.data ?? [];
  const studentId = selected || kids[0]?.id || "";
  const att = useApi<MyAttendance>(studentId ? `/attendance/my?studentId=${studentId}` : null);

  if (children.loading) return <LoadingState rows={4} />;
  if (children.error) return <ErrorState message={children.error} onRetry={children.reload} />;
  if (!kids.length) return <><PageHeader title="Attendance" /><div className="card"><EmptyState title="No student linked" hint="No student profile is linked to this account yet." /></div></>;

  return (
    <>
      <PageHeader title="Attendance" subtitle="Present and late both count as attended" />
      {kids.length > 1 && (
        <div className="mb-4">
          <label htmlFor="child" className="mr-2 text-sm text-slate-600">Student</label>
          <select id="child" className="input w-auto" value={studentId} onChange={(e) => setSelected(e.target.value)}>
            {kids.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.studentId})</option>)}
          </select>
        </div>
      )}
      {att.loading ? <LoadingState rows={4} /> : att.error ? <ErrorState message={att.error} onRetry={att.reload} /> : att.data && (
        <>
          <div className="card mb-6 p-4">
            <p className="text-sm text-slate-500">Overall attendance{att.data.student ? ` · ${att.data.student.user.name}` : ""}</p>
            <p className={`text-4xl font-semibold ${textTone(att.data.overall.percentage)}`}>{att.data.overall.percentage}%</p>
            <p className="text-xs text-slate-500">{att.data.overall.attended} of {att.data.overall.total} classes attended</p>
            {att.data.overall.total > 0 && att.data.overall.percentage < 75 && <p className="mt-2 text-sm text-amber-700">Attendance is below 75%.</p>}
          </div>

          {att.data.subjects.length === 0 ? (
            <div className="card"><EmptyState title="No attendance yet" hint="Records appear here after your first class." /></div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {att.data.subjects.map((s) => (
                <div key={s.subjectId} className="card p-4">
                  <div className="flex items-start justify-between gap-2"><p className="font-medium">{s.name}</p><span className={`text-lg font-semibold ${textTone(s.percentage)}`}>{s.percentage}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={s.percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} attendance`}><div className={`h-full ${barTone(s.percentage)}`} style={{ width: `${s.percentage}%` }} /></div>
                  <p className="mt-2 text-xs text-slate-500">{s.present} present · {s.late} late · {s.absent} absent</p>
                </div>
              ))}
            </div>
          )}

          {att.data.recent.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 font-medium">Recent records</h2>
              <div className="card divide-y divide-slate-100">
                {att.data.recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>{r.subject.name}<span className="ml-2 text-xs text-slate-500">{new Date(r.date).toLocaleDateString("en-IN")}</span></span>
                    <Badge tone={r.status === "ABSENT" ? "red" : r.status === "LATE" ? "amber" : "green"}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
