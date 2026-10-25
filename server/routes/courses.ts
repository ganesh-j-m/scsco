import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { courseSchema, courseUpdateSchema } from "../validators/academics.js";
import { assertInScope, departmentScope } from "../services/scope.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD"));
const writers = authorize("ADMIN", "PRINCIPAL");

const select = {
  id: true, name: true, code: true, durationYears: true, description: true, status: true, departmentId: true, createdAt: true,
  department: { select: { id: true, name: true, code: true } },
  _count: { select: { subjects: true, students: true } },
} as const;

async function assertDepartmentExists(id: string) {
  if (!(await prisma.department.findUnique({ where: { id }, select: { id: true } }))) throw badRequest("Selected department does not exist");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ departmentId: z.string().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).parse(req.query);
    const scope = await departmentScope(req);
    const where = {
      ...(scope ? { departmentId: scope } : q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { code: { contains: q.search, mode: "insensitive" as const } }] } : {}),
    };
    const orderBy = q.sortBy === "code" ? { code: q.sortDir } : q.sortBy === "createdAt" ? { createdAt: q.sortDir } : { name: q.sortDir };
    const [total, data] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({ where, select, orderBy, ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.post(
  "/",
  writers,
  asyncHandler(async (req, res) => {
    const d = courseSchema.parse(req.body);
    await assertDepartmentExists(d.departmentId);
    const course = await prisma.course.create({ data: d, select });
    await audit(req, "COURSE_CREATED", "Course", course.id, { code: course.code });
    res.status(201).json({ course });
  }),
);

router.patch(
  "/:id",
  writers,
  asyncHandler(async (req, res) => {
    const d = courseUpdateSchema.parse(req.body);
    const current = await prisma.course.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
    if (!current) throw notFound("Course not found");
    if (d.departmentId && d.departmentId !== current.departmentId) {
      await assertDepartmentExists(d.departmentId);
      const students = await prisma.student.count({ where: { courseId: current.id } });
      if (students) throw conflict("This course has students enrolled, so it cannot be moved to another department.");
    }
    const course = await prisma.course.update({ where: { id: current.id }, data: d, select });
    await audit(req, "COURSE_UPDATED", "Course", course.id, { fields: Object.keys(d) });
    res.json({ course });
  }),
);

router.delete(
  "/:id",
  writers,
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, departmentId: true } });
    if (!course) throw notFound("Course not found");
    assertInScope(await departmentScope(req), course.departmentId);
    const [subjects, students, exams] = await Promise.all([
      prisma.subject.count({ where: { courseId: course.id } }),
      prisma.student.count({ where: { courseId: course.id } }),
      prisma.exam.count({ where: { courseId: course.id } }),
    ]);
    if (subjects || students || exams)
      throw conflict(`Cannot delete: ${subjects} subjects, ${students} students and ${exams} exams are linked to this course. Deactivate it instead.`);
    await prisma.course.delete({ where: { id: course.id } });
    await audit(req, "COURSE_DELETED", "Course", course.id, { name: course.name });
    res.json({ ok: true });
  }),
);

export default router;
