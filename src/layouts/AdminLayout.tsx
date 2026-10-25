import { Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut, Menu, X } from "lucide-react";
import { motion } from "framer-motion";
import { LoadingState } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { adminNav } from "@/routes/adminNav";
import { NotificationBell } from "@/components/NotificationBell";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // Always close the mobile menu once the page changes.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Hide links the role cannot use. The API still enforces access on every request.
  const nav = useMemo(
    () =>
      adminNav
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => !i.roles || user?.role === "SUPER_ADMIN" || (user && i.roles.includes(user.role))),
        }))
        .filter((g) => g.items.length),
    [user],
  );

  const sidebar = (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Admin">
      {nav.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-slate-500">{g.title}</p>}
          {g.items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50"}`
              }
            >
              <i.icon className="h-4 w-4" aria-hidden />
              {i.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><GraduationCap className="h-4 w-4" /></span>
      <span className="text-sm font-semibold">SCSCO Admin</span>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {brand}
        {sidebar}
      </aside>
      {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} transition={{ duration: 0.2 }} className="relative flex h-full w-64 flex-col bg-white">
              {brand}
              {sidebar}
            </motion.aside>
          </motion.div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button className="lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>{open ? <X /> : <Menu />}</button>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <div className="text-right text-sm leading-tight">
              <p className="font-medium">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.loginId} · {user?.role.replace("_", " ")}</p>
            </div>
            <button
              className="btn-secondary"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 outline-none md:p-6"><Suspense fallback={<LoadingState rows={4} />}><Outlet /></Suspense></main>
      </div>
    </div>
  );
}
