import { Link } from "react-router-dom";
import { useApi } from "@/hooks/useApi";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fmtDate } from "@/components/portal";
import type { PortalFormRow } from "@/types/admin";

export default function PortalForms() {
  const r = useApi<{ data: PortalFormRow[] }>("/forms/portal/list");
  return (
    <>
      <PageHeader title="Forms" subtitle="Forms and surveys sent to you by the college" />
      {r.loading ? <LoadingState rows={3} /> : r.error ? <ErrorState message={r.error} onRetry={r.reload} /> : !r.data?.data.length ? <div className="card"><EmptyState title="No forms right now" hint="Forms assigned to you will appear here." /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {r.data.data.map((f) => {
            const done = f.submissions > 0;
            return (
              <article key={f.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{f.title}</h2>
                  <Badge tone={f.state === "ended" ? "slate" : f.state === "upcoming" ? "amber" : done ? "green" : "blue"}>{f.state === "ended" ? "Closed" : f.state === "upcoming" ? "Not open yet" : done ? "Submitted" : "Open"}</Badge>
                </div>
                {f.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{f.description}</p>}
                <p className="mt-2 text-xs text-slate-500">{f.startAt && f.state === "upcoming" ? `Opens ${fmtDate(f.startAt)}` : f.endAt ? `Closes ${fmtDate(f.endAt)}` : "No closing date"}</p>
                <div className="mt-3"><Link className="btn-secondary" to={`/portal/forms/${f.id}`}>{f.state !== "open" ? "View" : done ? (f.allowEditAfterSubmission || f.allowMultipleSubmissions ? "Open again" : "View") : "Fill form"}</Link></div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
