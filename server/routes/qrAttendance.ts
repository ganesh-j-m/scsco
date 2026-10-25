import { Router } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, forbidden, HttpError, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { todayIst } from "../utils/dates.js";
import { assertCanManageSubject, finalizeDueSessions, QR_VALIDITY_MS, staffScope } from "../services/attendanceService.js";

const router = Router();
router.use(authenticate);

const staff = authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY");
const studentOnly = authorize("STUDENT");

const sessionInclude = {
  subject: { select: { id: true, name: true, code: true, course: { select: { id: true, name: true } } } },
  faculty: { select: { id: true, user: { select: { name: true } } } },
} as const;

const isActive = (s: { closedAt: Date | null; startsAt: Date; expiresAt: Date }, now = new Date()) => !s.closedAt && now >= s.startsAt && now < s.expiresAt;

async function sessionAccessFilter(req: Parameters<typeof staffScope>[0]) {
  const scope = await staffScope(req);
  return {
    ...(scope.facultyId ? { facultyId: scope.facultyId } : {}),
    ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
  };
}

const activeStudentsInClass = (s: { courseId: string; year: number; division: string }) =>
  prisma.student.count({ where: { status: "ACTIVE", courseId: s.courseId, year: s.year, division: s.division } });

// ───────────── Staff: what can I take attendance for? ─────────────
router.get(
  "/options",
  staff,
  asyncHandler(async (req, res) => {
    const scope = await staffScope(req);
    const subjects = await prisma.subject.findMany({
      where: {
        facultyId: scope.facultyId ?? { not: null },
        course: { status: "ACTIVE", ...(scope.departmentId ? { departmentId: scope.departmentId } : {}) },
      },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true, name: true, code: true, semester: true, courseId: true,
        course: { select: { name: true, durationYears: true } },
        faculty: { select: { user: { select: { name: true } } } },
      },
    });
    const courseIds = [...new Set(subjects.map((s) => s.courseId))];
    const classes = await prisma.student.groupBy({
      by: ["courseId", "year", "division"],
      where: { status: "ACTIVE", courseId: { in: courseIds } },
      _count: { _all: true },
      orderBy: [{ year: "asc" }, { division: "asc" }],
    });
    res.json({ subjects, classes: classes.map((c) => ({ courseId: c.courseId, year: c.year, division: c.division, students: c._count._all })) });
  }),
);

// ───────────── Staff: create / read / close sessions ─────────────
const createSchema = z.object({
  subjectId: z.string().min(1),
  year: z.coerce.number().int().min(1).max(5),
  division: z.string().trim().toUpperCase().min(1).max(5),
});

router.post(
  "/sessions",
  staff,
  asyncHandler(async (req, res) => {
    const d = createSchema.parse(req.body);
    const scope = await staffScope(req);
    const subject = await prisma.subject.findUnique({
      where: { id: d.subjectId },
      select: { id: true, facultyId: true, courseId: true, course: { select: { departmentId: true, durationYears: true } } },
    });
    if (!subject) throw notFound("Subject not found");
    if (!subject.facultyId) throw badRequest("Assign a teacher to this subject before taking attendance");
    assertCanManageSubject(scope, { facultyId: subject.facultyId, departmentId: subject.course.departmentId });
    if (d.year > subject.course.durationYears) throw badRequest("This course does not have that year");
    const target = { courseId: subject.courseId, year: d.year, division: d.division };
    if ((await activeStudentsInClass(target)) === 0) throw badRequest("There are no active students in this class");

    const now = new Date();
    const session = await prisma.$transaction(async (tx) => {
      // Only one live QR per subject and class: a new one replaces the previous.
      await tx.attendanceSession.updateMany({
        where: { subjectId: subject.id, ...target, closedAt: null, expiresAt: { gt: now } },
        data: { closedAt: now },
      });
      return tx.attendanceSession.create({
        data: {
          sessionId: crypto.randomBytes(24).toString("base64url"),
          facultyId: subject.facultyId!, subjectId: subject.id, departmentId: subject.course.departmentId, ...target,
          date: todayIst(), startsAt: now, expiresAt: new Date(now.getTime() + QR_VALIDITY_MS),
        },
        include: sessionInclude,
      });
    });
    await audit(req, "QR_SESSION_CREATED", "AttendanceSession", session.id, { subjectId: subject.id, year: d.year, division: d.division });
    res.status(201).json({ session: { ...session, active: true }, serverNow: new Date() });
  }),
);

router.get(
  "/sessions",
  staff,
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ active: z.enum(["true", "false"]).optional() }).parse(req.query);
    void finalizeDueSessions(5);
    const now = new Date();
    const where = {
      ...(await sessionAccessFilter(req)),
      ...(q.active === "true" ? { closedAt: null, expiresAt: { gt: now } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.attendanceSession.count({ where }),
      prisma.attendanceSession.findMany({
        where, orderBy: { startsAt: "desc" }, ...pageArgs(q.page, q.pageSize),
        select: {
          id: true, year: true, division: true, date: true, startsAt: true, expiresAt: true, closedAt: true, courseId: true,
          subject: { select: { name: true, code: true, course: { select: { name: true } } } },
          faculty: { select: { user: { select: { name: true } } } },
        },
      }),
    ]);
    const counts = await prisma.attendance.groupBy({ by: ["sessionId", "status"], where: { sessionId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
    const attended = (id: string) => counts.filter((c) => c.sessionId === id && (c.status === "PRESENT" || c.status === "LATE")).reduce((n, c) => n + c._count._all, 0);
    res.json({
      data: rows.map((r) => ({ ...r, present: attended(r.id), active: isActive(r, now) })),
      meta: pageMeta(total, q.page, q.pageSize),
      serverNow: now,
    });
  }),
);

router.get(
  "/sessions/:id",
  staff,
  asyncHandler(async (req, res) => {
    void finalizeDueSessions(5);
    const session = await prisma.attendanceSession.findFirst({ where: { id: req.params.id, ...(await sessionAccessFilter(req)) }, include: sessionInclude });
    if (!session) throw notFound("Session not found");
    const now = new Date();
    const active = isActive(session, now);
    const [rows, eligible] = await Promise.all([
      prisma.attendance.findMany({
        where: { sessionId: session.id },
        orderBy: { time: "desc" },
        select: { id: true, status: true, time: true, student: { select: { studentId: true, user: { select: { name: true } } } } },
      }),
      activeStudentsInClass(session),
    ]);
    const { sessionId: token, ...rest } = session;
    res.json({
      session: { ...rest, active, token: active ? token : null },
      attendance: rows,
      present: rows.filter((r) => r.status === "PRESENT" || r.status === "LATE").length,
      total: eligible,
      serverNow: now,
    });
  }),
);

router.post(
  "/sessions/:id/close",
  staff,
  asyncHandler(async (req, res) => {
    const session = await prisma.attendanceSession.findFirst({ where: { id: req.params.id, ...(await sessionAccessFilter(req)) } });
    if (!session) throw notFound("Session not found");
    if (!isActive(session)) throw badRequest("This session has already ended");
    await prisma.attendanceSession.update({ where: { id: session.id }, data: { closedAt: new Date() } });
    await audit(req, "QR_SESSION_CLOSED", "AttendanceSession", session.id);
    res.json({ ok: true });
  }),
);

// ───────────── Student: preview + scan ─────────────
const tokenSchema = z.string().min(20).max(64).regex(/^[A-Za-z0-9_-]+$/);

async function loadStudent(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true, status: true, departmentId: true, courseId: true, year: true, division: true } });
  if (!student || student.status !== "ACTIVE") throw forbidden("Only active students can mark attendance");
  return student;
}

function classMismatch(
  st: { departmentId: string; courseId: string; year: number; division: string },
  s: { departmentId: string; courseId: string; year: number; division: string; subject: { courseId: string } },
) {
  if (st.departmentId !== s.departmentId || st.courseId !== s.courseId || s.subject.courseId !== st.courseId) return "This attendance session is for a different course.";
  if (st.year !== s.year) return "This attendance session is for a different year.";
  if (st.division !== s.division) return "This attendance session is for a different division.";
  return null;
}

const findByToken = (token: string) =>
  prisma.attendanceSession.findUnique({
    where: { sessionId: token },
    include: { subject: { select: { name: true, code: true, courseId: true, course: { select: { name: true } } } }, faculty: { select: { user: { select: { name: true } } } } },
  });

router.get(
  "/preview/:token",
  studentOnly,
  asyncHandler(async (req, res) => {
    const token = tokenSchema.safeParse(req.params.token);
    if (!token.success) throw notFound("This QR code is not valid");
    const student = await loadStudent(req.user!.id);
    const s = await findByToken(token.data);
    if (!s) throw notFound("This QR code is not valid");
    const now = new Date();
    const marked = await prisma.attendance.findFirst({ where: { sessionId: s.id, studentId: student.id }, select: { status: true } });
    res.json({
      subject: { name: s.subject.name, code: s.subject.code },
      course: s.subject.course.name, year: s.year, division: s.division, teacher: s.faculty.user.name,
      expiresAt: s.expiresAt, serverNow: now,
      state: s.closedAt ? "CLOSED" : now >= s.expiresAt || now < s.startsAt ? "EXPIRED" : "OPEN",
      mismatch: classMismatch(student, s),
      alreadyMarked: marked ? marked.status !== "ABSENT" : false,
    });
  }),
);

const scanLimiter = rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  message: { error: "Too many attempts. Please wait a minute and try again." },
});

router.post(
  "/scan",
  studentOnly,
  scanLimiter,
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: tokenSchema }).parse(req.body);
    const student = await loadStudent(req.user!.id);
    const s = await findByToken(token);
    if (!s) {
      await audit(req, "QR_SCAN_REJECTED", "AttendanceSession", undefined, { reason: "unknown token" });
      throw notFound("This QR code is not valid");
    }

    // All checks use the server clock and database values; nothing from the browser is trusted except the token.
    const now = new Date();
    if (s.closedAt || now >= s.expiresAt || now < s.startsAt) {
      await audit(req, "QR_SCAN_REJECTED", "AttendanceSession", s.id, { reason: "expired" });
      throw new HttpError(410, "This QR code has expired. Ask your teacher to generate a new one.");
    }
    const mismatch = classMismatch(student, s);
    if (mismatch) {
      await audit(req, "QR_SCAN_REJECTED", "AttendanceSession", s.id, { reason: "class mismatch" });
      throw forbidden(mismatch);
    }

    try {
      // The unique (sessionId, studentId) constraint makes duplicates impossible even with parallel requests.
      await prisma.attendance.create({
        data: {
          studentId: student.id, subjectId: s.subjectId, facultyId: s.facultyId, sessionId: s.id, date: s.date, time: now,
          status: "PRESENT", courseId: s.courseId, year: s.year, division: s.division,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Your attendance is already marked for this session.");
      throw e;
    }
    await audit(req, "QR_ATTENDANCE_MARKED", "AttendanceSession", s.id, { subjectId: s.subjectId });
    res.status(201).json({ ok: true, subject: s.subject.name, time: now });
  }),
);

export default router;
