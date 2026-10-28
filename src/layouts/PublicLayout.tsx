import { AssistantWidget } from "@/components/AssistantWidget";
import { Suspense } from "react";
import { LoadingState } from "@/components/ui";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { GraduationCap, Mail, MapPin, Menu, Phone, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { homeFor } from "@/routes/guards";
import { useSite } from "@/hooks/useSite";

const links = [
  ["About", "/about"], ["Academics", "/academics"], ["Departments", "/departments"], ["Admissions", "/admissions"],
  ["Campus Life", "/campus-life"], ["Events", "/events"], ["Placements", "/placements"], ["Contact", "/contact"],
] as const;

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const contact = useSite().site["site.contact"] ?? {};
  const cta = user ? { label: "Dashboard", to: homeFor(user.role) } : { label: "Login", to: "/login" };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2" aria-label="SCSCO home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold leading-tight text-slate-900">
              Chatrapati Shivaji College
              <span className="block text-xs font-normal text-slate-500">Omerga</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Main">
            {links.map(([label, to]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `text-sm ${isActive ? "font-medium text-brand-600" : "text-slate-600 hover:text-slate-900"}`}>
                {label}
              </NavLink>
            ))}
            <Link to={cta.to} className="btn-primary">{cta.label}</Link>
          </nav>
          <button className="lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-slate-200 bg-white lg:hidden"
              aria-label="Mobile"
            >
              <div className="flex flex-col gap-1 p-4">
                {links.map(([label, to]) => (
                  <NavLink key={to} to={to} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    {label}
                  </NavLink>
                ))}
                <Link to={cta.to} onClick={() => setOpen(false)} className="btn-primary mt-2">{cta.label}</Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none"><Suspense fallback={<LoadingState rows={4} />}><Outlet /></Suspense></main>
      <AssistantWidget />
      <footer className="border-t border-slate-200 bg-brand-900 text-brand-100">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-semibold text-white">Shri Chatrapati Shivaji College, Omerga</p>
            {contact.address && <p className="mt-2 flex gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{contact.address}</p>}
            {contact.phone && <p className="mt-1 flex gap-2 text-sm"><Phone className="h-4 w-4 shrink-0" aria-hidden />{contact.phone}</p>}
            {contact.email && <p className="mt-1 flex gap-2 text-sm"><Mail className="h-4 w-4 shrink-0" aria-hidden />{contact.email}</p>}
          </div>
          <FooterLinks title="Academics" items={[["Departments", "/departments"], ["Courses", "/courses"], ["Faculty", "/faculty"], ["Placements", "/placements"]]} />
          <FooterLinks title="Quick links" items={[["Admissions", "/admissions"], ["President's message", "/president-message"], ["Principal's message", "/principal-message"], ["Notices", "/notices"], ["Gallery", "/gallery"], ["Contact", "/contact"], ["Login", "/login"]]} />
        </div>
        <p className="border-t border-white/10 py-4 text-center text-xs">© {new Date().getFullYear()} Sharadabai Pawar College, Omerga. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FooterLinks({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-white">{title}</p>
      <ul className="space-y-1 text-sm">
        {items.map(([label, to]) => (
          <li key={to}><Link to={to} className="hover:text-white">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
