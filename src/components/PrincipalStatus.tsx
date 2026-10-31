import { useCallback, useEffect, useState } from "react";
import { Building2, DoorClosed } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface St { status: "IN_OFFICE" | "NOT_AVAILABLE" | "UNSET"; note: string; updatedAt: string | null }

/** Shows whether the Principal is in college today. The Principal (or Super Admin) also gets one-click buttons. */
export function PrincipalStatus() {
  const { user } = useAuth();
  const canSet = user?.role === "PRINCIPAL" || user?.role === "SUPER_ADMIN";
  const [st, setSt] = useState<St | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    fetch("/api/principal-status", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((j: St | null) => { if (j) setSt(j); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [load]);

  const set = async (status: "IN_OFFICE" | "NOT_AVAILABLE") => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/principal-status", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? "Unable to update");
      setSt(j as St); setNote("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Unable to update"); }
    finally { setBusy(false); }
  };

  if (!st || !user) return null;
  if (st.status === "UNSET" && !canSet) return null;
  const inOffice = st.status === "IN_OFFICE";
  const tone = st.status === "UNSET" ? "border-slate-200 bg-white text-slate-700" : inOffice ? "border-green-200 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-3 md:px-6" role="status">
      <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2 text-sm ${tone}`}>
        {inOffice ? <Building2 className="h-4 w-4 shrink-0" aria-hidden /> : <DoorClosed className="h-4 w-4 shrink-0" aria-hidden />}
        <p className="min-w-0 flex-1">
          <b>{st.status === "UNSET" ? "Principal status not set for today" : inOffice ? "Principal is in the office" : "Principal is not available in college"}</b>
          {st.note && <span> · {st.note}</span>}
        </p>
        {canSet && (
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-48 py-1 text-xs" placeholder="Note (e.g. back at 3 PM)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note for everyone" />
            <button className="btn-primary py-1 text-xs" disabled={busy} onClick={() => set("IN_OFFICE")}>I am in office</button>
            <button className="btn-secondary py-1 text-xs" disabled={busy} onClick={() => set("NOT_AVAILABLE")}>Not available today</button>
          </div>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
