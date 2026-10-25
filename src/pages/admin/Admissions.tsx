import { useState } from "react";
import { ClipboardEdit, Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useLookup } from "@/hooks/useLookup";
import { usePaged } from "@/hooks/usePaged";
import { Badge, PageHeader } from "@/components/ui";
import { DataTable, RowActions, type Column } from "@/components/DataTable";
import { APPROVAL_STATUSES, ReviewModal } from "@/components/review";
import { approvalTone, fmtDate, pretty } from "@/components/portal";
import type { AdmissionRow } from "@/types/admin";

export default function Admissions() {
  const [search, setSearch] = useState("");
  const q = useDebounce(search);
  const [status, setStatus] = useState("");
  const [courseId, setCourseId] = useState("");
  const courses = useLookup("courses");
  const list = usePaged<AdmissionRow>("/admissions", { search: q, status, courseId });
  const [target, setTarget] = useState<AdmissionRow | null>(null);

  const columns: Column<AdmissionRow>[] = [
    { key: "ref", header: "Reference", cell: (a) => <span className="font-mono text-xs">{a.reference}</span> },
    { key: "name", header: "Applicant", cell: (a) => <><p className="font-medium">{a.applicantName}</p><p className="text-xs text-slate-500">{a.email} · {a.phone}</p></> },
    { key: "course", header: "Course", cell: (a) => a.courseName ?? "—" },
    { key: "marks", header: "Previous marks", cell: (a) => (a.previousMarks != null ? `${a.previousMarks}%` : "—") },
    { key: "date", header: "Applied", cell: (a) => fmtDate(a.createdAt) },
    { key: "status", header: "Status", cell: (a) => <Badge tone={approvalTone(a.status)}>{pretty(a.status)}</Badge> },
    { key: "actions", header: "Actions", className: "text-right", cell: (a) => <RowActions actions={[{ label: `Review ${a.applicantName}`, icon: ClipboardEdit, onClick: () => setTarget(a) }]} /> },
  ];

  return (
    <>
      <PageHeader title="Admissions" subtitle="Applications submitted from the public website" />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input className="input pl-9" placeholder="Search name, email or phone" aria-label="Search applications" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{APPROVAL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className="input w-auto" aria-label="Filter by course" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No applications" emptyHint="Applications from the website admission form appear here." />
      </div>
      <ReviewModal
        open={!!target} title="Review application" endpoint={`/admissions/${target?.id}`} statuses={APPROVAL_STATUSES} field="remarks"
        initialStatus={target?.status ?? "PENDING"} initialText={target?.remarks} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); void list.reload(); }}
        summary={target && <><p className="font-medium">{target.applicantName} · {target.courseName ?? "No course chosen"}</p><p className="text-xs text-slate-500">{target.email} · {target.phone}</p>{target.address && <p className="mt-1 text-xs">{target.address}</p>}</>}
      />
    </>
  );
}
