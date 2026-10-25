import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { assertInScope, departmentScope } from "../services/scope.js";
import { dateStr, optStr, toDate } from "../validators/ops.js";
import { familyStudentId } from "../services/family.js";
import { notifyUsers } from "../services/notify.js";

const router = Router();
router.use(authenticate);

const include = { course: { select: { id: true, name: true, departmentId: true } }, subject: { select: { id: true, name: true, code: true } } } as const;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

// ───────── Student / parent: upcoming exam schedule ─────────
router.get(
  "/my",
  authorize("STUDENT", "PARENT"),
  asyncHandler(async (req, res) => {
    const id = await familyStudentId(req, z.string().optional().parse(req.query.studentId));
    const s = await prisma.student.findUnique({ where: { id }, select: { courseId: true, semester: true } });
    const data = s ? await prisma.exam.findMany({ where: { courseId: s.courseId, semester: s.semester, date: { gte: new Date(Date.now() - 86400000) } }, orderBy: [{ date: "asc" }, { startTime: "asc" }], include, take: 50 }) : [];
    res.json({ data });
  }),
);

// ───────── Staff ─────────
const staff = authorize("ADMIN", "PRINCIPAL", "HOD");

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  courseId: z.string().min(1),
  subjectId: z.string().min(1),
  semester: z.coerce.number().int().min(1).max(10),
  date: dateStr,
  startTime: hhmm,
  endTime: hhmm,
  room: optStr(40),
  instructions: optStr(1000),
});

async function validate(scope: string | undefined, d: z.infer<typeof schema>, excludeId?: string) {
  const subject = await prisma.subject.findUnique({ where: { id: d.subjectId }, select: { courseId: true, semester: true, course: { select: { departmentId: true } } } });
  if (!subject || subject.courseId !== d.courseId) throw badRequest("The subject does not belong to the selected course");
  if (subject.semester !== d.semester) throw badRequest(`This subject is in semester ${subject.semester}`);
  assertInScope(scope, subject.course.departmentId);
  if (d.endTime <= d.startTime) throw badRequest("End time must be after start time");
  if (d.room) {
    const clash = await prisma.exam.findFirst({ where: { ...(excludeId ? { id: { not: excludeId } } : {}), date: toDate(d.date), room: d.room, startTime: { lt: d.endTime }, endTime: { gt: d.startTime } }, select: { name: true } });
    if (clash) throw conflict(`Room ${d.room} is already used by "${clash.name}" at that time`);
  }
}

router.get(
  "/",
  staff,
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ courseId: z.string().optional(), semester: z.coerce.number().int().optional(), when: z.enum(["upcoming", "past"]).optional() }).parse(req.query);
    const scope = await departmentScope(req);
    const today = toDate(new Date().toISOString().slice(0, 10));
    const where = {
      ...(scope ? { course: { departmentId: scope } } : {}),
      ...(q.courseId ? { courseId: q.courseId } : {}),
      ...(q.semester ? { semester: q.semester } : {}),
      ...(q.when === "upcoming" ? { date: { gte: today } } : q.when === "past" ? { date: { lt: today } } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { subject: { name: { contains: q.search, mode: "insensitive" as const } } }] } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.exam.count({ where }),
      prisma.exam.findMany({ where, include, orderBy: [{ date: q.when === "past" ? "desc" : "asc" }, { startTime: "asc" }], ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.post(
  "/",
  staff,
  asyncHandler(async (req, res) => {
    const d = schema.parse(req.body);
    await validate(await departmentScope(req), d);
    const exam = await prisma.exam.create({ data: { ...d, date: toDate(d.date) }, include });
    await audit(req, "EXAM_CREATED", "Exam", exam.id, { name: exam.name });
    const students = await prisma.student.findMany({ where: { courseId: d.courseId, semester: d.semester, status: "ACTIVE" }, select: { userId: true }, take: 1000 });
    await notifyUsers(students.map((s) => s.userId), { type: "ACADEMIC", title: `Exam scheduled: ${exam.subject.name}`, body: `${exam.name} on ${d.date}, ${d.startTime}-${d.endTime}`, link: "/portal/results" });
    res.status(201).json({ exam });
  }),
);

router.patch(
  "/:id",
  staff,
  asyncHandler(async (req, res) => {
    const d = schema.parse(req.body);
    const scope = await departmentScope(req);
    const cur = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { id: true, course: { select: { departmentId: true } } } });
    if (!cur) throw notFound("Exam not found");
    assertInScope(scope, cur.course.departmentId);
    await validate(scope, d, cur.id);
    const exam = await prisma.exam.update({ where: { id: cur.id }, data: { ...d, date: toDate(d.date), room: d.room ?? null, instructions: d.instructions ?? null }, include });
    await audit(req, "EXAM_UPDATED", "Exam", exam.id);
    res.json({ exam });
  }),
);

router.delete(
  "/:id",
  staff,
  asyncHandler(async (req, res) => {
    const cur = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, course: { select: { departmentId: true } }, _count: { select: { results: true } } } });
    if (!cur) throw notFound("Exam not found");
    assertInScope(await departmentScope(req), cur.course.departmentId);
    if (cur._count.results > 0) throw conflict("Results are already entered for this exam, so it cannot be deleted");
    await prisma.exam.delete({ where: { id: cur.id } });
    await audit(req, "EXAM_DELETED", "Exam", cur.id, { name: cur.name });
    res.json({ ok: true });
  }),
);

export default router;
