import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, FileText, Info, Megaphone, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from "@/components/ui";
import { apiMessage } from "@/components/forms";
import type { NotificationRow } from "@/types/admin";

// One colour per kind, so a student can tell a notice from a lecture change at a glance.
// (Full class names are written out so Tailwind keeps them.)
interface Kind { label: string; icon: LucideIcon; border: string; unreadBg: string; badge: string; iconBox: string }
const KINDS: Record<string, Kind> = {
  NOTICE: { label: "Notice", icon: Megaphone, border: "border-l-blue-600", unreadBg: "bg-blue-50", badge: "bg-blue-100 text-blue-700", iconBox: "bg-blue-100 text-blue-700" },
  ACADEMIC: { label: "Lecture / Academic", icon: BookOpen, border: "border-l-emerald-600", unreadBg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700", iconBox: "bg-emerald-100 text-emerald-700" },
  ALERT: { label: "Alert", icon: AlertTriangle, border: "border-l-red-600", unreadBg: "bg-red-50", badge: "bg-red-100 text-red-700", iconBox: "bg-red-100 text-red-700" },
  FORM: { label: "Form", icon: FileText, border: "border-l-violet-600", unreadBg: "bg-violet-50", badge: "bg-violet-100 text-violet-700", iconBox: "bg-violet-100 text-violet-700" },
  SYSTEM: { label: "System", icon: Info, border: "border-l-slate-400", unreadBg: "bg-slate-50", badge: "bg-slate-100 text-slate-600", iconBox: "bg-slate-100 text-slate-600" },
};
const kindOf = (t: string) => KINDS[t] ?? KINDS.SYSTEM;

export default function PortalNotifications() {
  const toast = useToast();
  const [unread, setUnread] = useState("");
  const list = usePaged<NotificationRow>("/notifications", { unread }, 15);

  const markRead = async (id: string) => { try { await api(`/notifications/${id}/read`, { method: "POST" }); void list.reload(); } catch (e) { toast.error(apiMessage(e, "Unable to update")); } };
  const markAll = async () => { try { await api("/notifications/read-all", { method: "POST" }); toast.success("All notifications marked as read."); void list.reload(); } catch (e) { toast.error(apiMessage(e, "Unable to update")); } };

  return (
    <>
      <PageHeader title="Notifications" actions={<div className="flex gap-2"><select className="input w-auto" aria-label="Filter" value={unread} onChange={(e) => setUnread(e.target.value)}><option value="">All</option><option value="true">Unread</option></select><button className="btn-secondary" onClick={markAll}>Mark all read</button></div>} />

      <div className="mb-3 flex flex-wrap gap-2 text-xs" aria-label="Colour guide">
        {Object.entries(KINDS).map(([k, v]) => (
          <span key={k} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium ${v.badge}`}><v.icon className="h-3 w-3" aria-hidden /> {v.label}</span>
        ))}
      </div>

      {list.loading && !list.rows.length ? <LoadingState rows={4} /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? <div className="card"><EmptyState title="No notifications" hint="You are all caught up." /></div> : (
        <>
          <ul className="space-y-2">
            {list.rows.map((n) => {
              const k = kindOf(n.type);
              const isNew = !n.readAt;
              return (
                <li key={n.id} className={`card flex items-start justify-between gap-3 border-l-4 px-4 py-3 text-sm ${k.border} ${isNew ? `${k.unreadBg} shadow-sm` : "bg-white opacity-75"}`}>
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${k.iconBox}`}><k.icon className="h-4 w-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${k.badge}`}>{k.label}</span>
                      {isNew && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">NEW</span>}
                    </div>
                    <p className={`mt-1 ${isNew ? "font-semibold text-slate-900" : "text-slate-700"}`}>{n.title}</p>
                    {n.body && <p className="text-xs text-slate-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString("en-IN")}{n.link && <> · <Link to={n.link} className="text-brand-600 hover:underline" onClick={() => isNew && void markRead(n.id)}>Open</Link></>}</p>
                  </div>
                  {isNew && <button className="shrink-0 text-xs text-brand-600 hover:underline" onClick={() => markRead(n.id)}>Mark read</button>}
                </li>
              );
            })}
          </ul>
          {list.meta && <Pagination page={list.meta.page} totalPages={list.meta.totalPages} total={list.meta.total} onChange={list.setPage} />}
        </>
      )}
    </>
  );
}
