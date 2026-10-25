import { useState } from "react";
import { ClipboardEdit, Search } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { Badge, PageHeader } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { GRIEVANCE_STATUSES, ReviewModal } from "@/components/review";
import { approvalTone, fmtDate, pretty } from "@/components/portal";
import type { GrievanceRow } from "@/types/admin";

export default function Grievances() {
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const cats = useApi<{ data: string[] }>("/grievances/categories");
  const list = usePaged<GrievanceRow>("/grievances", { search: q, status, category });
  const [target, setTarget] = useState<GrievanceRow | null>(null);

  const columns: Column<GrievanceRow>[] = [
    { key: "subject", header: "Grievance", cell: (g) => <><p className="font-medium">{g.subject}</p><p className="text-xs text-slate-500">{g.category}</p></> },
    { key: "by", header: "Submitted by", cell: (g) => <><p>{g.user?.name}</p><p className="text-xs text-slate-500">{g.user?.loginId} · {pretty(g.user?.role ?? "")}</p></> },
    { key: "date", header: "Date", cell: (g) => fmtDate(g.createdAt) },
    { key: "status", header: "Status", cell: (g) => <Badge tone={approvalTone(g.status)}>{pretty(g.status)}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (g) => <RowActions actions={[{ label: `Respond to ${g.subject}`, icon: ClipboardEdit, onClick: () => setTarget(g) }]} /> },
  ];

  return (
    <>
      <PageHeader title="Grievances" subtitle="Complaints raised by students, parents and staff" />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search subject, name or Login ID" aria-label="Search grievances" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{GRIEVANCE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className="input w-auto" aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{cats.data?.data.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No grievances" emptyHint="Grievances submitted from the portal appear here." />
      </div>
      <ReviewModal
        open={!!target} title="Respond to grievance" endpoint={`/grievances/${target?.id}`} statuses={GRIEVANCE_STATUSES} field="response"
        initialStatus={target?.status ?? "OPEN"} initialText={target?.response} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); void list.reload(); }}
        summary={target && <><p className="font-medium">{target.subject}</p><p className="mt-1 whitespace-pre-wrap text-xs">{target.description}</p></>}
      />
    </>
  );
}
