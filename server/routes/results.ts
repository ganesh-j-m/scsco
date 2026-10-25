import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { assertInScope, departmentScope } from "../services/scope.js";
import { academicYearOf, gradeFor } from "../validators/ops.js";
import { familyStudentId } from "../services/family.js";
import { notifyUsers } from "../services/notify.js";

const router = Router();
router.use(authenticate);

// ───────── Student / parent ─────────
router.get(
  "/my",
  authorize("STUDENT", "PARENT"),
  asyncHandler(async (req, res) => {
    const studentId = await familyStudentId(req, z.string().optional().parse(req.query.studentId));
    const rows = await prisma.result.findMany({
      where: { studentId }, orderBy: [{ semester: "desc" }, { createdAt: "desc" }], take: 200,
      select: { id: true, marks: true, maxMarks: true, grade: true, passed: true, semester: true, academicYear: true, exam: { select: { name: true, date: true } }, subject: { select: { name: true, code: true } } },
    });
    const sems = new Map<number, { semester: number; academicYear: string; marks: number; max: number; failed: number }>();
    for (const r of rows) {
      const s = sems.get(r.semester) ?? { semester: r.semester, academicYear: r.academicYear, marks: 0, max: 0, failed: 0 };
      s.marks += r.marks; s.max += r.maxMarks; if (!r.passed) s.failed++;
      sems.set(r.semester, s);
    }
    res.json({
      data: rows,
      summary: [...sems.values()].map((s) => ({ ...s, percentage: s.max ? Math.round((s.marks / s.max) * 1000) / 10 : 0 })),
    });
  }),
);

// ───────── Staff: marks entry sheet ─────────
const staff = authorize("ADMIN", "PRINCIPAL", "HOD");

async function loadExam(req: Parameters<typeof departmentScope>[0], examId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { course: { select: { name: true, departmentId: true } }, subject: { select: { name: true, code: true } } } });
  if (!exam) throw notFound("Exam not found");
  assertInScope(await departmentScope(req), exam.course.departmentId);
  return exam;
}

router.get(
  "/sheet",
  staff,
  asyncHandler(async (req, res) => {
    const exam = await loadExam(req, z.string().min(1).parse(req.query.examId));
    const students = await prisma.student.findMany({
      where: { courseId: exam.courseId, semester: exam.semester, status: "ACTIVE" },
      orderBy: { studentId: "asc" }, take: 500,
      select: { id: true, studentId: true, division: true, user: { select: { name: true } } },
    });
    const existing = await prisma.result.findMany({ where: { examId: exam.id }, select: { studentId: true, marks: true, maxMarks: true } });
    const by = new Map(existing.map((r) => [r.studentId, r]));
    res.json({
      exam: { id: exam.id, name: exam.name, date: exam.date, semester: exam.semester, course: exam.course.name, subject: exam.subject.name },
      maxMarks: existing[0]?.maxMarks ?? 100,
      students: students.map((s) => ({ id: s.id, studentId: s.studentId, division: s.division, name: s.user.name, marks: by.get(s.id)?.marks ?? null })),
    });
  }),
);

router.post(
  "/sheet",
  staff,
  asyncHandler(async (req, res) => {
    const d = z.object({
      examId: z.string().min(1),
      maxMarks: z.coerce.number().positive().max(1000),
      records: z.array(z.object({ studentId: z.string(), marks: z.coerce.number().min(0) })).min(1).max(500),
    }).parse(req.body);
    const exam = await loadExam(req, d.examId);
    const roster = await prisma.student.findMany({ where: { courseId: exam.courseId, semester: exam.semester, status: "ACTIVE" }, select: { id: true, userId: true } });
    const allowed = new Map(roster.map((s) => [s.id, s.userId]));
    const seen = new Set<string>();
    for (const r of d.records) {
      if (!allowed.has(r.studentId)) throw badRequest("A selected student is not in this exam's class");
      if (seen.has(r.studentId)) throw badRequest("A student appears more than once");
      if (r.marks > d.maxMarks) throw badRequest(`Marks cannot exceed ${d.maxMarks}`);
      seen.add(r.studentId);
    }
    const academicYear = academicYearOf(exam.date);
    const fresh: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const r of d.records) {
        const { grade, passed } = gradeFor(r.marks, d.maxMarks);
        const data = { marks: r.marks, maxMarks: d.maxMarks, grade, passed, semester: exam.semester, academicYear, subjectId: exam.subjectId };
        const cur = await tx.result.findUnique({ where: { studentId_examId: { studentId: r.studentId, examId: exam.id } }, select: { id: true } });
        if (cur) await tx.result.update({ where: { id: cur.id }, data });
        else { await tx.result.create({ data: { ...data, studentId: r.studentId, examId: exam.id } }); fresh.push(allowed.get(r.studentId)!); }
      }
    });
    await audit(req, "RESULTS_SAVED", "Exam", exam.id, { count: d.records.length });
    await notifyUsers(fresh, { type: "ACADEMIC", title: `Result published: ${exam.subject.name}`, body: exam.name, link: "/portal/results" });
    res.json({ ok: true, saved: d.records.length });
  }),
);

export default router;
