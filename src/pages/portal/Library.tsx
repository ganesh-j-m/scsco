import { useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { fmtDate, inr, useChildren } from "@/components/portal";
import type { BookRow, IssueRow } from "@/types/admin";

export default function PortalLibrary() {
  const { user } = useAuth();
  const family = user?.role === "STUDENT" || user?.role === "PARENT";
  const kids = useChildren();
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [availableOnly, setAvailableOnly] = useState("");
  const list = usePaged<BookRow>("/library/books", { search: q, availableOnly });
  const mine = useApi<{ data: IssueRow[]; finePerDay: number }>(family && kids.studentId ? `/library/my?studentId=${kids.studentId}` : null);

  const columns: Column<BookRow>[] = [
    { key: "title", header: "Book", cell: (b) => <><p className="font-medium">{b.title}</p><p className="text-xs text-slate-500">{b.author}</p></> },
    { key: "cat", header: "Category", cell: (b) => b.category },
    { key: "avail", header: "Availability", cell: (b) => <Badge tone={b.available > 0 ? "green" : "red"}>{b.available > 0 ? `${b.available} available` : "Not available"}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Library" subtitle="Search the catalogue and see your issued books" />
      {family && (
        <>
          {kids.picker}
          <h2 className="mb-3 font-medium">Issued books</h2>
          {mine.loading ? <LoadingState rows={2} /> : mine.error ? <ErrorState message={mine.error} onRetry={mine.reload} /> : !mine.data?.data.length ? <div className="card mb-8"><EmptyState title="No books issued" /></div> : (
            <div className="card mb-8 divide-y divide-slate-100">
              {mine.data.data.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div><p className="font-medium">{i.book.title}</p><p className="text-xs text-slate-500">Issued {fmtDate(i.issuedAt)} · Due {fmtDate(i.dueDate)}</p></div>
                  <div className="text-right">{i.returnedAt ? <Badge tone="slate">Returned</Badge> : <Badge tone={i.overdue ? "red" : "green"}>{i.overdue ? "Overdue" : "Issued"}</Badge>}{i.fine > 0 && <p className="mt-1 text-xs text-red-600">Fine {inr(i.fine)}</p>}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <h2 className="mb-3 font-medium">Catalogue</h2>
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search title, author or ISBN" aria-label="Search books" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Availability" value={availableOnly} onChange={(e) => setAvailableOnly(e.target.value)}><option value="">All books</option><option value="true">Available only</option></select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No books found" />
      </div>
    </>
  );
}
