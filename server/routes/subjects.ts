import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { subjectSchema, subjectUpdateSchema } from "../validators/academics.js";
import { assertInScope, departmentScope } from "../services/scope.js";

// HODs manage subjects of their own department; Admin/Principal/Super Admin manage all.
const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD"));

const select = {
  id: true, name: true, code: true, courseId: true, semester: true, credits: true, facultyId: true, createdAt: true,
  course: { select: { id: true, name: true, departmentId: true, department: { select: { name: true, code: true } } } },
  faculty: { select: { id: true, user: { select: { name: true } } } },
} as const;

/** Checks the course is in the actor's scope and that the faculty member belongs to the course's department. */
async function validateLinks(scope: string | undefined, courseId: string, facultyId?: string | null) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { departmentId: true } });
  if (!course) throw badRequest("Selected course does not exist");
  assertInScope(scope, course.departmentId);
  if (facultyId) {
    const f = await prisma.faculty.findUnique({ where: { id: facultyId }, select: { departmentId: true, status: true } });
    if (!f || f.status !== "ACTIVE") throw badRequest("Selected faculty member is not available");
    if (f.departmentId !== course.departmentId) throw badRequest("The faculty member must belong to the same department as the course");
  }
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery
      .extend({ courseId: z.string().optional(), departmentId: z.string().optional(), semester: z.coerce.number().int().optional(), facultyId: z.string().optional() })
      .parse(req.query);
    const scope = await departmentScope(req);
    const deptId = scope ?? q.departmentId;
    const where = {
      ...(q.courseId ? { courseId: q.courseId } : {}),
      ...(deptId ? { course: { departmentId: deptId } } : {}),
      ...(q.semester ? { semester: q.semester } : {}),
      ...(q.facultyId ? { facultyId: q.facultyId } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { code: { contains: q.search, mode: "insensitive" as const } }] } : {}),
    };
    const orderBy = q.sortBy === "code" ? { code: q.sortDir } : q.sortBy === "semester" ? { semester: q.sortDir } : q.sortBy === "createdAt" ? { createdAt: q.sortDir } : { name: q.sortDir };
    const [total, data] = await Promise.all([
      prisma.subject.count({ where }),
      prisma.subject.findMany({ where, select, orderBy, ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = subjectSchema.parse(req.body);
    await validateLinks(await departmentScope(req), d.courseId, d.facultyId);
    const subject = await prisma.subject.create({ data: { ...d, facultyId: d.facultyId ?? null }, select });
    await audit(req, "SUBJECT_CREATED", "Subject", subject.id, { code: subject.code });
    res.status(201).json({ subject });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = subjectUpdateSchema.parse(req.body);
    const scope = await departmentScope(req);
    const current = await prisma.subject.findUnique({ where: { id: req.params.id }, select: { id: true, courseId: true, facultyId: true } });
    if (!current) throw notFound("Subject not found");
    const targetCourse = d.courseId ?? current.courseId;
    // Re-check the existing course scope too, so a HOD cannot edit another department's subject.
    await validateLinks(scope, current.courseId);
    // Faculty is re-validated only if it, or the course, is being changed.
    await validateLinks(scope, targetCourse, d.facultyId !== undefined ? d.facultyId : d.courseId ? current.facultyId : undefined);
    const subject = await prisma.subject.update({ where: { id: current.id }, data: d, select });
    await audit(req, "SUBJECT_UPDATED", "Subject", subject.id, { fields: Object.keys(d) });
    res.json({ subject });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.subject.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, courseId: true } });
    if (!current) throw notFound("Subject not found");
    await validateLinks(await departmentScope(req), current.courseId);
    const [attendance, results, exams] = await Promise.all([
      prisma.attendance.count({ where: { subjectId: current.id } }),
      prisma.result.count({ where: { subjectId: current.id } }),
      prisma.exam.count({ where: { subjectId: current.id } }),
    ]);
    if (attendance || results || exams)
      throw conflict(`Cannot delete: ${attendance} attendance records, ${results} results and ${exams} exams use this subject.`);
    await prisma.subject.delete({ where: { id: current.id } }); // timetable slots are removed with it
    await audit(req, "SUBJECT_DELETED", "Subject", current.id, { name: current.name });
    res.json({ ok: true });
  }),
);

export default router;
