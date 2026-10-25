import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link2, Pencil, Plus, Search, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column, type SortState } from "@/components/DataTable";
import { apiMessage, FormField, generatePassword } from "@/components/forms";
import type { ParentRow, StudentRow } from "@/types/admin";

const schema = z.object({
  loginId: z.string().trim().min(3, "At least 3 characters"),
  name: z.string().trim().min(2, "Enter a name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  occupation: z.string().trim().optional(),
  address: z.string().trim().optional(),
  password: z.string().optional(),
});
type Values = z.infer<typeof schema>;
const empty: Values = { loginId: "", name: "", email: "", phone: "", occupation: "", address: "", password: "" };

export default function Parents() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const list = usePaged<ParentRow>("/parents", { search: q, sortBy: sort.by, sortDir: sort.dir });
  const [editing, setEditing] = useState<ParentRow | "new" | null>(null);
  const [linking, setLinking] = useState<ParentRow | null>(null);
  const [deleting, setDeleting] = useState<ParentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/parents/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to delete parent")); }
    finally { setBusy(false); }
  };

  const columns: Column<ParentRow>[] = [
    { key: "name", header: "Parent", sortKey: "name", cell: (p) => <><p className="font-medium">{p.user.name}</p><p className="text-xs text-slate-500">{p.user.email}</p></> },
    { key: "loginId", header: "Login ID", cell: (p) => p.user.loginId },
    { key: "phone", header: "Phone", cell: (p) => p.user.phone ?? "-" },
    { key: "children", header: "Linked students", cell: (p) => p.children.length ? <div className="flex flex-wrap gap-1">{p.children.map((c) => <Badge key={c.id} tone="blue">{c.user.name}</Badge>)}</div> : <span className="text-slate-500">None</span> },
    { key: "actions", header: "Actions", className: "text-right", cell: (p) => (
      <RowActions actions={[
        { label: `Link students to ${p.user.loginId}`, icon: Link2, onClick: () => setLinking(p) },
        { label: `Edit ${p.user.loginId}`, icon: Pencil, onClick: () => setEditing(p) },
        { label: `Delete ${p.user.loginId}`, icon: Trash2, danger: true, onClick: () => setDeleting(p) },
      ]} />
    ) },
  ];

  return (
    <>
      <PageHeader title="Parents" subtitle="Parent accounts can see only their linked children" actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add parent</button>} />
      <div className="card">
        <div className="border-b border-slate-200 p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by name, Login ID or email" aria-label="Search parents" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} sort={sort} onSort={(by) => setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }))} emptyTitle="No parents found" emptyHint="Add a parent, then link their children." />
      </div>
      <ParentModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <LinkModal parent={linking} onClose={() => setLinking(null)} onSaved={() => { setLinking(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this parent?" message={`${deleting?.user.name} (${deleting?.user.loginId}) will be removed. Their linked students are kept and simply become unlinked.`} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </>
  );
}

function ParentModal({ target, onClose, onSaved }: { target: ParentRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const parent = target && target !== "new" ? target : null;
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    setApiError(null);
    if (!target) return;
    reset(parent ? { ...empty, loginId: parent.user.loginId, name: parent.user.name, email: parent.user.email, phone: parent.user.phone ?? "", occupation: parent.occupation ?? "", address: parent.address ?? "" } : { ...empty, password: generatePassword() });
  }, [target, parent, reset]);

  const onSubmit = async (v: Values) => {
    setApiError(null);
    if (isNew && (!v.password || v.password.length < 8)) return setApiError("Initial password must be at least 8 characters");
    const { loginId, password, ...rest } = v;
    try {
      if (isNew) await api("/parents", { body: { ...rest, loginId, password } });
      else await api(`/parents/${parent!.id}`, { method: "PATCH", body: rest });
      toast.success(isNew ? "Parent created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) { setApiError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={isNew ? "Add parent" : "Edit parent"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        <FormField label="Login ID" id="p-id" error={errors.loginId?.message}><input id="p-id" className="input uppercase" placeholder="PAR001" disabled={!isNew} {...register("loginId")} /></FormField>
        <FormField label="Full name" id="p-name" error={errors.name?.message}><input id="p-name" className="input" {...register("name")} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Email" id="p-email" error={errors.email?.message}><input id="p-email" type="email" className="input" {...register("email")} /></FormField>
          <FormField label="Phone" id="p-phone"><input id="p-phone" className="input" {...register("phone")} /></FormField>
        </div>
        <FormField label="Occupation" id="p-occ"><input id="p-occ" className="input" {...register("occupation")} /></FormField>
        <FormField label="Address" id="p-addr"><textarea id="p-addr" rows={2} className="input" {...register("address")} /></FormField>
        {isNew && (
          <FormField label="Initial password" id="p-pw">
            <div className="flex gap-2"><input id="p-pw" className="input font-mono" {...register("password")} /><button type="button" className="btn-secondary" onClick={() => setValue("password", generatePassword())}><Wand2 className="h-4 w-4" /> Generate</button></div>
          </FormField>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create parent" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

function LinkModal({ parent, onClose, onSaved }: { parent: ParentRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [results, setResults] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!parent) return;
    setSearch("");
    setSelected(new Map(parent.children.map((c) => [c.id, `${c.user.name} (${c.studentId})`])));
  }, [parent]);

  useEffect(() => {
    if (!parent || q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    api<{ data: StudentRow[] }>(`/students?search=${encodeURIComponent(q)}&pageSize=8`)
      .then((r) => !cancelled && setResults(r.data))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [q, parent]);

  const toggle = (s: StudentRow) =>
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(s.id)) n.delete(s.id); else n.set(s.id, `${s.user.name} (${s.studentId})`);
      return n;
    });

  const save = async () => {
    if (!parent) return;
    setBusy(true);
    try {
      await api(`/parents/${parent.id}/children`, { method: "PUT", body: { studentIds: [...selected.keys()] } });
      toast.success("Students linked successfully.");
      onSaved();
    } catch (e) { toast.error(apiMessage(e, "Unable to link students")); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!parent} title={`Link students to ${parent?.user.name ?? ""}`} onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Linked students">
        {selected.size === 0 ? <span className="text-sm text-slate-500">No students linked</span> : [...selected].map(([id, label]) => (
          <button key={id} onClick={() => setSelected((m) => { const n = new Map(m); n.delete(id); return n; })} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700 hover:bg-brand-100" title="Remove">{label} ✕</button>
        ))}
      </div>
      <input className="input" placeholder="Search students by name or ID (min. 2 letters)" aria-label="Search students to link" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {loading ? <li className="p-3 text-sm text-slate-500">Searching...</li> : results.length === 0 ? <li className="p-3 text-sm text-slate-500">{q.length < 2 ? "Type to search" : "No students found"}</li> : results.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-center gap-3 p-3 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s)} />
              <span>{s.user.name} <span className="text-slate-500">({s.studentId})</span></span>
              {s.parent && s.parent.id !== parent?.id && <Badge tone="amber">Has parent</Badge>}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Selecting a student who already has another parent moves them to this parent.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />} Save links</button>
      </div>
    </Modal>
  );
}
