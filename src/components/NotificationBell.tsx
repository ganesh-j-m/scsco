import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";

/** Unread count, refreshed every minute while the tab is visible. */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ unread: number }>("/notifications/unread-count").then((r) => alive && setUnread(r.unread)).catch(() => undefined);
    };
    load();
    const t = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, []);
  return (
    <Link to="/portal/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
      <Bell className="h-5 w-5" aria-hidden />
      {unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}
