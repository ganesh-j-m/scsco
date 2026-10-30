import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Upload } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";

interface Row {
  id: string; name: string; photoUrl: string | null; company: string; companyLogo: string | null; role: string;
  course: string | null; batch: string | null; package: string | null; sortOrder: number; status: string;
}
const empty = { name: "", photoUrl: "", company: "", companyLogo: "", role: "Full Time", course: "", batch: "", package: "", sortOrder: 0, status: "PUBLISHED" };
type Form = typeof empty;

// Small self-contained fetch helper (same-origin /api, cookie auth).
async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method, credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Request failed");
  return j as T;
}

function ImageField({ label, value, onChange, id }: { label: string; value: string; onChange: (v: string) => void; id: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch("/api/uploads/image", { method: "POST", credentials: "include", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? "Upload failed");
      onChange((j as { url: string }).url);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  };
  return (
    <FormField label={label} id={id}>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-contain" /> : <div className="h-14 w-14 rounded-lg bg-slate-100" />}
        <label className="btn border border-slate-300 cursor-pointer">
          {busy ? <Spinner /> : <Upload className="h-4 w-4" />} {value ? "Change" : "Upload"}
          <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {value && <button type="button" className="text-xs text-red-600" onClick={() => onChange("")}>Remove</button>}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </FormField>
  );
}

export default function PlacedStudents() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await call<{ data: Row[] }>("/cms/placed-students?pageSize=50"); setRows(r.data); }
    catch (e) { setRows([]); toast.error(apiMessage(e, "Unable to load")); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true); setError(null);
    try {
      const body = { ...form, sortOrder: Number(form.sortOrder) || 0 };
      if (editId) await call(`/cms/placed-students/${editId}`, "PATCH", body);
      else await call("/cms/placed-students", "POST", body);
      toast.success("Saved.");
      setForm(null); setEditId(null); await load();
    } catch (e) { setError(apiMessage(e, "Unable to save")); }
    finally { setBusy(false); }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Delete ${r.name}?`)) return;
    try { await call(`/cms/placed-students/${r.id}`, "DELETE"); toast.success("Deleted."); await load(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); }
  };

  const edit = (r: Row) => {
    setEditId(r.id); setError(null);
    setForm({ name: r.name, photoUrl: r.photoUrl ?? "", company: r.company, companyLogo: r.companyLogo ?? "", role: r.role, course: r.course ?? "", batch: r.batch ?? "", package: r.package ?? "", sortOrder: r.sortOrder, status: r.status });
  };

  return (
    <>
      <PageHeader title="Placed Students" subtitle="Students shown in 'Our Placed Students' on the home page" />
      {!form && <button className="btn-primary mb-4" onClick={() => { setEditId(null); setError(null); setForm({ ...empty }); }}><Plus className="h-4 w-4" /> Add student</button>}

      {form && (
        <div className="card mb-6 max-w-3xl space-y-3 p-4">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Student name" id="ps-name"><input id="ps-name" className="input" maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} /></FormField>
            <FormField label="Company" id="ps-co"><input id="ps-co" className="input" maxLength={120} value={form.company} onChange={(e) => set("company", e.target.value)} /></FormField>
            <ImageField id="ps-photo" label="Student photo" value={form.photoUrl} onChange={(v) => set("photoUrl", v)} />
            <ImageField id="ps-logo" label="Company logo (optional)" value={form.companyLogo} onChange={(v) => set("companyLogo", v)} />
            <FormField label="Role" id="ps-role"><select id="ps-role" className="input" value={form.role} onChange={(e) => set("role", e.target.value)}><option>Full Time</option><option>Internship</option><option>Internship + Full Time</option></select></FormField>
            <FormField label="Package (optional)" id="ps-pkg"><input id="ps-pkg" className="input" placeholder="e.g. 4.5 LPA" maxLength={60} value={form.package} onChange={(e) => set("package", e.target.value)} /></FormField>
            <FormField label="Course (optional)" id="ps-course"><input id="ps-course" className="input" placeholder="e.g. B.Sc. CS" maxLength={80} value={form.course} onChange={(e) => set("course", e.target.value)} /></FormField>
            <FormField label="Batch (optional)" id="ps-batch"><input id="ps-batch" className="input" placeholder="e.g. 2026" maxLength={20} value={form.batch} onChange={(e) => set("batch", e.target.value)} /></FormField>
            <FormField label="Order (0 = first)" id="ps-order"><input id="ps-order" type="number" min={0} className="input" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></FormField>
            <FormField label="Status" id="ps-status"><select id="ps-status" className="input" value={form.status} onChange={(e) => set("status", e.target.value)}><option value="PUBLISHED">Published (visible)</option><option value="DRAFT">Draft (hidden)</option><option value="ARCHIVED">Archived (hidden)</option></select></FormField>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn border border-slate-300" onClick={() => { setForm(null); setEditId(null); }}>Cancel</button>
            <button className="btn-primary" disabled={busy || form.name.trim().length < 2 || form.company.trim().length < 2} onClick={save}>{busy && <Spinner />} Save</button>
          </div>
        </div>
      )}

      {rows === null ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-slate-500">No students added yet.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="card flex items-center gap-3 p-3">
              {r.photoUrl ? <img src={r.photoUrl} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="h-14 w-14 rounded-lg bg-slate-100" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-xs text-slate-500">{r.company} · {r.role}</p>
                {r.status !== "PUBLISHED" && <span className="text-xs text-amber-600">{r.status}</span>}
              </div>
              <button aria-label="Edit" className="p-2 text-slate-600" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></button>
              <button aria-label="Delete" className="p-2 text-red-600" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}