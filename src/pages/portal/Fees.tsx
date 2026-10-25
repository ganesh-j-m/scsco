import { useApi } from "@/hooks/useApi";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { approvalTone, fmtDate, inr, pretty, useChildren } from "@/components/portal";
import type { FeeRow } from "@/types/admin";

export default function PortalFees() {
  const kids = useChildren();
  const fees = useApi<{ data: FeeRow[]; totals: { amount: number; paid: number; due: number } }>(kids.studentId ? `/fees/my?studentId=${kids.studentId}` : null);

  if (kids.loading) return <LoadingState rows={4} />;
  if (kids.error) return <ErrorState message={kids.error} onRetry={kids.reload} />;
  if (!kids.kids.length) return <><PageHeader title="Fees" /><div className="card"><EmptyState title="No student linked" hint="No student profile is linked to this account yet." /></div></>;

  return (
    <>
      <PageHeader title="Fees" subtitle="Fee status and payment receipts. Payments are recorded at the college office." />
      {kids.picker}
      {fees.loading ? <LoadingState rows={4} /> : fees.error ? <ErrorState message={fees.error} onRetry={fees.reload} /> : fees.data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {([["Total fees", fees.data.totals.amount], ["Paid", fees.data.totals.paid], ["Balance due", fees.data.totals.due]] as const).map(([l, v]) => (
              <div key={l} className="card p-4"><p className="text-sm text-slate-500">{l}</p><p className={`text-2xl font-semibold ${l === "Balance due" && v > 0 ? "text-red-600" : ""}`}>{inr(v)}</p></div>
            ))}
          </div>
          {fees.data.data.length === 0 ? <div className="card"><EmptyState title="No fees" hint="Fees added by the college appear here." /></div> : (
            <div className="card divide-y divide-slate-100">
              {fees.data.data.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div><p className="font-medium">{f.title}</p><p className="text-xs text-slate-500">Due {fmtDate(f.dueDate)}{f.receiptNo ? ` · Receipt ${f.receiptNo}` : ""}</p></div>
                  <div className="text-right"><p>{inr(f.paid)} of {inr(f.amount)}</p><Badge tone={approvalTone(f.status)}>{pretty(f.status)}</Badge></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
