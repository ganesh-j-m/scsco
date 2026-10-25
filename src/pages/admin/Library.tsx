import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookUp, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { Badge, ConfirmDialog, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import { fmtDate, inr } from "@/components/portal";
import type { BookRow, IssueRow } from "@/types/admin";

export default function Library() {
  const [tab, setTab] = useState<"books" | "issues">("books");
  return (
    <>
      <PageHeader title="Library" subtitle="Books catalogue and issue / return" />
      <div className="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
        {(["books", "issues"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t === "books" ? "Books" : "Issued books"}</button>
        ))}
      </div>
      {tab === "books" ? <Books /> : <Issues />}
    </>
  );
}

function Books() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [availableOnly, setAvailableOnly] = useState("");
  const list = usePaged<BookRow>("/library/books", { search: q, availableOnly });
  const [editing, setEditing] = useState<BookRow | "new" | null>(null);
  const [issuing, setIssuing] = useState<BookRow | null>(null);
  const [deleting, setDeleting] = useState<BookRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/library/books/${deleting.id}`, { method: "DELETE" }); toast.success("Record deleted successfully."); setDeleting(null); void list.reload(); }
    catch (e) { toast.error(apiMessage(e, "Unable to delete")); setDeleting(null); }
    finally { setBusy(false); }
  };

  const columns: Column<BookRow>[] = [
    { key: "title", header: "Book", cell: (b) => <><p className="font-medium">{b.title}</p><p className="text-xs text-slate-500">{b.author}</p></> },
    { key: "cat", header: "Category", cell: (b) => b.category },
    { key: "isbn", header: "ISBN", cell: (b) => <span className="font-mono text-xs">{b.isbn}</span> },
    { key: "copies", header: "Available", cell: (b) => <Badge tone={b.available > 0 ? "green" : "red"}>{b.available} / {b.totalCopies}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (b) => (
      <RowActions actions={[
        ...(b.available > 0 ? [{ label: `Issue ${b.title}`, icon: BookUp, onClick: () => setIssuing(b) }] : []),
        { label: `Edit ${b.title}`, icon: Pencil, onClick: () => setEditing(b) },
        { label: `Delete ${b.title}`, icon: Trash2, danger: true, onClick: () => setDeleting(b) },
      ]} />
    ) },
  ];

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add book</button></div>
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search title, author or ISBN" aria-label="Search books" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Availability" value={availableOnly} onChange={(e) => setAvailableOnly(e.target.value)}><option value="">All books</option><option value="true">Available only</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No books found" emptyHint="Add books to the catalogue." />
      </div>
      <BookModal target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />
      <IssueModal book={issuing} onClose={() => setIssuing(null)} onSaved={() => { setIssuing(null); void list.reload(); }} />
      <ConfirmDialog open={!!deleting} title="Delete this book?" message={`${deleting?.title} will be removed from the catalogue. Books with issue history cannot be deleted.`} busy={busy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}

const bookSchema = z.object({
  title: z.string().trim().min(1, "Enter a title"), author: z.string().trim().min(1, "Enter an author"), category: z.string().trim().min(1, "Enter a category"),
  isbn: z.string().trim().min(5, "At least 5 characters"), totalCopies: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, "Enter a whole number, 1 or more"),
});
type BookValues = z.infer<typeof bookSchema>;
const emptyBook: BookValues = { title: "", author: "", category: "", isbn: "", totalCopies: "1" };

function BookModal({ target, onClose, onSaved }: { target: BookRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const book = target && target !== "new" ? target : null;
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<BookValues>({ resolver: zodResolver(bookSchema), defaultValues: emptyBook });
  useEffect(() => { setError(null); if (target) reset(book ? { title: book.title, author: book.author, category: book.category, isbn: book.isbn, totalCopies: String(book.totalCopies) } : emptyBook); }, [target, book, reset]);

  const submit = async (v: BookValues) => {
    setError(null);
    try {
      const body = { ...v, totalCopies: Number(v.totalCopies) };
      if (book) await api(`/library/books/${book.id}`, { method: "PATCH", body }); else await api("/library/books", { body });
      toast.success(book ? "Changes saved successfully." : "Book added successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e)); }
  };

  return (
    <Modal open={!!target} title={book ? "Edit book" : "Add book"} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-3" noValidate>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <FormField label="Title" id="b-title" error={errors.title?.message}><input id="b-title" className="input" {...register("title")} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Author" id="b-author" error={errors.author?.message}><input id="b-author" className="input" {...register("author")} /></FormField>
          <FormField label="Category" id="b-cat" error={errors.category?.message}><input id="b-cat" className="input" {...register("category")} /></FormField>
          <FormField label="ISBN" id="b-isbn" error={errors.isbn?.message}><input id="b-isbn" className="input" {...register("isbn")} /></FormField>
          <FormField label="Total copies" id="b-copies" error={errors.totalCopies?.message}><input id="b-copies" inputMode="numeric" className="input" {...register("totalCopies")} /></FormField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} {book ? "Save changes" : "Add book"}</button>
        </div>
      </form>
    </Modal>
  );
}

function IssueModal({ book, onClose, onSaved }: { book: BookRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [studentId, setStudentId] = useState("");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (book) { setStudentId(""); setDays("14"); setError(null); } }, [book]);

  const save = async () => {
    if (!book) return;
    setBusy(true);
    setError(null);
    try { await api("/library/issues", { body: { bookId: book.id, studentId, days: Number(days) } }); toast.success("Book issued successfully."); onSaved(); }
    catch (e) { setError(apiMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!book} title="Issue book" onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="mb-3 text-sm text-slate-600">{book?.title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Student ID" id="i-student"><input id="i-student" className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)} /></FormField>
        <FormField label="Loan period (days)" id="i-days"><input id="i-days" inputMode="numeric" className="input" value={days} onChange={(e) => setDays(e.target.value)} /></FormField>
      </div>
      <p className="mt-2 text-xs text-slate-500">A student can hold up to 3 books. Late fine is ₹2 per day.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !studentId.trim()} onClick={save}>{busy && <Spinner />} Issue book</button>
      </div>
    </Modal>
  );
}

function Issues() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [state, setState] = useState("active");
  const list = usePaged<IssueRow>("/library/issues", { search: q, state });
  const [returning, setReturning] = useState<IssueRow | null>(null);
  const [busy, setBusy] = useState(false);

  const doReturn = async () => {
    if (!returning) return;
    setBusy(true);
    try {
      const r = await api<{ fine: number }>(`/library/issues/${returning.id}/return`, { method: "POST" });
      toast.success(r.fine > 0 ? `Book returned. Collect a fine of ${inr(r.fine)}.` : "Book returned successfully.");
      setReturning(null);
      void list.reload();
    } catch (e) { toast.error(apiMessage(e, "Unable to return the book")); setReturning(null); }
    finally { setBusy(false); }
  };

  const columns: Column<IssueRow>[] = [
    { key: "book", header: "Book", cell: (i) => i.book.title },
    { key: "student", header: "Student", cell: (i) => <><p className="font-medium">{i.student?.user.name}</p><p className="text-xs text-slate-500">{i.student?.studentId}</p></> },
    { key: "issued", header: "Issued", cell: (i) => fmtDate(i.issuedAt) },
    { key: "due", header: "Due", cell: (i) => fmtDate(i.dueDate) },
    { key: "state", header: "Status", cell: (i) => i.returnedAt ? <Badge tone="slate">Returned {fmtDate(i.returnedAt)}</Badge> : <Badge tone={i.overdue ? "red" : "green"}>{i.overdue ? "Overdue" : "Issued"}</Badge> },
    { key: "fine", header: "Fine", cell: (i) => (i.fine > 0 ? inr(i.fine) : "—") },
    { key: "actions", header: "Actions", className: "text-right", cell: (i) => (i.returnedAt ? null : <RowActions actions={[{ label: `Return ${i.book.title}`, icon: RotateCcw, onClick: () => setReturning(i) }]} />) },
  ];

  return (
    <>
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search book, student or ID" aria-label="Search issues" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter" value={state} onChange={(e) => setState(e.target.value)}><option value="active">Currently issued</option><option value="overdue">Overdue</option><option value="returned">Returned</option><option value="">All</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No records" emptyHint="Issued books appear here." />
      </div>
      <ConfirmDialog open={!!returning} title="Mark as returned?" message={`${returning?.book.title} from ${returning?.student?.user.name}.${returning && returning.fine > 0 ? ` A late fine of ${inr(returning.fine)} applies.` : ""}`} confirmLabel="Mark returned" busy={busy} onConfirm={doReturn} onCancel={() => setReturning(null)} />
    </>
  );
}
