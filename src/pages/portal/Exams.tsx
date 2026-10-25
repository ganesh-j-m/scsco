import { useApi } from "@/hooks/useApi";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fmtDate, useChildren } from "@/components/portal";
import type { ExamRow } from "@/types/admin";

export default function PortalExams() {
  const kids = useChildren();
  const exams = useApi<{ data: ExamRow[] }>(kids.studentId ? `/exams/my?studentId=${kids.studentId}` : null);
  if (kids.loading) return <LoadingState rows={4} />;
  if (kids.error) return <ErrorState message={kids.error} onRetry={kids.reload} />;
  if (!kids.kids.length) return <><PageHeader title="Exams" /><div className="card"><EmptyState title="No student linked" hint="Exams are shown for student and parent accounts." /></div></>;
  return (
    <>
      <PageHeader title="Exams" subtitle="Upcoming exams for your course and semester" />
      {kids.picker}
      {exams.loading ? <LoadingState rows={4} /> : exams.error ? <ErrorState message={exams.error} onRetry={exams.reload} /> : !exams.data?.data.length ? (
        <div className="card"><EmptyState title="No upcoming exams" hint="Exam schedules appear here once published." /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {exams.data.data.map((e) => (
            <div key={e.id} className="card p-4">
              <p className="font-medium">{e.subject.name} <span className="text-xs text-slate-500">({e.subject.code})</span></p>
              <p className="text-sm text-slate-600">{e.name} · Semester {e.semester}</p>
              <p className="mt-2 text-sm">{fmtDate(e.date)} · {e.startTime} – {e.endTime}</p>
              <p className="text-xs text-slate-500">Room: {e.room ?? "To be announced"}</p>
              {e.instructions && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">{e.instructions}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
