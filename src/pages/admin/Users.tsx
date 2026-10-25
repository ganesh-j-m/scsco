import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Pencil, Plus, Power, Search, Trash2, Upload } from "lucide-react";
import { api, ApiError, qs } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { Badge, ConfirmDialog, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Pagination, Spinner } from "@/components/ui";
import type { AuthUser, ImportReport, Paged, Role } from "@/types";

const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "HOD", "FACULTY", "STUDENT", "PARENT", "ALUMNI"];

const createSchema = z.object({
  loginId: z.string().trim().min(3, "At least 3 characters").max(40),
  name: z.string().trim().min(2, "Enter a name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  role: z.enum(ROLES as [Role, ...Role[]]),
  password: z.string().min(8, "At least 8 characters"),
});
type FormValues = z.infer<typeof createSchema>;

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const debounced = useDebounce(search);

  const [result, setResult] = useState<Paged<AuthUser> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AuthUser | "new" | null>(null);
  const [deleting, setDeleting] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api<Paged<AuthUser>>(`/users${qs({ page, pageSize: 10, search: debounced, role, status, sortBy, sortDir })}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load users");
    } finally {
      setLoading(false);
    }
  }, [page, debounced, role, status, sortBy, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPage(1), [debounced, role, status]);

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  const toggleStatus = async (u: AuthUser) => {
    try {
      await api(`/users/${u.id}/status`, { method: "PATCH", body: { status: u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
      toast.success(u.status === "ACTIVE" ? "User deactivated." : "User activated.");
      void load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Unable to update status"); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/users/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted successfully.");
      setDeleting(null);
      void load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Unable to delete user"); }
    finally { setBusy(false); }
  };

  const importCsv = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<ImportReport>("/users/import", { form });
      setReport(r);
      toast.success(`${r.summary.successful} of ${r.summary.total} users imported.`);
      void load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Import failed"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const Th = ({ col, children }: { col: string; children: string }) => (
    <th className="px-4 py-3 text-left font-medium">
      <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-slate-900">
        {children} {sortBy === col && <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Create, import and manage every account on the platform"
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import CSV</button>
            <a className="btn-secondary" href={`/api/users/export.csv${qs({ search: debounced, role, status })}`}><Download className="h-4 w-4" /> Export</a>
            <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add user</button>
          </>
        }
      />

      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search by Login ID, name or email" aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
          </select>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {loading && !result ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : !result?.data.length ? (
          <EmptyState title="No users found" hint="Try a different search or add a new user." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <Th col="loginId">Login ID</Th><Th col="name">Name</Th><Th col="email">Email</Th><Th col="role">Role</Th><Th col="status">Status</Th><Th col="createdAt">Created</Th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-60" : ""}`}>
                  {result.data.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{u.loginId}</td>
                      <td className="px-4 py-3">{u.name}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3"><Badge tone="blue">{u.role.replace("_", " ")}</Badge></td>
                      <td className="px-4 py-3"><Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status === "ACTIVE" ? "Active" : "Inactive"}</Badge></td>
                      <td className="px-4 py-3 text-slate-600">{new Date(u.createdAt).toLocaleDateString("en-IN")}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button className="rounded p-1.5 hover:bg-slate-100" aria-label={`Edit ${u.loginId}`} onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></button>
                          <button className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-40" aria-label={u.status === "ACTIVE" ? `Deactivate ${u.loginId}` : `Activate ${u.loginId}`} disabled={u.id === me?.id} onClick={() => toggleStatus(u)}><Power className="h-4 w-4" /></button>
                          <button className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label={`Delete ${u.loginId}`} disabled={u.id === me?.id} onClick={() => setDeleting(u)}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={result.meta.page} totalPages={result.meta.totalPages} total={result.meta.total} onChange={setPage} />
          </>
        )}
      </div>

      <UserModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this user?" message={`${deleting?.name} (${deleting?.loginId}) will be permanently removed. This cannot be undone.`} busy={busy} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
      <Modal open={!!report} title="Import results" onClose={() => setReport(null)}>
        {report && (
          <>
            <div className="mb-4 grid grid-cols-5 gap-2 text-center text-xs">
              {(["total", "successful", "failed", "duplicate", "invalid"] as const).map((k) => (
                <div key={k} className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-semibold">{report.summary[k]}</p><p className="capitalize text-slate-500">{k}</p></div>
              ))}
            </div>
            {report.results.some((r) => r.outcome !== "created") && (
              <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
                {report.results.filter((r) => r.outcome !== "created").map((r) => (
                  <li key={r.row} className="rounded bg-red-50 px-3 py-1.5"><span className="font-medium">Row {r.row}</span> {r.loginId && `(${r.loginId})`} - {r.reason}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">CSV columns: loginId, name, email, role, phone, password</p>
            <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => setReport(null)}>Close</button></div>
          </>
        )}
      </Modal>
    </>
  );
}

function UserModal({ target, onClose, onSaved }: { target: AuthUser | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const user = target && target !== "new" ? target : null;
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(isNew ? createSchema : createSchema.partial({ password: true, loginId: true })) });

  useEffect(() => {
    setApiError(null);
    reset(user ? { loginId: user.loginId, name: user.name, email: user.email, phone: user.phone ?? "", role: user.role, password: "" } : { loginId: "", name: "", email: "", phone: "", role: "STUDENT", password: "" });
  }, [target, user, reset]);

  const onSubmit = async (v: FormValues) => {
    setApiError(null);
    try {
      if (isNew) await api("/users", { body: v });
      else {
        const { loginId: _l, password, ...rest } = v;
        await api(`/users/${user!.id}`, { method: "PATCH", body: { ...rest, ...(password ? { password } : {}) } });
      }
      toast.success(isNew ? "User created successfully." : "Changes saved successfully.");
      onSaved();
    } catch (e) {
      setApiError(e instanceof ApiError ? (e.details?.map((d) => d.message).join(", ") || e.message) : "Unable to save changes.");
    }
  };

  const field = (name: keyof FormValues, label: string, type = "text", disabled = false) => (
    <div>
      <label htmlFor={`f-${name}`} className="label">{label}</label>
      <input id={`f-${name}`} type={type} disabled={disabled} className="input" {...register(name)} />
      {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Modal open={!!target} title={isNew ? "Add user" : "Edit user"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
        {field("loginId", "Login ID", "text", !isNew)}
        {field("name", "Full name")}
        {field("email", "Email", "email")}
        {field("phone", "Phone")}
        <div>
          <label htmlFor="f-role" className="label">Role</label>
          <select id="f-role" className="input" {...register("role")}>{ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</select>
        </div>
        {field("password", isNew ? "Initial password" : "New password (leave blank to keep)", "password")}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {isNew ? "Create user" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
