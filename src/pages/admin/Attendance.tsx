import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, LoadingState, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import type { AttendanceRecord, AttStatus, QrOptions } from "@/types/admin";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const tone = (s: AttStatus) => (s === "ABSENT" ? "red" : s === "LATE" ? "amber" : "green");
const label = (s: AttStatus) => s.charAt(0) + s.slice(1).toLowerCase();

export default function Attendance() {
  const toast = useToast();
  const options = useApi<QrOptions>("/qr-attendance/options");
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [date, setDate] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const list = usePaged<AttendanceRecord>("/attendance", { search: q, date, subjectId, status, source }, 15);
  const [marking, setMarking] = useState(false);

  const change = async (r: AttendanceRecord, next: AttStatus) => {
    try {
      await api(`/attendance/${r.id}`, { method: "PATCH", body: { status: next } });
      toast.success("Changes saved successfully.");
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to update attendance")); }
  };

  const columns: Column<AttendanceRecord>[] = [
    { key: "date", header: "Date", cell: (r) => new Date(r.date).toLocaleDateString("en-IN") },
    { key: "student", header: "Student", cell: (r) => <><p className="font-medium">{r.student.user.name}</p><p className="text-xs text-slate-500">{r.student.studentId}</p></> },
    { key: "subject", header: "Subject", cell: (r) => <><p>{r.subject.name}</p><p className="text-xs text-slate-500">Year {r.year} · Div {r.division}</p></> },
    { key: "source", header: "Source", cell: (r) => <Badge tone={r.source === "QR" ? "blue" : "slate"}>{r.source === "QR" ? "QR" : "Manual"}</Badge> },
    { key: "status", header: "Status", cell: (r) => (
      <select aria-label={`Status for ${r.student.user.name}`} className={`rounded-md border px-2 py-1 text-xs font-medium ${tone(r.status) === "green" ? "border-green-200 bg-green-50 text-green-700" : tone(r.status) === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`} value={r.status} onChange={(e) => change(r, e.target.value as AttStatus)}>
        {(["PRESENT", "LATE", "ABSENT"] as AttStatus[]).map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </select>
    ) },
  ];

  return (
    <>
      <PageHeader title="Attendance" subtitle="Records from QR sessions and manual entries" actions={<button className="btn-primary" onClick={() => setMarking(true)}><ClipboardCheck className="h-4 w-4" /> Mark manually</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search student name or ID" aria-label="Search attendance" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input type="date" className="input w-auto" aria-label="Filter by date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          <select className="input w-auto" aria-label="Filter by subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">All subjects</option>{options.data?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="PRESENT">Present</option><option value="LATE">Late</option><option value="ABSENT">Absent</option></select>
          <select className="input w-auto" aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option><option value="QR">QR</option><option value="MANUAL">Manual</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No attendance records" emptyHint="Records appear here after a QR session or manual marking." />
      </div>
      <ManualModal open={marking} options={options.data ?? undefined} onClose={() => setMarking(false)} onSaved={() => { setMarking(false); void list.reload(); }} />
    </>
  );
}

interface RosterStudent { id: string; studentId: string; name: string; status: AttStatus | null }

function ManualModal({ open, options, onClose, onSaved }: { open: boolean; options?: QrOptions; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [subjectId, setSubjectId] = useState("");
  const [classKey, setClassKey] = useState("");
  const [date, setDate] = useState(today());
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = options?.subjects.find((s) => s.id === subjectId);
  const classes = useMemo(() => (options?.classes ?? []).filter((c) => c.courseId === subject?.courseId), [options, subject]);

  useEffect(() => { if (open) { setSubjectId(""); setClassKey(""); setDate(today()); setRoster(null); setMarks({}); setError(null); } }, [open]);

  const loadRoster = async () => {
    const [year, division] = classKey.split("|");
    if (!subjectId || !year || !division) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ students: RosterStudent[] }>(`/attendance/roster?subjectId=${subjectId}&year=${year}&division=${encodeURIComponent(division)}&date=${date}`);
      setRoster(r.students);
      setMarks(Object.fromEntries(r.students.filter((s) => s.status).map((s) => [s.id, s.status as AttStatus])));
    } catch (e) { setError(apiMessage(e, "Unable to load the class list")); setRoster(null); }
    finally { setLoading(false); }
  };

  const setAll = (s: AttStatus) => setMarks(Object.fromEntries((roster ?? []).map((r) => [r.id, s])));
  const unmarked = (roster ?? []).filter((r) => !marks[r.id]).length;

  const save = async () => {
    const [year, division] = classKey.split("|");
    setSaving(true);
    setError(null);
    try {
      await api("/attendance/manual", { body: { subjectId, year: Number(year), division, date, records: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })) } });
      toast.success("Attendance saved successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e, "Unable to save attendance")); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} title="Mark attendance manually" onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Subject" id="m-subject" className="sm:col-span-2">
          <select id="m-subject" className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setClassKey(""); setRoster(null); }}><option value="">Select</option>{options?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.course.name}</option>)}</select>
        </FormField>
        <FormField label="Class" id="m-class">
          <select id="m-class" className="input" disabled={!subjectId} value={classKey} onChange={(e) => { setClassKey(e.target.value); setRoster(null); }}><option value="">Select</option>{classes.map((c) => <option key={`${c.year}|${c.division}`} value={`${c.year}|${c.division}`}>Year {c.year} · Div {c.division}</option>)}</select>
        </FormField>
        <FormField label="Date" id="m-date"><input id="m-date" type="date" className="input" value={date} max={today()} onChange={(e) => { setDate(e.target.value); setRoster(null); }} /></FormField>
      </div>
      <button className="btn-secondary mt-3" disabled={!subjectId || !classKey || !date || loading} onClick={loadRoster}>{loading && <Spinner />} Load students</button>

      {loading && !roster ? <LoadingState rows={3} /> : roster && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-600">{roster.length} students{unmarked > 0 && ` · ${unmarked} not marked`}</span>
            <span className="flex gap-2"><button className="btn-secondary px-3 py-1" onClick={() => setAll("PRESENT")}>All present</button><button className="btn-secondary px-3 py-1" onClick={() => setAll("ABSENT")}>All absent</button></span>
          </div>
          {roster.length === 0 ? <p className="text-sm text-slate-500">No active students in this class.</p> : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {roster.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{s.name} <span className="text-slate-500">({s.studentId})</span></span>
                  <span className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {(["PRESENT", "LATE", "ABSENT"] as AttStatus[]).map((st) => (
                      <button key={st} role="radio" aria-checked={marks[s.id] === st} onClick={() => setMarks((m) => ({ ...m, [s.id]: st }))} className={`rounded-md px-2 py-1 text-xs font-medium ${marks[s.id] === st ? (st === "ABSENT" ? "bg-red-600 text-white" : st === "LATE" ? "bg-amber-500 text-white" : "bg-green-600 text-white") : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label(st)}</button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!roster || Object.keys(marks).length === 0 || saving} onClick={save}>{saving && <Spinner />} Save attendance</button>
      </div>
    </Modal>
  );
}
