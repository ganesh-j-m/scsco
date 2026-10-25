import { useState, type ReactNode } from "react";
import { useApi } from "@/hooks/useApi";

export interface Child { id: string; studentId: string; name: string }

/** Student sees themselves; a parent can switch between linked children. */
export function useChildren() {
  const r = useApi<{ data: Child[] }>("/attendance/children");
  const [selected, setSelected] = useState("");
  const kids = r.data?.data ?? [];
  const studentId = selected || kids[0]?.id || "";
  const picker: ReactNode = kids.length > 1 ? (
    <div className="mb-4">
      <label htmlFor="child" className="mr-2 text-sm text-slate-600">Student</label>
      <select id="child" className="input w-auto" value={studentId} onChange={(e) => setSelected(e.target.value)}>
        {kids.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.studentId})</option>)}
      </select>
    </div>
  ) : null;
  return { loading: r.loading, error: r.error, reload: r.reload, kids, studentId, picker };
}

export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "UTC" }) : "—");
export const approvalTone = (s: string) => (s === "APPROVED" || s === "RESOLVED" || s === "PAID" || s === "PUBLISHED" ? "green" : s === "REJECTED" || s === "OVERDUE" ? "red" : s === "IN_REVIEW" || s === "PARTIAL" ? "blue" : "amber") as "green" | "red" | "blue" | "amber";
export const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
