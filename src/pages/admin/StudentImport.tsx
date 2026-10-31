import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { useLookup } from "@/hooks/useLookup";
import { useToast } from "@/context/ToastContext";
import { PageHeader, Spinner } from "@/components/ui";
import { FormField } from "@/components/forms";

interface Row { name: string; email: string; phone: string; roll: string }
interface Result { row: number; loginId: string; name: string; email: string; phone: string; status: "NEW" | "EXISTS" | "ERROR"; message?: string }
interface Out { dryRun: boolean; created: number; skipped: number; results: Result[] }

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEAD: Record<keyof Row, string[]> = {
  name: ["name", "studentname", "fullname", "nameofstudent"],
  email: ["email", "emailid", "mail", "emailaddress"],
  phone: ["phone", "phoneno", "mobile", "mobileno", "mobilenumber", "contact", "contactno", "phonenumber"],
  roll: ["roll", "rollno", "rollnumber", "rollnos", "srno", "sno"],
};
const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export default function StudentImport() {
  const toast = useToast();
  const toastRef = useRef(toast); toastRef.current = toast;
  const courses = useLookup("courses");
  const yr = new Date().getFullYear();
  const [f, setF] = useState({ courseId: "", year: 1, semester: 1, division: "A", admissionYear: yr, prefix: "BCS", password: "12345" });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((p) => ({ ...p, [k]: v })); setOut(null); };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setOut(null); setRows(null); setFileName(file.name);
    try {
      const data = await readSheet(file);
      if (data.length < 2) throw new Error("The sheet is empty. Row 1 must have headings, then one student per row.");
      const head = data[0].map(norm);
      const idx = (k: keyof Row) => head.findIndex((h) => HEAD[k].includes(h));
      const ci = { name: idx("name"), email: idx("email"), phone: idx("phone"), roll: idx("roll") };
      if (ci.name < 0) throw new Error('A column named "Name" is required in row 1.');
      const parsed = data.slice(1)
        .map((r) => ({
          name: cell(r[ci.name]), email: ci.email >= 0 ? cell(r[ci.email]) : "", phone: ci.phone >= 0 ? cell(r[ci.phone]) : "",
          roll: ci.roll >= 0 ? cell(r[ci.roll]).replace(/\.0+$/, "") : "",
        }))
        .filter((r) => r.name || r.email || r.phone || r.roll);
      if (!parsed.length) throw new Error("No students found in the sheet.");
      setRows(parsed);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read this file. Please upload an .xlsx file."); }
  };

  const run = async (dryRun: boolean) => {
    if (!rows) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/student-import", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, year: Number(f.year), semester: Number(f.semester), admissionYear: Number(f.admissionYear), dryRun, rows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? "Import failed");
      setOut(j as Out);
      if (!dryRun) toastRef.current.success(`${(j as Out).created} students created.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  };

  const ready = out?.dryRun ? out.results.filter((x) => x.status === "NEW").length : 0;

  return (
    <>
      <PageHeader title="Import Students" subtitle="Create student logins from an Excel file" />
      <div className="card max-w-4xl space-y-4 p-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Course" id="si-course"><select id="si-course" className="input" value={f.courseId} onChange={(e) => setField("courseId", e.target.value)}><option value="">Select course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField label="Year" id="si-year"><select id="si-year" className="input" value={f.year} onChange={(e) => { const y = Number(e.target.value); setF((p) => ({ ...p, year: y, semester: y * 2 - 1, admissionYear: yr - (y - 1) })); setOut(null); }}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></FormField>
          <FormField label="Semester" id="si-sem"><input id="si-sem" type="number" min={1} max={10} className="input" value={f.semester} onChange={(e) => setField("semester", Number(e.target.value))} /></FormField>
          <FormField label="Division" id="si-div"><input id="si-div" className="input" maxLength={5} value={f.division} onChange={(e) => setField("division", e.target.value)} /></FormField>
          <FormField label="Admission year" id="si-ay"><input id="si-ay" type="number" className="input" value={f.admissionYear} onChange={(e) => setField("admissionYear", Number(e.target.value))} /></FormField>
          <FormField label="Login ID starts with" id="si-prefix"><input id="si-prefix" className="input uppercase" maxLength={12} value={f.prefix} onChange={(e) => setField("prefix", e.target.value.toUpperCase())} /></FormField>
          <FormField label="Password for all" id="si-pw"><input id="si-pw" className="input" value={f.password} onChange={(e) => setField("password", e.target.value)} /></FormField>
        </div>

        <div className="rounded-lg border border-dashed border-slate-300 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-600"><FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx). Row 1 headings: <b>Name</b>, <b>Email</b>, <b>Phone</b>, <b>Roll No</b>. Without a Roll No column, rows are numbered 1, 2, 3 ...</p>
          <label className="btn border border-slate-300 cursor-pointer"><Upload className="h-4 w-4" /> Choose Excel file
            <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {fileName && <span className="ml-3 text-sm text-slate-600">{fileName}{rows ? ` (${rows.length} students)` : ""}</span>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!out && <button className="btn-primary" disabled={busy || !rows || !f.courseId} onClick={() => run(true)}>{busy && <Spinner />} Check file</button>}
          {out?.dryRun && <button className="btn-primary" disabled={busy || ready === 0} onClick={() => run(false)}>{busy && <Spinner />} Create {ready} students</button>}
        </div>

        {out && (
          <div>
            <p className="mb-2 text-sm font-medium">
              {out.dryRun ? `Preview: ${ready} will be created, ${out.results.length - ready} skipped.` : `Done: ${out.created} created, ${out.skipped} skipped.`}
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">Row</th><th>Login ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
                <tbody>
                  {out.results.map((x) => (
                    <tr key={x.row} className="border-t border-slate-100">
                      <td className="p-2">{x.row}</td><td className="font-medium">{x.loginId}</td><td>{x.name}</td><td className="text-slate-600">{x.email}</td><td className="text-slate-600">{x.phone}</td>
                      <td><span className={x.status === "NEW" ? "text-green-700" : x.status === "EXISTS" ? "text-amber-700" : "text-red-700"}>{x.status === "NEW" ? (out.dryRun ? "Will create" : "Created") : x.message}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}