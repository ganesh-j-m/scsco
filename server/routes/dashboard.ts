import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../utils/errors.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { departmentScope } from "../services/scope.js";
import { todayIst } from "../utils/dates.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY"));


router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const me = req.user!.id;
    const collegeWide = role === "SUPER_ADMIN" || role === "ADMIN" || role === "PRINCIPAL";
    const scope = await departmentScope(req); // HOD only
    const today = todayIst();

    const ownForms = collegeWide ? {} : { createdById: me };
    const attendanceWhere = {
      date: today,
      status: "PRESENT" as const,
      ...(role === "HOD" && scope ? { student: { departmentId: scope } } : {}),
      ...(role === "FACULTY" ? { faculty: { userId: me } } : {}),
    };

    const [students, faculty, activeUsers, todayAttendance, activeForms, formSubmissions] = await Promise.all([
      role === "FACULTY" ? Promise.resolve(null) : prisma.student.count({ where: { status: "ACTIVE", ...(scope ? { departmentId: scope } : {}) } }),
      role === "FACULTY" ? Promise.resolve(null) : prisma.faculty.count({ where: { status: "ACTIVE", ...(scope ? { departmentId: scope } : {}) } }),
      collegeWide ? prisma.user.count({ where: { status: "ACTIVE" } }) : Promise.resolve(null),
      prisma.attendance.count({ where: attendanceWhere }),
      prisma.form.count({ where: { status: "PUBLISHED", ...ownForms } }),
      prisma.formSubmission.count({ where: { form: ownForms } }),
    ]);

    let college: Record<string, number> | null = null;
    let charts: { studentsByDepartment: { name: string; value: number }[]; usersByRole: { name: string; value: number }[] } | null = null;

    if (collegeWide) {
      const now = new Date();
      const [pendingAdmissions, pendingFees, certificateRequests, openGrievances, activePlacements, libraryIssues, byDept, byRole, departments] = await Promise.all([
        prisma.admission.count({ where: { status: "PENDING" } }),
        prisma.fee.count({ where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } }),
        prisma.certificate.count({ where: { status: "PENDING" } }),
        prisma.grievance.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
        prisma.placement.count({ where: { status: "PUBLISHED", OR: [{ deadline: null }, { deadline: { gte: now } }] } }),
        prisma.bookIssue.count({ where: { returnedAt: null } }),
        prisma.student.groupBy({ by: ["departmentId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
        prisma.user.groupBy({ by: ["role"], where: { status: "ACTIVE" }, _count: { _all: true } }),
        prisma.department.findMany({ select: { id: true, code: true } }),
      ]);
      college = { pendingAdmissions, pendingFees, certificateRequests, openGrievances, activePlacements, libraryIssues };
      const code = new Map(departments.map((d) => [d.id, d.code]));
      charts = {
        studentsByDepartment: byDept.map((r) => ({ name: code.get(r.departmentId) ?? "-", value: r._count._all })),
        usersByRole: byRole.map((r) => ({ name: r.role.replace("_", " "), value: r._count._all })),
      };
    }

    res.json({ scope: collegeWide ? "college" : role === "HOD" ? "department" : "own", stats: { students, faculty, activeUsers, todayAttendance, activeForms, formSubmissions, ...college }, charts });
  }),
);

export default router;
