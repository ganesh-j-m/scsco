import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { createStudentSchema, updateStudentSchema } from "../validators/people.js";
import { hashPassword } from "../services/authService.js";
import { assertInScope, departmentScope } from "../services/scope.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD"));

const include = {
  user: { select: { name: true, email: true, phone: true, loginId: true, status: true } },
  department: { select: { id: true, name: true, code: true } },
  course: { select: { id: true, name: true } },
  parent: { select: { id: true, user: { select: { name: true } } } },
} as const;

const listQuery = paginationQuery.extend({
  departmentId: z.string().optional(),
  courseId: z.string().optional(),
  year: z.coerce.number().int().optional(),
  division: z.string().trim().toUpperCase().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
const orderFor = (by: string | undefined, dir: "asc" | "desc") =>
  by === "studentId" ? { studentId: dir } : by === "name" ? { user: { name: dir } } : by === "year" ? { year: dir } : { createdAt: dir };

async function assertCourseMatches(courseId: string, departmentId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { departmentId: true } });
  if (!course || course.departmentId !== departmentId) throw badRequest("The selected course does not belong to the selected department");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const scope = await departmentScope(req);
    const where = {
      ...(scope ? { departmentId: scope } : q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.courseId ? { courseId: q.courseId } : {}),
      ...(q.year ? { year: q.year } : {}),
      ...(q.division ? { division: q.division } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { studentId: { contains: q.search, mode: "insensitive" as const } },
              { prn: { contains: q.search, mode: "insensitive" as const } },
              { user: { name: { contains: q.search, mode: "insensitive" as const } } },
              { user: { email: { contains: q.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({ where, include, orderBy: orderFor(q.sortBy, q.sortDir), ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const s = await prisma.student.findUnique({ where: { id: req.params.id }, include });
    if (!s) throw notFound("Student not found");
    assertInScope(await departmentScope(req), s.departmentId);
    res.json({ student: s });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = createStudentSchema.parse(req.body);
    assertInScope(await departmentScope(req), d.departmentId);
    await assertCourseMatches(d.courseId, d.departmentId);
    if (d.parentId && !(await prisma.parent.findUnique({ where: { id: d.parentId }, select: { id: true } }))) throw badRequest("Selected parent does not exist");

    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { loginId: d.studentId, name: d.name, email: d.email, phone: d.phone, role: "STUDENT", passwordHash: await hashPassword(d.password) },
      });
      return tx.student.create({
        data: {
          userId: user.id, studentId: d.studentId, prn: d.prn, dateOfBirth: d.dateOfBirth, gender: d.gender,
          departmentId: d.departmentId, courseId: d.courseId, year: d.year, semester: d.semester, division: d.division,
          admissionYear: d.admissionYear, address: d.address, parentId: d.parentId, photoUrl: d.photoUrl,
        },
        include,
      });
    });
    await audit(req, "STUDENT_CREATED", "Student", student.id, { studentId: student.studentId });
    res.status(201).json({ student });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = updateStudentSchema.parse(req.body);
    const scope = await departmentScope(req);
    const current = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Student not found");
    assertInScope(scope, current.departmentId);
    if (d.departmentId) assertInScope(scope, d.departmentId);
    await assertCourseMatches(d.courseId ?? current.courseId, d.departmentId ?? current.departmentId);
    if (d.parentId && !(await prisma.parent.findUnique({ where: { id: d.parentId }, select: { id: true } }))) throw badRequest("Selected parent does not exist");

    const { name, email, phone, ...rest } = d;
    const student = await prisma.$transaction(async (tx) => {
      if (name !== undefined || email !== undefined || phone !== undefined) {
        await tx.user.update({ where: { id: current.userId }, data: { name, email, phone } });
      }
      return tx.student.update({ where: { id: current.id }, data: rest, include });
    });
    await audit(req, "STUDENT_UPDATED", "Student", student.id, { fields: Object.keys(d) });
    res.json({ student });
  }),
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(req.body);
    const current = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Student not found");
    assertInScope(await departmentScope(req), current.departmentId);
    // The linked login is switched too, so an inactive student cannot sign in.
    const student = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: current.userId }, data: { status } });
      return tx.student.update({ where: { id: current.id }, data: { status }, include });
    });
    await audit(req, status === "ACTIVE" ? "STUDENT_ACTIVATED" : "STUDENT_DEACTIVATED", "Student", current.id);
    res.json({ student });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Student not found");
    assertInScope(await departmentScope(req), current.departmentId);
    // Deleting the User cascades to the Student and all of their attendance, results and fee records.
    await prisma.user.delete({ where: { id: current.userId } });
    await audit(req, "STUDENT_DELETED", "Student", current.id, { studentId: current.studentId });
    res.json({ ok: true });
  }),
);

export default router;
