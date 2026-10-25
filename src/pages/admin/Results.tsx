import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useToast } from "@/context/ToastContext";
import { EmptyState, ErrorState, LoadingState, PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";
import { fmtDate } from "@/components/portal";
import type { ExamRow, ResultSheet } from "@/types/admin";
import type { Paged } from "@/types";

export default function Results() {
  const toast = useToast();
  const exams = useApi<Paged<ExamRow>>("/exams?pageSize=100&when=past");
  const upcoming = useApi<Paged<ExamRow>>("/exams?pageSize=100&when=upcoming");
  const [examId, setExamId] = useState("");
  const sheet = useApi<ResultSheet>(examId ? `/results/sheet?examId=${examId}` : null);
  const [max, setMax] = useState("100");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sheet.data) return;
    setMax(String(sheet.data.maxMarks));
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.id, s.marks == null ? "" : String(s.marks)])));
    setError(null);
  }, [sheet.data]);

  const all = [...(exams.data?.data ?? []), ...(upcoming.data?.data ?? [])];
  const maxN = Number(max);
  const bad = (v: string) => v !== "" && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > maxN);
  const filled = Object.entries(marks).filter(([, v]) => v !== "");
  const anyBad = Object.values(marks).some(bad);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("/results/sheet", { body: { examId, maxMarks: maxN, records: filled.map(([studentId, v]) => ({ studentId, marks: Number(v) })) } });
      toast.success("Results saved successfully.");
      void sheet.reload();
    } catch (e) { setError(apiMessage(e, "Unable to save results")); }
    finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title="Results" subtitle="Enter marks per exam. Grades are calculated automatically (pass mark 40%)." />
      <div className="card mb-6 p-4">
        <FormField label="Exam" id="r-exam">
          <select id="r-exam" className="input max-w-xl" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Select an exam</option>
            {all.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.subject.name} · {x.course.name} · {fmtDate(x.date)}</option>)}
          </select>
        </FormField>
      </div>

      {!examId ? <div className="card"><EmptyState title="Choose an exam" hint="The class list for marks entry appears here." /></div>
        : sheet.loading ? <LoadingState rows={6} />
        : sheet.error ? <ErrorState message={sheet.error} onRetry={sheet.reload} />
        : sheet.data && (
          <div className="card">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4">
              <div><p className="font-medium">{sheet.data.exam.subject} · {sheet.data.exam.name}</p><p className="text-xs text-slate-500">{sheet.data.exam.course} · Semester {sheet.data.exam.semester}</p></div>
              <div className="w-32"><FormField label="Maximum marks" id="r-max"><input id="r-max" inputMode="decimal" className="input" value={max} onChange={(e) => setMax(e.target.value)} /></FormField></div>
            </div>
            {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {sheet.data.students.length === 0 ? <EmptyState title="No active students" hint="No students are in this course and semester." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Student ID</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Div</th><th className="px-4 py-2">Marks (out of {max || "?"})</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {sheet.data.students.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2">{s.studentId}</td><td className="px-4 py-2">{s.name}</td><td className="px-4 py-2">{s.division}</td>
                        <td className="px-4 py-2">
                          <input aria-label={`Marks for ${s.name}`} inputMode="decimal" className={`input w-28 ${bad(marks[s.id] ?? "") ? "border-red-400" : ""}`} value={marks[s.id] ?? ""} onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
              <span className="text-sm text-slate-500">{filled.length} of {sheet.data.students.length} entered{anyBad && <span className="ml-2 text-red-600">Marks must be between 0 and {max}</span>}</span>
              <button className="btn-primary" disabled={saving || anyBad || !(maxN > 0) || filled.length === 0} onClick={save}>{saving && <Spinner />} Save results</button>
            </div>
          </div>
        )}
    </>
  );
}
