import { AssistantWidget } from "@/components/AssistantWidget";
import { Suspense } from "react";
import { LoadingState } from "@/components/ui";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut } from "lucide-react";
import { STAFF_ROLES } from "@/routes/guards";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { PrincipalStatus } from "@/components/PrincipalStatus";

const links = ["dashboard", "profile", "attendance", "scan", "assignments", "study-material", "exams", "results", "fees", "certificates", "placements", "library", "grievances", "forms", "event-requests", "notifications"];

export default function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (user && STAFF_ROLES.includes(user.role)) return <Navigate to="/admin/dashboard" replace />;
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><GraduationCap className="h-4 w-4" /></span>
            SCSCO Portal
          </span>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="hidden text-sm sm:block">{user?.name} · {user?.loginId}</span>
            <button className="btn-secondary" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}>
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Portal">
          {links.map((l) => (
            <NavLink key={l} to={`/portal/${l}`} className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm capitalize ${isActive ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
              {l === "scan" ? "Scan QR" : l.replace(/-/g, " ")}
            </NavLink>
          ))}
        </nav>
      </header>
      <PrincipalStatus />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl p-4 outline-none md:p-6"><Suspense fallback={<LoadingState rows={4} />}><Outlet /></Suspense></main>
      <AssistantWidget />
    </div>
  );
}