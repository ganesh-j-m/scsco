import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { LoadingState } from "@/components/ui";
import { RouteEffects } from "@/components/RouteEffects";
import { ADMIN_PANEL_ROLES, RequireRole } from "./guards";
import { adminNav } from "./adminNav";
import type { Role } from "@/types";

const PublicLayout = lazy(() => import("@/layouts/PublicLayout"));
const AdminLayout = lazy(() => import("@/layouts/AdminLayout"));
const PortalLayout = lazy(() => import("@/layouts/PortalLayout"));
const Home = lazy(() => import("@/pages/public/Home"));
const Login = lazy(() => import("@/pages/public/Login"));
const S = {
  About: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.About }))),
  PrincipalMessage: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.PrincipalMessage }))),
  Academics: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Academics }))),
  Departments: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Departments }))),
  Courses: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Courses }))),
  CampusLife: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.CampusLife }))),
  Facilities: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Facilities }))),
  Events: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Events }))),
  Achievements: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Achievements }))),
  Placements: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Placements }))),
  Contact: lazy(() => import("@/pages/public/SimplePages").then((m) => ({ default: m.Contact }))),
  Faculty: lazy(() => import("@/pages/public/ListPages").then((m) => ({ default: m.Faculty }))),
  Notices: lazy(() => import("@/pages/public/ListPages").then((m) => ({ default: m.Notices }))),
  Gallery: lazy(() => import("@/pages/public/ListPages").then((m) => ({ default: m.Gallery }))),
  Admissions: lazy(() => import("@/pages/public/ListPages").then((m) => ({ default: m.Admissions }))),
};
const publicRoutes: [string, React.LazyExoticComponent<() => JSX.Element>][] = [
  ["about", S.About], ["principal-message", S.PrincipalMessage], ["academics", S.Academics], ["departments", S.Departments],
  ["courses", S.Courses], ["faculty", S.Faculty], ["admissions", S.Admissions], ["campus-life", S.CampusLife],
  ["facilities", S.Facilities], ["events", S.Events], ["gallery", S.Gallery], ["achievements", S.Achievements],
  ["placements", S.Placements], ["notices", S.Notices], ["contact", S.Contact],
];
const Unauthorized = lazy(() => import("@/pages/Unauthorized"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const Users = lazy(() => import("@/pages/admin/Users"));
const Students = lazy(() => import("@/pages/admin/Students"));
const Faculty = lazy(() => import("@/pages/admin/Faculty"));
const Hods = lazy(() => import("@/pages/admin/Hods"));
const Parents = lazy(() => import("@/pages/admin/Parents"));
const Departments = lazy(() => import("@/pages/admin/Departments"));
const Courses = lazy(() => import("@/pages/admin/Courses"));
const Subjects = lazy(() => import("@/pages/admin/Subjects"));
const Timetable = lazy(() => import("@/pages/admin/Timetable"));
const QrAttendance = lazy(() => import("@/pages/admin/QrAttendance"));
const Attendance = lazy(() => import("@/pages/admin/Attendance"));
const PortalAttendance = lazy(() => import("@/pages/portal/Attendance"));
const Scan = lazy(() => import("@/pages/portal/Scan"));
const Admissions = lazy(() => import("@/pages/admin/Admissions"));
const Fees = lazy(() => import("@/pages/admin/Fees"));
const Certificates = lazy(() => import("@/pages/admin/Certificates"));
const Examinations = lazy(() => import("@/pages/admin/Examinations"));
const Results = lazy(() => import("@/pages/admin/Results"));
const LibraryAdmin = lazy(() => import("@/pages/admin/Library"));
const PlacementsAdmin = lazy(() => import("@/pages/admin/Placements"));
const Grievances = lazy(() => import("@/pages/admin/Grievances"));
const Announcements = lazy(() => import("@/pages/admin/Announcements"));
const PortalResults = lazy(() => import("@/pages/portal/Results"));
const PortalFees = lazy(() => import("@/pages/portal/Fees"));
const PortalCertificates = lazy(() => import("@/pages/portal/Certificates"));
const PortalPlacements = lazy(() => import("@/pages/portal/Placements"));
const PortalLibrary = lazy(() => import("@/pages/portal/Library"));
const PortalGrievances = lazy(() => import("@/pages/portal/Grievances"));
const PortalNotifications = lazy(() => import("@/pages/portal/Notifications"));
const FormsAdmin = lazy(() => import("@/pages/admin/Forms"));
const FormBuilder = lazy(() => import("@/pages/admin/FormBuilder"));
const CmsNotices = lazy(() => import("@/pages/admin/cmsPages").then((m) => ({ default: m.Notices })));
const CmsEvents = lazy(() => import("@/pages/admin/cmsPages").then((m) => ({ default: m.Events })));
const CmsGallery = lazy(() => import("@/pages/admin/cmsPages").then((m) => ({ default: m.Gallery })));
const CmsFacilities = lazy(() => import("@/pages/admin/cmsPages").then((m) => ({ default: m.Facilities })));
const CmsAchievements = lazy(() => import("@/pages/admin/cmsPages").then((m) => ({ default: m.Achievements })));
const CmsHomepage = lazy(() => import("@/pages/admin/SiteBlocks").then((m) => ({ default: m.Homepage })));
const CmsPrincipal = lazy(() => import("@/pages/admin/SiteBlocks").then((m) => ({ default: m.PrincipalProfile })));
const CmsContact = lazy(() => import("@/pages/admin/SiteBlocks").then((m) => ({ default: m.ContactInfo })));
const CmsAdmissionsInfo = lazy(() => import("@/pages/admin/SiteBlocks").then((m) => ({ default: m.AdmissionsInfo })));
const PortalForms = lazy(() => import("@/pages/portal/Forms"));
const FormFill = lazy(() => import("@/pages/portal/FormFill"));
const AuditLogs = lazy(() => import("@/pages/admin/AuditLogs"));
const ComingSoon = lazy(() => import("@/pages/ComingSoon"));
const AssignmentsAdmin = lazy(() => import("@/pages/admin/CourseWork").then((m) => ({ default: m.Assignments })));
const StudyMaterialAdmin = lazy(() => import("@/pages/admin/CourseWork").then((m) => ({ default: m.StudyMaterial })));
const PortalAssignments = lazy(() => import("@/pages/portal/CourseWork").then((m) => ({ default: m.PortalAssignments })));
const PortalStudyMaterial = lazy(() => import("@/pages/portal/CourseWork").then((m) => ({ default: m.PortalStudyMaterial })));
const PortalScan = lazy(() => import("@/pages/portal/ScanQr"));
const PortalExams = lazy(() => import("@/pages/portal/Exams"));
const PortalProfile = lazy(() => import("@/pages/portal/Profile"));
const PortalDashboard = lazy(() => import("@/pages/portal/Dashboard"));

const PORTAL_PATHS = [
  "profile", "attendance", "assignments", "study-material", "exams", "results", "fees", "certificates",
  "placements", "library", "grievances", "forms", "notifications",
];
const ALL_STAFF: Role[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "HOD", "FACULTY"];
const PORTAL_ROLES: Role[] = ["FACULTY", "STUDENT", "PARENT", "ALUMNI", ...ADMIN_PANEL_ROLES];

// Pages implemented so far; everything else shows a clear "coming in a later phase" page.
const implemented: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  "/admin/users": Users,
  "/admin/students": Students,
  "/admin/faculty": Faculty,
  "/admin/hods": Hods,
  "/admin/parents": Parents,
  "/admin/departments": Departments,
  "/admin/courses": Courses,
  "/admin/subjects": Subjects,
  "/admin/timetable": Timetable,
  "/admin/attendance": Attendance,
  "/admin/qr-attendance": QrAttendance,
  "/admin/assignments": AssignmentsAdmin,
  "/admin/study-material": StudyMaterialAdmin,
  "/admin/admissions": Admissions,
  "/admin/fees": Fees,
  "/admin/certificates": Certificates,
  "/admin/examinations": Examinations,
  "/admin/results": Results,
  "/admin/library": LibraryAdmin,
  "/admin/placements": PlacementsAdmin,
  "/admin/grievances": Grievances,
  "/admin/notifications": Announcements,
  "/admin/forms": FormsAdmin,
  "/admin/notices": CmsNotices,
  "/admin/events": CmsEvents,
  "/admin/gallery": CmsGallery,
  "/admin/facilities": CmsFacilities,
  "/admin/achievements": CmsAchievements,
  "/admin/campus-content": CmsHomepage,
  "/admin/principal-profile": CmsPrincipal,
  "/admin/contact": CmsContact,
  "/admin/admissions-info": CmsAdmissionsInfo,
  "/admin/audit-logs": AuditLogs,
};

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <RouteEffects />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          {publicRoutes.map(([path, Page]) => (
            <Route key={path} path={path} element={<Page />} />
          ))}
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="unauthorized" element={<Unauthorized />} />

        <Route element={<RequireRole roles={[...ADMIN_PANEL_ROLES, "FACULTY"]} area="admin" />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route element={<RequireRole roles={ALL_STAFF} area="admin" />}>
              <Route path="forms/:id" element={<FormBuilder />} />
            </Route>
            {adminNav
              .flatMap((g) => g.items)
              .filter((i) => i.to !== "/admin/dashboard")
              .map((i) => {
                const Page = implemented[i.to];
                return (
                  <Route
                    key={i.to}
                    path={i.to.replace("/admin/", "")}
                    element={
                      <RequireRole roles={i.roles ?? ALL_STAFF} area="admin" />
                    }
                  >
                    <Route index element={Page ? <Page /> : <ComingSoon title={i.label} phase={i.phase} />} />
                  </Route>
                );
              })}
          </Route>
        </Route>

        <Route element={<RequireRole roles={PORTAL_ROLES} area="portal" />}>
          <Route path="portal" element={<PortalLayout />}>
            <Route index element={<PortalDashboard />} />
            <Route path="dashboard" element={<PortalDashboard />} />
            <Route path="attendance" element={<PortalAttendance />} />
            <Route path="scan" element={<PortalScan />} />
            <Route path="exams" element={<PortalExams />} />
            <Route path="assignments" element={<PortalAssignments />} />
            <Route path="study-material" element={<PortalStudyMaterial />} />
            <Route path="profile" element={<PortalProfile />} />
            <Route path="results" element={<PortalResults />} />
            <Route path="fees" element={<PortalFees />} />
            <Route path="certificates" element={<PortalCertificates />} />
            <Route path="placements" element={<PortalPlacements />} />
            <Route path="library" element={<PortalLibrary />} />
            <Route path="grievances" element={<PortalGrievances />} />
            <Route path="notifications" element={<PortalNotifications />} />
            <Route path="forms" element={<PortalForms />} />
            <Route path="forms/:id" element={<FormFill />} />
            {PORTAL_PATHS.filter((p) => !["attendance", "scan", "exams", "assignments", "study-material", "profile", "results", "fees", "certificates", "placements", "library", "grievances", "notifications", "forms"].includes(p)).map((p) => (
              <Route key={p} path={p} element={<ComingSoon title={p.replace(/-/g, " ")} phase="Phase 3-8" />} />
            ))}
          </Route>
        </Route>

        <Route element={<RequireRole roles={["STUDENT"]} area="portal" />}>
          <Route path="scan/:token" element={<Scan />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
