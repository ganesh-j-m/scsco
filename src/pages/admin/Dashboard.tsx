import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Award, BookMarked, Briefcase, ClipboardCheck, ClipboardList, FormInput, GraduationCap, IndianRupee, MessageSquareWarning, UserCheck, UserCog, Inbox,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { ErrorState, PageHeader } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import type { DashboardStats } from "@/types/admin";

const CARDS: { key: string; label: string; icon: LucideIcon; to?: string }[] = [
  { key: "students", label: "Total students", icon: GraduationCap, to: "/admin/students" },
  { key: "faculty", label: "Total faculty", icon: UserCog, to: "/admin/faculty" },
  { key: "activeUsers", label: "Active users", icon: UserCheck, to: "/admin/users" },
  { key: "pendingAdmissions", label: "Pending admissions", icon: ClipboardList, to: "/admin/admissions" },
  { key: "todayAttendance", label: "Present today", icon: ClipboardCheck, to: "/admin/attendance" },
  { key: "pendingFees", label: "Pending fees", icon: IndianRupee, to: "/admin/fees" },
  { key: "certificateRequests", label: "Certificate requests", icon: Award, to: "/admin/certificates" },
  { key: "openGrievances", label: "Open grievances", icon: MessageSquareWarning, to: "/admin/grievances" },
  { key: "activePlacements", label: "Active placement drives", icon: Briefcase, to: "/admin/placements" },
  { key: "libraryIssues", label: "Library issues", icon: BookMarked, to: "/admin/library" },
  { key: "activeForms", label: "Active forms", icon: FormInput, to: "/admin/forms" },
  { key: "formSubmissions", label: "Form submissions", icon: Inbox, to: "/admin/forms" },
];

function Skeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading">
      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
    </div>
  );
}

function BarCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-700">{title}</h2>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No data yet</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="value" name="Count" fill="#1f5fa8" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<DashboardStats>("/dashboard/stats");
  const subtitle = data?.scope === "department" ? "Your department at a glance" : data?.scope === "own" ? "Your activity" : "College overview";

  return (
    <>
      <PageHeader title={`Welcome, ${user?.name ?? ""}`} subtitle={subtitle} />
      {loading && !data ? <Skeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CARDS.filter((c) => data.stats[c.key] !== null && data.stats[c.key] !== undefined).map((c) => {
              const inner = (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><c.icon className="h-5 w-5" aria-hidden /></span>
                  <div><p className="text-2xl font-semibold"><CountUp value={Number(data.stats[c.key])} /></p><p className="text-xs text-slate-500">{c.label}</p></div>
                </>
              );
              return c.to ? (
                <Link key={c.key} to={c.to} className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-md">{inner}</Link>
              ) : (
                <div key={c.key} className="card flex items-center gap-3 p-4">{inner}</div>
              );
            })}
          </div>
          {data.charts && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <BarCard title="Students by department" data={data.charts.studentsByDepartment} />
              <BarCard title="Active users by role" data={data.charts.usersByRole} />
            </div>
          )}
        </>
      )}
    </>
  );
}
