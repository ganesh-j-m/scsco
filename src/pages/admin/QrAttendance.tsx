import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Eye, QrCode, Square, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import type { QrOptions, QrSessionDetail, QrSessionSummary } from "@/types/admin";

const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function QrAttendance() {
  const toast = useToast();
  const options = useApi<QrOptions>("/qr-attendance/options");
  const history = usePaged<QrSessionSummary>("/qr-attendance/sessions", {}, 8);
  const [subjectId, setSubjectId] = useState("");
  const [classKey, setClassKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const autoPicked = useRef(false);

  // After a page reload, resume the QR that is still running.
  useEffect(() => {
    if (autoPicked.current || history.loading) return;
    autoPicked.current = true;
    const live = history.rows.find((r) => r.active);
    if (live) setActiveId(live.id);
  }, [history.rows, history.loading]);

  const subject = options.data?.subjects.find((s) => s.id === subjectId);
  const classes = useMemo(() => (options.data?.classes ?? []).filter((c) => c.courseId === subject?.courseId && c.year <= (subject?.course.durationYears ?? 5)), [options.data, subject]);

  const generate = async (body: { subjectId: string; year: number; division: string }) => {
    setCreating(true);
    try {
      const r = await api<{ session: { id: string } }>("/qr-attendance/sessions", { body });
      setActiveId(r.session.id);
      toast.success("QR code generated. It is valid for 5 minutes.");
      void history.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to generate the QR code")); }
    finally { setCreating(false); }
  };

  const onGenerate = () => {
    const [year, division] = classKey.split("|");
    if (subjectId && year && division) void generate({ subjectId, year: Number(year), division });
  };

  const columns: Column<QrSessionSummary>[] = [
    { key: "when", header: "Date / time", cell: (s) => <><p>{new Date(s.date).toLocaleDateString("en-IN")}</p><p className="text-xs text-slate-500">{fmtTime(s.startsAt)}</p></> },
    { key: "subject", header: "Subject", cell: (s) => <><p className="font-medium">{s.subject.name}</p><p className="text-xs text-slate-500">{s.faculty.user.name}</p></> },
    { key: "class", header: "Class", cell: (s) => `${s.subject.course.name} · Year ${s.year} · Div ${s.division}` },
    { key: "present", header: "Present", cell: (s) => s.present },
    { key: "state", header: "Status", cell: (s) => <Badge tone={s.active ? "green" : "slate"}>{s.active ? "Live" : "Ended"}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (s) => <RowActions actions={[{ label: "View session", icon: Eye, onClick: () => setActiveId(s.id) }]} /> },
  ];

  return (
    <>
      <PageHeader title="QR attendance" subtitle="Each QR is valid for exactly 5 minutes. Students scan it while logged in." />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="card h-fit p-4">
          <h2 className="mb-3 font-medium">New session</h2>
          {options.loading ? <LoadingState rows={3} /> : options.error ? <ErrorState message={options.error} onRetry={options.reload} /> : !options.data?.subjects.length ? (
            <p className="text-sm text-slate-600">No subjects with an assigned teacher are available. Assign a teacher in the Subjects module first.</p>
          ) : (
            <div className="space-y-3">
              <FormField label="Subject" id="q-subject">
                <select id="q-subject" className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setClassKey(""); }}>
                  <option value="">Select a subject</option>
                  {options.data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.course.name}</option>)}
                </select>
              </FormField>
              <FormField label="Class" id="q-class">
                <select id="q-class" className="input" value={classKey} disabled={!subjectId} onChange={(e) => setClassKey(e.target.value)}>
                  <option value="">{subjectId && !classes.length ? "No students in this course" : "Select year and division"}</option>
                  {classes.map((c) => <option key={`${c.year}|${c.division}`} value={`${c.year}|${c.division}`}>Year {c.year} · Div {c.division} ({c.students} students)</option>)}
                </select>
              </FormField>
              {subject?.faculty && <p className="text-xs text-slate-500">Teacher: {subject.faculty.user.name}</p>}
              <button className="btn-primary w-full" disabled={!subjectId || !classKey || creating} onClick={onGenerate}>{creating ? <Spinner /> : <QrCode className="h-4 w-4" />} Generate QR</button>
              <p className="text-xs text-slate-500">A new QR replaces the previous live QR for the same subject and class.</p>
            </div>
          )}
        </div>

        <div>
          {activeId ? (
            <LivePanel key={activeId} id={activeId} creating={creating} onChanged={history.reload} onRegenerate={generate} />
          ) : (
            <div className="card"><EmptyState title="No session selected" hint="Generate a QR code, or open a past session from the list below." /></div>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-medium">Recent sessions</h2>
      <div className="card">
        <DataTable columns={columns} rows={history.rows} loading={history.loading} error={history.error} onRetry={history.reload} meta={history.meta} onPage={history.setPage} emptyTitle="No sessions yet" emptyHint="Sessions you create will be listed here." />
      </div>
    </>
  );
}

function LivePanel({ id, creating, onChanged, onRegenerate }: { id: string; creating: boolean; onChanged: () => void; onRegenerate: (b: { subjectId: string; year: number; division: string }) => void }) {
  const toast = useToast();
  const [data, setData] = useState<QrSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const offset = useRef(0); // server time minus browser time, so the countdown follows the server clock
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<QrSessionDetail>(`/qr-attendance/sessions/${id}`);
      offset.current = new Date(r.serverNow).getTime() - Date.now();
      setData(r);
      setError(null);
    } catch (e) { setError(apiMessage(e, "Unable to load the session")); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  const active = !!data?.session.active;
  useEffect(() => {
    const t = setInterval(() => void load(), active ? 3000 : 20000); // live count while the QR is running
    return () => clearInterval(t);
  }, [load, active]);
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (error && !data) return <div className="card"><ErrorState message={error} onRetry={load} /></div>;
  if (!data) return <div className="card"><LoadingState rows={4} /></div>;

  const { session } = data;
  const remaining = new Date(session.expiresAt).getTime() - (tick + offset.current);
  const live = session.active && remaining > 0 && !!session.token;
  const qrUrl = live ? `${window.location.origin}/scan/${session.token}` : "";

  const close = async () => {
    setClosing(true);
    try {
      await api(`/qr-attendance/sessions/${id}/close`, { method: "POST" });
      toast.success("Session closed.");
      await load();
      onChanged();
    } catch (e) { toast.error(apiMessage(e, "Unable to close the session")); }
    finally { setClosing(false); }
  };

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{session.subject.name}</h2>
          <p className="text-sm text-slate-500">{session.subject.course.name} · Year {session.year} · Div {session.division} · {session.faculty.user.name}</p>
        </div>
        <Badge tone={live ? "green" : "slate"}>{live ? "Live" : "Ended"}</Badge>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="text-center">
          {live ? (
            <>
              <div className="inline-block rounded-xl border border-slate-200 bg-white p-3"><QRCodeSVG value={qrUrl} size={220} level="M" title="Attendance QR code" /></div>
              <p className={`mt-3 text-3xl font-semibold tabular-nums ${remaining < 60000 ? "text-red-600" : "text-slate-900"}`} role="timer" aria-label="Time remaining">{mmss(remaining)}</p>
              <p className="text-xs text-slate-500">until this QR expires</p>
              <button className="btn-secondary mt-3" onClick={close} disabled={closing}>{closing ? <Spinner /> : <Square className="h-4 w-4" />} Close now</button>
            </>
          ) : (
            <div className="rounded-xl bg-slate-50 p-6">
              <p className="font-medium text-slate-700">This QR has ended</p>
              <p className="mt-1 text-xs text-slate-500">Students who did not scan are recorded as absent.</p>
              <button className="btn-primary mt-4" disabled={creating} onClick={() => onRegenerate({ subjectId: session.subjectId, year: session.year, division: session.division })}>{creating && <Spinner />} Generate new QR</button>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-brand-600" aria-hidden /><span className="text-2xl font-semibold">{data.present}</span><span className="text-slate-500">of {data.total} present</span></div>
          {data.attendance.length === 0 ? <p className="text-sm text-slate-500">Waiting for students to scan...</p> : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200" aria-live="polite">
              {data.attendance.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{a.student.user.name} <span className="text-slate-500">({a.student.studentId})</span></span>
                  <span className="flex items-center gap-2"><span className="text-xs text-slate-500">{fmtTime(a.time)}</span><Badge tone={a.status === "ABSENT" ? "red" : a.status === "LATE" ? "amber" : "green"}>{a.status.charAt(0) + a.status.slice(1).toLowerCase()}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
