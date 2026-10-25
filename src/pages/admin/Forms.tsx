import { FORM_TEMPLATES } from "@/lib/formTemplates";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, FileText, Inbox, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import { fmtDate, pretty } from "@/components/portal";
import type { FormListRow } from "@/types/admin";

export const formTone = (s: string) => (s === "PUBLISHED" ? "green" : s === "CLOSED" ? "amber" : s === "ARCHIVED" ? "slate" : "blue") as "green" | "amber" | "slate" | "blue";

export default function Forms() {
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const list = usePaged<FormListRow>("/forms", { search: q, status });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [tpl, setTpl] = useState("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FormListRow | null>(null);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ form: { id: string } }>("/forms", { body: { title } });
      const t = FORM_TEMPLATES.find((x) => x.id === tpl);
      if (t && t.fields.length) await api(`/forms/${r.form.id}/structure`, { method: "PUT", body: { sections: [], fields: t.fields.map((f) => ({ options: [], ...f })) } });
      navigate(`/admin/forms/${r.form.id}`);
    } catch (e) { setError(apiMessage(e, "Unable to create the form")); }
    finally { setBusy(false); }
  };
  const duplicate = async (f: FormListRow) => {
    try { const r = await api<{ form: { id: string } }>(`/forms/${f.id}/duplicate`, { method: "POST" }); toast.success("Form duplicated."); navigate(`/admin/forms/${r.form.id}`); }
    catch (e) { toast.error(apiMessage(e, "Unable to duplicate")); }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/forms/${deleting.id}`, { method: "DELETE" }); toast.success("Record deleted successfully."); setDeleting(null); void list.reload(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<FormListRow>[] = [
    { key: "title", header: "Form", cell: (f) => <><Link to={`/admin/forms/${f.id}`} className="font-medium text-brand-700 hover:underline">{f.title}</Link><p className="text-xs text-slate-500">By {f.createdBy.name} · {f._count.fields} questions</p></> },
    { key: "status", header: "Status", cell: (f) => <Badge tone={formTone(f.status)}>{pretty(f.status)}</Badge> },
    { key: "window", header: "Open period", cell: (f) => (f.startAt || f.endAt ? `${fmtDate(f.startAt)} – ${fmtDate(f.endAt)}` : "Always") },
    { key: "resp", header: "Responses", cell: (f) => f._count.submissions },
    { key: "actions", header: "Actions", className: "text-right", cell: (f) => (
      <div className="flex justify-end gap-1">
        <Link to={`/admin/forms/${f.id}?tab=responses`} aria-label={`Responses to ${f.title}`} title="Responses" className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><Inbox className="h-4 w-4" /></Link>
        <Link to={`/admin/forms/${f.id}`} aria-label={`Open ${f.title}`} title="Open builder" className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><FileText className="h-4 w-4" /></Link>
        <button aria-label={`Duplicate ${f.title}`} title="Duplicate" className="rounded p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => duplicate(f)}><Copy className="h-4 w-4" /></button>
        {f._count.submissions === 0 && <button aria-label={`Delete ${f.title}`} title="Delete" className="rounded p-1.5 text-red-600 hover:bg-red-50" onClick={() => setDeleting(f)}><Trash2 className="h-4 w-4" /></button>}
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader title="Forms" subtitle="Create forms and surveys and send them to the right people" actions={<button className="btn-primary" onClick={() => { setTitle(""); setTpl("blank"); setError(null); setCreating(true); }}><Plus className="h-4 w-4" /> Create form</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search forms" aria-label="Search forms" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No forms yet" emptyHint="Create your first form." />
      </div>
      <Modal open={creating} title="Create form" onClose={() => setCreating(false)}>
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <FormField label="Form title" id="nf-title"><input id="nf-title" className="input" maxLength={150} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && title.trim().length >= 3 && void create()} /></FormField>
        <FormField label="Start from" id="nf-tpl" className="mt-3"><select id="nf-tpl" className="input" value={tpl} onChange={(e) => setTpl(e.target.value)}>{FORM_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.description}</option>)}</select></FormField>
        <p className="mt-2 text-xs text-slate-500">You will add questions and choose the audience on the next screen.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" disabled={busy || title.trim().length < 3} onClick={create}>{busy && <Spinner />} Continue</button></div>
      </Modal>
      <ConfirmDialog open={!!deleting} title="Delete this form?" message={`"${deleting?.title}" and its questions will be permanently removed.`} busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}
