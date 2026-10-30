import {
  LayoutDashboard, Users, GraduationCap, UserCog, ShieldCheck, Heart, Building2, BookOpen, Library, CalendarClock,
  ClipboardCheck, QrCode, FileText, Award, ClipboardList, IndianRupee, BadgeCheck, MessageSquareWarning, FormInput,
  Briefcase, Bell, Landmark, Trophy, Home, Megaphone, CalendarDays, Image, UserSquare, Phone, Info, ScrollText, Settings,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  phase: string;
  roles?: Role[]; // defaults to all staff roles; SUPER_ADMIN always allowed by the API
}
export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const A: Role[] = ["SUPER_ADMIN", "ADMIN"];
const AP: Role[] = [...A, "PRINCIPAL"];
const AC: Role[] = [...AP, "HOD"];

export const adminNav: NavGroup[] = [
  { title: null, items: [{ label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard, phase: "Phase 3" }] },
  {
    title: "People",
    items: [
      { label: "Users", to: "/admin/users", icon: Users, phase: "Phase 1", roles: A },
      { label: "Students", to: "/admin/students", icon: GraduationCap, phase: "Phase 3", roles: AC },
      { label: "Faculty", to: "/admin/faculty", icon: UserCog, phase: "Phase 3", roles: AC },
      { label: "HODs", to: "/admin/hods", icon: ShieldCheck, phase: "Phase 3", roles: AP },
      { label: "Parents", to: "/admin/parents", icon: Heart, phase: "Phase 3", roles: AP },
    ],
  },
  {
    title: "Academics",
    items: [
      { label: "Departments", to: "/admin/departments", icon: Building2, phase: "Phase 4", roles: AC },
      { label: "Courses", to: "/admin/courses", icon: BookOpen, phase: "Phase 4", roles: AC },
      { label: "Subjects", to: "/admin/subjects", icon: Library, phase: "Phase 4", roles: AC },
      { label: "Timetable", to: "/admin/timetable", icon: CalendarClock, phase: "Phase 4" },
      { label: "Attendance", to: "/admin/attendance", icon: ClipboardCheck, phase: "Phase 5" },
      { label: "QR Attendance", to: "/admin/qr-attendance", icon: QrCode, phase: "Phase 5" },
      { label: "Assignments", to: "/admin/assignments", icon: ClipboardList, phase: "Phase 11" },
      { label: "Study Material", to: "/admin/study-material", icon: BookOpen, phase: "Phase 11" },
      { label: "Examinations", to: "/admin/examinations", icon: FileText, phase: "Phase 6", roles: AC },
      { label: "Results", to: "/admin/results", icon: Award, phase: "Phase 6", roles: AC },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Admissions", to: "/admin/admissions", icon: ClipboardList, phase: "Phase 6", roles: AP },
      { label: "Fees", to: "/admin/fees", icon: IndianRupee, phase: "Phase 6", roles: A },
      { label: "Certificates", to: "/admin/certificates", icon: BadgeCheck, phase: "Phase 6", roles: AP },
      { label: "Grievances", to: "/admin/grievances", icon: MessageSquareWarning, phase: "Phase 7", roles: AP },
      { label: "Notifications", to: "/admin/notifications", icon: Bell, phase: "Phase 7", roles: AP },
      { label: "Forms", to: "/admin/forms", icon: FormInput, phase: "Phase 8" },
    ],
  },
  {
    title: "Campus",
    items: [
      { label: "Library", to: "/admin/library", icon: Library, phase: "Phase 7", roles: A },
      { label: "Placements", to: "/admin/placements", icon: Briefcase, phase: "Phase 7", roles: AP },
      { label: "Facilities", to: "/admin/facilities", icon: Landmark, phase: "Phase 9", roles: A },
      { label: "Achievements", to: "/admin/achievements", icon: Trophy, phase: "Phase 9", roles: A },
      { label: "Placed Students", to: "/admin/placed-students", icon: GraduationCap, phase: "Phase 12", roles: AP },
    ],
  },
  {
    title: "Website CMS",
    items: [
      { label: "Homepage", to: "/admin/campus-content", icon: Home, phase: "Phase 9", roles: A },
      { label: "Notices", to: "/admin/notices", icon: Megaphone, phase: "Phase 9", roles: AP },
      { label: "Events", to: "/admin/events", icon: CalendarDays, phase: "Phase 9", roles: AP },
      { label: "Gallery", to: "/admin/gallery", icon: Image, phase: "Phase 9", roles: A },
      { label: "President Profile", to: "/admin/president-profile", icon: UserSquare, phase: "Phase 11", roles: AP },
      { label: "Principal Profile", to: "/admin/principal-profile", icon: UserSquare, phase: "Phase 9", roles: AP },
      { label: "Contact", to: "/admin/contact", icon: Phone, phase: "Phase 9", roles: A },
      { label: "Admissions Information", to: "/admin/admissions-info", icon: Info, phase: "Phase 9", roles: A },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Audit Logs", to: "/admin/audit-logs", icon: ScrollText, phase: "Phase 1", roles: ["SUPER_ADMIN"] },
      { label: "Settings", to: "/admin/settings", icon: Settings, phase: "Phase 10", roles: ["SUPER_ADMIN"] },
    ],
  },
];
