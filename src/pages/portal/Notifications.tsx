import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from "@/components/ui";
import { apiMessage } from "@/components/forms";
import type { NotificationRow } from "@/types/admin";

export default function PortalNotifications() {
  const toast = useToast();
  const [unread, setUnread] = useState("");
  const list = usePaged<NotificationRow>("/notifications", { unread }, 15);

  const markRead = async (id: string) => { try { await api(`/notifications/${id}/read`, { method: "POST" }); void list.reload(); } catch (e) { toast.error(apiMessage(e, "Unable to update")); } };
  const markAll = async () => { try { await api("/notifications/read-all", { method: "POST" }); toast.success("All notifications marked as read."); void list.reload(); } catch (e) { toast.error(apiMessage(e, "Unable to update")); } };

  return (
    <>
      <PageHeader title="Notifications" actions={<div className="flex gap-2"><select className="input w-auto" aria-label="Filter" value={unread} onChange={(e) => setUnread(e.target.value)}><option value="">All</option><option value="true">Unread</option></select><button className="btn-secondary" onClick={markAll}>Mark all read</button></div>} />
      {list.loading && !list.rows.length ? <LoadingState rows={4} /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? <div className="card"><EmptyState title="No notifications" hint="You are all caught up." /></div> : (
        <>
          <ul className="card divide-y divide-slate-100">
            {list.rows.map((n) => (
              <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${n.readAt ? "" : "bg-brand-50/40"}`}>
                <div>
                  <p className={n.readAt ? "" : "font-medium"}>{n.title}</p>
                  {n.body && <p className="text-xs text-slate-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString("en-IN")}{n.link && <> · <Link to={n.link} className="text-brand-600 hover:underline" onClick={() => !n.readAt && void markRead(n.id)}>Open</Link></>}</p>
                </div>
                {!n.readAt && <button className="shrink-0 text-xs text-brand-600 hover:underline" onClick={() => markRead(n.id)}>Mark read</button>}
              </li>
            ))}
          </ul>
          {list.meta && <Pagination page={list.meta.page} totalPages={list.meta.totalPages} total={list.meta.total} onChange={list.setPage} />}
        </>
      )}
    </>
  );
}
