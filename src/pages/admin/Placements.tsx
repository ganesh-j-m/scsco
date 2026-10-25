import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import { approvalTone, fmtDate, pretty } from "@/components/portal";
import type { PlacementRow } from "@/types/admin";

const schema = z.object({
  company: z.string().trim().min(2, "Enter the company"), jobTitle: z.string().trim().min(2, "Enter the job title"),
  eligibility: z.string().trim().optional(), package: z.string().trim().optional(), location: z.string().trim().optional(),
  driveDate: z.string().optional(), deadline: z.string().optional(), description: z.string().trim().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});
type Values = z.infer<typeof schema>;
const empty: Values = { company: "", jobTitle: "", eligibility: "", package: "", location: "", driveDate: "", deadline: "", description: "", status: "DRAFT" };

export default function Placements() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const list = usePaged<PlacementRow>("/placements", { search: q, status });
  const [editing, setEditing] = useState<PlacementRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<PlacementRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/placements/${deleting.id}`, { method: "DELETE" }); toast.success("Record deleted successfully."); setDeleting(null); void list.reload(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<PlacementRow>[] = [
    { key: "company", header: "Company", cell: (p) => <><p className="font-medium">{p.company}</p><p className="text-xs text-slate-500">{p.jobTitle}</p></> },
    { key: "package", header: "Package", cell: (p) => p.package ?? "—" },
    { key: "drive", header: "Drive date", cell: (p) => fmtDate(p.driveDate) },
    { key: "deadline", header: "Apply by", cell: (p) => fmtDate(p.deadline) },
    { key: "status", header: "Status", cell: (p) => <Badge tone={p.status === "ARCHIVED" ? "slate" : approvalTone(p.status === "PUBLISHED" ? "APPROVED" : "PENDING")}>{pretty(p.status)}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (p) => <RowActions actions={[{ label: `Edit ${p.company}`, icon: Pencil, onClick: () => setEditing(p) }, { label: `Delete ${p.company}`, icon: Trash2, danger: true, onClick: () => setDeleting(p) }]} /> },
  ];

  return (
    <>
      <PageHeader title="Placements" subtitle="Campus drives shown to students when published" actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add drive</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search company or job title" aria-label="Search placements" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No placement drives" emptyHint="Add the first drive." />
      </div>
      <PlacementModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this drive?" message={`${deleting?.company} - ${deleting?.jobTitle} will be permanently removed.`} busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}

function PlacementModal({ target, onClose, onSaved }: { target: PlacementRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const p = target && target !== "new" ? target : null;
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });
  useEffect(() => {
    setError(null);
    if (target) reset(p ? { company: p.company, jobTitle: p.jobTitle, eligibility: p.eligibility ?? "", package: p.package ?? "", location: p.location ?? "", driveDate: p.driveDate?.slice(0, 10) ?? "", deadline: p.deadline?.slice(0, 10) ?? "", description: p.description ?? "", status: p.status } : empty);
  }, [target, p, reset]);

  const submit = async (v: Values) => {
    setError(null);
    try {
      if (p) await api(`/placements/${p.id}`, { method: "PATCH", body: v }); else await api("/placements", { body: v });
      toast.success(p ? "Changes saved successfully." : "Placement drive created successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={p ? "Edit drive" : "Add drive"} onClose={onClose} wide>
      <form onSubmit={handleSubmit(submit)} className="space-y-3" noValidate>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Company" id="p-company" error={errors.company?.message}><input id="p-company" className="input" {...register("company")} /></FormField>
          <FormField label="Job title" id="p-job" error={errors.jobTitle?.message}><input id="p-job" className="input" {...register("jobTitle")} /></FormField>
          <FormField label="Package" id="p-package"><input id="p-package" className="input" placeholder="4 LPA" {...register("package")} /></FormField>
          <FormField label="Location" id="p-loc"><input id="p-loc" className="input" {...register("location")} /></FormField>
          <FormField label="Drive date" id="p-drive"><input id="p-drive" type="date" className="input" {...register("driveDate")} /></FormField>
          <FormField label="Apply by" id="p-deadline"><input id="p-deadline" type="date" className="input" {...register("deadline")} /></FormField>
          <FormField label="Eligibility" id="p-elig" className="sm:col-span-2"><input id="p-elig" className="input" placeholder="B.Sc. CS, 60% and above" {...register("eligibility")} /></FormField>
        </div>
        <FormField label="Description" id="p-desc"><textarea id="p-desc" rows={3} className="input" {...register("description")} /></FormField>
        <FormField label="Status" id="p-status"><select id="p-status" className="input" {...register("status")}><option value="DRAFT">Draft (hidden)</option><option value="PUBLISHED">Published (visible to students)</option><option value="ARCHIVED">Archived</option></select></FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {p ? "Save changes" : "Create drive"}</button>
        </div>
      </form>
    </Modal>
  );
}
