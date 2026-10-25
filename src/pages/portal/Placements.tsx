import { useApi } from "@/hooks/useApi";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fmtDate } from "@/components/portal";
import type { PlacementRow } from "@/types/admin";

export default function PortalPlacements() {
  const r = useApi<{ data: PlacementRow[] }>("/placements/open");
  return (
    <>
      <PageHeader title="Placements" subtitle="Open campus drives" />
      {r.loading ? <LoadingState rows={4} /> : r.error ? <ErrorState message={r.error} onRetry={r.reload} /> : !r.data?.data.length ? <div className="card"><EmptyState title="No open drives" hint="New drives will appear here." /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {r.data.data.map((p) => (
            <article key={p.id} className="card p-4">
              <h2 className="font-medium">{p.company}</h2>
              <p className="text-sm text-slate-600">{p.jobTitle}{p.package ? ` · ${p.package}` : ""}{p.location ? ` · ${p.location}` : ""}</p>
              {p.eligibility && <p className="mt-2 text-xs text-slate-500">Eligibility: {p.eligibility}</p>}
              {p.description && <p className="mt-2 text-sm text-slate-700">{p.description}</p>}
              <p className="mt-3 text-xs text-slate-500">Drive: {fmtDate(p.driveDate)} · Apply by: {fmtDate(p.deadline)}</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
