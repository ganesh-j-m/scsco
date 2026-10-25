import { useState } from "react";
import { ClipboardEdit, Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaged } from "@/hooks/usePaged";
import { Badge, PageHeader } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { APPROVAL_STATUSES, ReviewModal } from "@/components/review";
import { approvalTone, fmtDate, pretty } from "@/components/portal";
import type { CertificateRow } from "@/types/admin";

export default function Certificates() {
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const list = usePaged<CertificateRow>("/certificates", { search: q, status });
  const [target, setTarget] = useState<CertificateRow | null>(null);

  const columns: Column<CertificateRow>[] = [
    { key: "student", header: "Student", cell: (c) => <><p className="font-medium">{c.student?.user.name}</p><p className="text-xs text-slate-500">{c.student?.studentId}</p></> },
    { key: "type", header: "Certificate", cell: (c) => <><p>{c.type}</p>{c.reason && <p className="line-clamp-1 text-xs text-slate-500">{c.reason}</p>}</> },
    { key: "date", header: "Requested", cell: (c) => fmtDate(c.createdAt) },
    { key: "status", header: "Status", cell: (c) => <Badge tone={approvalTone(c.status)}>{pretty(c.status)}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (c) => <RowActions actions={[{ label: `Review request from ${c.student?.user.name}`, icon: ClipboardEdit, onClick: () => setTarget(c) }]} /> },
  ];

  return (
    <>
      <PageHeader title="Certificates" subtitle="Certificate requests from students" />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search student or certificate type" aria-label="Search certificates" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{APPROVAL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No certificate requests" emptyHint="Requests made from the student portal appear here." />
      </div>
      <ReviewModal
        open={!!target} title="Review certificate request" endpoint={`/certificates/${target?.id}`} statuses={APPROVAL_STATUSES} field="remarks"
        initialStatus={target?.status ?? "PENDING"} initialText={target?.remarks} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); void list.reload(); }}
        summary={target && <><p className="font-medium">{target.type}</p><p className="text-xs text-slate-500">{target.student?.user.name} ({target.student?.studentId})</p>{target.reason && <p className="mt-1 text-xs">Reason: {target.reason}</p>}</>}
      />
    </>
  );
}
