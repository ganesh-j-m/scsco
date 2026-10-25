import { useApi } from "@/hooks/useApi";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fmtDate, useChildren } from "@/components/portal";
import type { ExamRow, MyResults } from "@/types/admin";

export default function PortalResults() {
  const kids = useChildren();
  const res = useApi<MyResults>(kids.studentId ? `/results/my?studentId=${kids.studentId}` : null);
  const exams = useApi<{ data: ExamRow[] }>(kids.studentId ? `/exams/my?studentId=${kids.studentId}` : null);

  if (kids.loading) return <LoadingState rows={4} />;
  if (kids.error) return <ErrorState message={kids.error} onRetry={kids.reload} />;
  if (!kids.kids.length) return <><PageHeader title="Results" /><div className="card"><EmptyState title="No student linked" hint="No student profile is linked to this account yet." /></div></>;

  return (
    <>
      <PageHeader title="Results & exams" subtitle="Marks, grades and upcoming exam schedule" />
      {kids.picker}
      {exams.data && exams.data.data.length > 0 && (
        <>
          <h2 className="mb-3 font-medium">Upcoming exams</h2>
          <div className="card mb-8 divide-y divide-slate-100">
            {exams.data.data.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div><p className="font-medium">{x.subject.name}</p><p className="text-xs text-slate-500">{x.name}{x.room ? ` · Room ${x.room}` : ""}</p></div>
                <div className="text-right"><p>{fmtDate(x.date)}</p><p className="text-xs text-slate-500">{x.startTime} – {x.endTime}</p></div>
              </div>
            ))}
          </div>
        </>
      )}
      {res.loading ? <LoadingState rows={4} /> : res.error ? <ErrorState message={res.error} onRetry={res.reload} /> : res.data && (
        res.data.data.length === 0 ? <div className="card"><EmptyState title="No results yet" hint="Published results appear here." /></div> : (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {res.data.summary.map((s) => (
                <div key={s.semester} className="card p-4">
                  <p className="text-sm text-slate-500">Semester {s.semester} · {s.academicYear}</p>
                  <p className="text-3xl font-semibold">{s.percentage}%</p>
                  <p className="text-xs text-slate-500">{s.marks} / {s.max} marks{s.failed > 0 ? ` · ${s.failed} failed` : ""}</p>
                </div>
              ))}
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Subject</th><th className="px-4 py-2">Exam</th><th className="px-4 py-2">Sem</th><th className="px-4 py-2">Marks</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">Result</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {res.data.data.map((r) => (
                    <tr key={r.id}><td className="px-4 py-2">{r.subject.name}</td><td className="px-4 py-2">{r.exam.name}</td><td className="px-4 py-2">{r.semester}</td><td className="px-4 py-2">{r.marks} / {r.maxMarks}</td><td className="px-4 py-2">{r.grade ?? "—"}</td><td className="px-4 py-2"><Badge tone={r.passed ? "green" : "red"}>{r.passed ? "Pass" : "Fail"}</Badge></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </>
  );
}
