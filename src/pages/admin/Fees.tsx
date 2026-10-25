import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { IndianRupee, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { useLookup } from "@/hooks/useLookup";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import { approvalTone, fmtDate, inr, pretty } from "@/components/portal";
import type { FeeRow } from "@/types/admin";

export default function Fees() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const [courseId, setCourseId] = useState("");
  const courses = useLookup("courses");
  const list = usePaged<FeeRow>("/fees", { search: q, status, courseId });
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<FeeRow | null>(null);
  const [deleting, setDeleting] = useState<FeeRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/fees/${deleting.id}`, { method: "DELETE" }); toast.success("Record deleted successfully."); setDeleting(null); void list.reload(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<FeeRow>[] = [
    { key: "student", header: "Student", cell: (f) => <><p className="font-medium">{f.student?.user.name}</p><p className="text-xs text-slate-500">{f.student?.studentId}</p></> },
    { key: "title", header: "Fee", cell: (f) => <><p>{f.title}</p>{f.receiptNo && <p className="font-mono text-xs text-slate-500">{f.receiptNo}</p>}</> },
    { key: "amount", header: "Amount", cell: (f) => inr(f.amount) },
    { key: "paid", header: "Paid / Balance", cell: (f) => <>{inr(f.paid)} <span className="text-slate-500">/</span> {inr(f.balance)}</> },
    { key: "due", header: "Due date", cell: (f) => fmtDate(f.dueDate) },
    { key: "status", header: "Status", cell: (f) => <Badge tone={approvalTone(f.status)}>{pretty(f.status)}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (f) => (
      <RowActions actions={[
        ...(f.balance > 0 ? [{ label: `Record payment for ${f.student?.user.name}`, icon: IndianRupee, onClick: () => setPaying(f) }] : []),
        ...(f.paid === 0 ? [{ label: `Delete ${f.title}`, icon: Trash2, danger: true, onClick: () => setDeleting(f) }] : []),
      ]} />
    ) },
  ];

  return (
    <>
      <PageHeader title="Fees" subtitle="Create fees, record payments and issue receipts" actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add fee</button>} />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search student, ID or fee title" aria-label="Search fees" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="PARTIAL">Partial</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue</option></select>
          <select className="input w-auto" aria-label="Filter by course" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No fee records" emptyHint="Add a fee for a student or a whole class." />
      </div>
      <CreateFee open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void list.reload(); }} />
      <PaymentModal fee={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this fee?" message={`"${deleting?.title}" for ${deleting?.student?.user.name} will be removed. Fees with payments cannot be deleted.`} busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}

const feeSchema = z.object({
  title: z.string().trim().min(2, "Enter a title"),
  amount: z.string().refine((v) => Number(v) > 0, "Enter an amount greater than 0"),
  dueDate: z.string().min(1, "Choose a due date"),
  target: z.enum(["student", "class"]),
  studentId: z.string().trim().optional(),
  courseId: z.string().optional(),
  year: z.string().optional(),
  division: z.string().trim().optional(),
}).superRefine((v, ctx) => {
  if (v.target === "student" && !v.studentId) ctx.addIssue({ code: "custom", path: ["studentId"], message: "Enter a Student ID" });
  if (v.target === "class" && !v.courseId) ctx.addIssue({ code: "custom", path: ["courseId"], message: "Choose a course" });
});
type FeeValues = z.infer<typeof feeSchema>;

function CreateFee({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const courses = useLookup("courses");
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FeeValues>({ resolver: zodResolver(feeSchema), defaultValues: { title: "", amount: "", dueDate: "", target: "class", studentId: "", courseId: "", year: "", division: "" } });
  const target = watch("target");

  const submit = async (v: FeeValues) => {
    setError(null);
    try {
      const r = await api<{ created: number }>("/fees", { body: { title: v.title, amount: Number(v.amount), dueDate: v.dueDate, ...(v.target === "student" ? { studentId: v.studentId } : { courseId: v.courseId, year: v.year || undefined, division: v.division || undefined }) } });
      toast.success(`Fee created for ${r.created} student${r.created === 1 ? "" : "s"}.`);
      reset();
      onSaved();
    } catch (e) { setError(apiMessage(e)); }
  };

  return (
    <Modal open={open} title="Add fee" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-3" noValidate>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <FormField label="Fee title" id="f-title" error={errors.title?.message}><input id="f-title" className="input" placeholder="Tuition fee - Semester 1" {...register("title")} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Amount (INR)" id="f-amount" error={errors.amount?.message}><input id="f-amount" inputMode="decimal" className="input" {...register("amount")} /></FormField>
          <FormField label="Due date" id="f-due" error={errors.dueDate?.message}><input id="f-due" type="date" className="input" {...register("dueDate")} /></FormField>
        </div>
        <FormField label="Apply to" id="f-target"><select id="f-target" className="input" {...register("target")}><option value="class">A class (course / year / division)</option><option value="student">One student</option></select></FormField>
        {target === "student" ? (
          <FormField label="Student ID" id="f-student" error={errors.studentId?.message}><input id="f-student" className="input" {...register("studentId")} /></FormField>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Course" id="f-course" error={errors.courseId?.message} className="sm:col-span-3"><select id="f-course" className="input" {...register("courseId")}><option value="">Select</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
            <FormField label="Year (optional)" id="f-year"><select id="f-year" className="input" {...register("year")}><option value="">All</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}</select></FormField>
            <FormField label="Division (optional)" id="f-div"><input id="f-div" className="input uppercase" maxLength={5} {...register("division")} /></FormField>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} Create fee</button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentModal({ fee, onClose, onSaved }: { fee: FeeRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!fee) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ receiptNo: string }>(`/fees/${fee.id}/payment`, { body: { amount: Number(amount) } });
      toast.success(`Payment recorded. Receipt ${r.receiptNo}.`);
      setAmount("");
      onSaved();
    } catch (e) { setError(apiMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!fee} title="Record payment" onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {fee && <p className="mb-3 text-sm text-slate-600">{fee.student?.user.name} · {fee.title}<br />Balance: <strong>{inr(fee.balance)}</strong></p>}
      <FormField label="Amount received (INR)" id="p-amount"><input id="p-amount" inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></FormField>
      {fee && <button type="button" className="mt-2 text-sm text-brand-600 hover:underline" onClick={() => setAmount(String(fee.balance))}>Pay full balance</button>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={save}>{busy && <Spinner />} Save payment</button>
      </div>
    </Modal>
  );
}
