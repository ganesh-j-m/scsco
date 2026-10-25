import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { parseDateOnly, todayIst } from "../utils/dates.js";
import { assertCanManageSubject, finalizeDueSessions, percentage, staffScope } from "../services/attendanceService.js";

const router = Router();
router.use(authenticate);
const staff = authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY");

const statusEnum = z.enum(["PRESENT", "ABSENT", "LATE"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// ───────────── Staff: records list ─────────────
router.get(
  "/",
  staff,
  asyncHandler(async (req, res) => {
    const q = paginationQuery
      .extend({
        date: dateStr.optional(), courseId: z.string().optional(), year: z.coerce.number().int().optional(), division: z.string().trim().toUpperCase().optional(),
        subjectId: z.string().optional(), status: statusEnum.optional(), source: z.enum(["QR", "MANUAL"]).optional(),
      })
      .parse(req.query);
    void finalizeDueSessions(5);
    const scope = await staffScope(req);
    const where = {
      ...(scope.facultyId ? { facultyId: scope.facultyId } : {}),
      ...(scope.departmentId ? { student: { departmentId: scope.departmentId } } : {}),
      ...(q.date ? { date: parseDateOnly(q.date) } : {}),
      ...(q.courseId ? { courseId: q.courseId } : {}),
      ...(q.year ? { year: q.year } : {}),
      ...(q.division ? { division: q.division } : {}),
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.source ? { sessionId: q.source === "QR" ? { not: null } : null } : {}),
      ...(q.search
        ? { OR: [{ student: { studentId: { contains: q.search, mode: "insensitive" as const } } }, { student: { user: { name: { contains: q.search, mode: "insensitive" as const } } } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        orderBy: [{ date: "desc" }, { time: "desc" }],
        select: {
          id: true, date: true, time: true, status: true, year: true, division: true, sessionId: true,
          student: { select: { studentId: true, user: { select: { name: true } } } },
          subject: { select: { name: true, code: true } },
        },
        ...pageArgs(q.page, q.pageSize),
      }),
    ]);
    res.json({ data: rows.map(({ sessionId, ...r }) => ({ ...r, source: sessionId ? "QR" : "MANUAL" })), meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

// ───────────── Staff: manual marking ─────────────
const classQuery = z.object({ subjectId: z.string().min(1), year: z.coerce.number().int().min(1).max(5), division: z.string().trim().toUpperCase().min(1).max(5), date: dateStr });

async function loadSubjectForStaff(req: Parameters<typeof staffScope>[0], subjectId: string) {
  const scope = await staffScope(req);
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true, facultyId: true, courseId: true, course: { select: { departmentId: true } } } });
  if (!subject) throw notFound("Subject not found");
  if (!subject.facultyId) throw badRequest("Assign a teacher to this subject before marking attendance");
  assertCanManageSubject(scope, { facultyId: subject.facultyId, departmentId: subject.course.departmentId });
  return { subject, facultyId: subject.facultyId };
}

function assertValidDate(date: string) {
  const d = parseDateOnly(date);
  if (Number.isNaN(d.getTime())) throw badRequest("Invalid date");
  if (d > todayIst()) throw badRequest("Attendance cannot be marked for a future date");
  return d;
}

router.get(
  "/roster",
  staff,
  asyncHandler(async (req, res) => {
    const q = classQuery.parse(req.query);
    const date = assertValidDate(q.date);
    const { subject } = await loadSubjectForStaff(req, q.subjectId);
    const students = await prisma.student.findMany({
      where: { status: "ACTIVE", courseId: subject.courseId, year: q.year, division: q.division },
      orderBy: { studentId: "asc" },
      select: { id: true, studentId: true, user: { select: { name: true } } },
    });
    const existing = await prisma.attendance.findMany({
      where: { subjectId: subject.id, date, sessionId: null, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true, status: true },
    });
    const byStudent = new Map(existing.map((e) => [e.studentId, e.status]));
    res.json({ subject: subject.name, students: students.map((s) => ({ id: s.id, studentId: s.studentId, name: s.user.name, status: byStudent.get(s.id) ?? null })) });
  }),
);

router.post(
  "/manual",
  staff,
  asyncHandler(async (req, res) => {
    const body = classQuery.extend({ records: z.array(z.object({ studentId: z.string(), status: statusEnum })).min(1).max(300) }).parse(req.body);
    const date = assertValidDate(body.date);
    const { subject, facultyId } = await loadSubjectForStaff(req, body.subjectId);
    const roster = await prisma.student.findMany({
      where: { status: "ACTIVE", courseId: subject.courseId, year: body.year, division: body.division },
      select: { id: true },
    });
    const allowed = new Set(roster.map((s) => s.id));
    const seen = new Set<string>();
    for (const r of body.records) {
      if (!allowed.has(r.studentId)) throw badRequest("A selected student is not in this class");
      if (seen.has(r.studentId)) throw badRequest("A student appears more than once");
      seen.add(r.studentId);
    }

    // One manual record per student, subject and date: update if it exists, otherwise create.
    await prisma.$transaction(async (tx) => {
      for (const r of body.records) {
        const existing = await tx.attendance.findFirst({ where: { studentId: r.studentId, subjectId: subject.id, date, sessionId: null }, select: { id: true } });
        if (existing) await tx.attendance.update({ where: { id: existing.id }, data: { status: r.status, facultyId } });
        else
          await tx.attendance.create({
            data: { studentId: r.studentId, subjectId: subject.id, facultyId, date, status: r.status, courseId: subject.courseId, year: body.year, division: body.division },
          });
      }
    });
    await audit(req, "ATTENDANCE_MARKED_MANUAL", "Subject", subject.id, { date: body.date, year: body.year, division: body.division, count: body.records.length });
    res.json({ ok: true, saved: body.records.length });
  }),
);

router.patch(
  "/:id",
  staff,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: statusEnum }).parse(req.body);
    const scope = await staffScope(req);
    const rec = await prisma.attendance.findUnique({ where: { id: req.params.id }, select: { id: true, facultyId: true, student: { select: { departmentId: true } } } });
    if (!rec) throw notFound("Attendance record not found");
    if (scope.facultyId && rec.facultyId !== scope.facultyId) throw forbidden("You can only edit your own attendance records");
    if (scope.departmentId && rec.student.departmentId !== scope.departmentId) throw forbidden("This record belongs to another department");
    await prisma.attendance.update({ where: { id: rec.id }, data: { status } });
    await audit(req, "ATTENDANCE_UPDATED", "Attendance", rec.id, { status });
    res.json({ ok: true });
  }),
);

// ───────────── Student / parent: own (or linked child's) attendance ─────────────
const familyOnly = authorize("STUDENT", "PARENT");

router.get(
  "/children",
  familyOnly,
  asyncHandler(async (req, res) => {
    if (req.user!.role === "STUDENT") {
      const me = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true, studentId: true, user: { select: { name: true } } } });
      return res.json({ data: me ? [{ id: me.id, studentId: me.studentId, name: me.user.name }] : [] });
    }
    const parent = await prisma.parent.findUnique({ where: { userId: req.user!.id }, select: { children: { select: { id: true, studentId: true, user: { select: { name: true } } } } } });
    res.json({ data: (parent?.children ?? []).map((c) => ({ id: c.id, studentId: c.studentId, name: c.user.name })) });
  }),
);

router.get(
  "/my",
  familyOnly,
  asyncHandler(async (req, res) => {
    const wanted = z.string().optional().parse(req.query.studentId);
    let studentId: string;
    if (req.user!.role === "PARENT") {
      const parent = await prisma.parent.findUnique({ where: { userId: req.user!.id }, select: { children: { select: { id: true } } } });
      const ids = parent?.children.map((c) => c.id) ?? [];
      studentId = wanted ?? ids[0] ?? "";
      if (!studentId || !ids.includes(studentId)) throw forbidden("You can only view your own children's attendance");
    } else {
      const me = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!me) throw forbidden("No student profile is linked to your account");
      studentId = me.id;
    }

    await finalizeDueSessions(5);
    const [grouped, recent, student] = await Promise.all([
      prisma.attendance.groupBy({ by: ["subjectId", "status"], where: { studentId }, _count: { _all: true } }),
      prisma.attendance.findMany({
        where: { studentId }, orderBy: [{ date: "desc" }, { time: "desc" }], take: 30,
        select: { id: true, date: true, time: true, status: true, subject: { select: { name: true, code: true } } },
      }),
      prisma.student.findUnique({ where: { id: studentId }, select: { studentId: true, user: { select: { name: true } } } }),
    ]);
    const subjects = await prisma.subject.findMany({ where: { id: { in: [...new Set(grouped.map((g) => g.subjectId))] } }, select: { id: true, name: true, code: true } });

    const rows = subjects.map((sub) => {
      const n = (st: string) => grouped.find((g) => g.subjectId === sub.id && g.status === st)?._count._all ?? 0;
      const present = n("PRESENT"), late = n("LATE"), absent = n("ABSENT");
      const total = present + late + absent;
      return { subjectId: sub.id, name: sub.name, code: sub.code, total, present, late, absent, percentage: percentage(present + late, total) };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const totals = rows.reduce((t, r) => ({ total: t.total + r.total, attended: t.attended + r.present + r.late }), { total: 0, attended: 0 });
    res.json({ student, subjects: rows, overall: { total: totals.total, attended: totals.attended, percentage: percentage(totals.attended, totals.total) }, recent });
  }),
);

export default router;
