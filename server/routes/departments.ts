import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { departmentSchema, departmentUpdateSchema } from "../validators/academics.js";
import { assertInScope, departmentScope } from "../services/scope.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD"));
const writers = authorize("ADMIN", "PRINCIPAL");

const select = {
  id: true, name: true, code: true, description: true, status: true, createdAt: true,
  hod: { select: { id: true, user: { select: { name: true, loginId: true } } } },
  _count: { select: { courses: true, faculty: true, students: true } },
} as const;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).parse(req.query);
    const scope = await departmentScope(req);
    const where = {
      ...(scope ? { id: scope } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { code: { contains: q.search, mode: "insensitive" as const } }] } : {}),
    };
    const orderBy = q.sortBy === "code" ? { code: q.sortDir } : q.sortBy === "createdAt" ? { createdAt: q.sortDir } : { name: q.sortDir };
    const [total, data] = await Promise.all([
      prisma.department.count({ where }),
      prisma.department.findMany({ where, select, orderBy, ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = await prisma.department.findUnique({ where: { id: req.params.id }, select });
    if (!d) throw notFound("Department not found");
    assertInScope(await departmentScope(req), d.id);
    res.json({ department: d });
  }),
);

router.post(
  "/",
  writers,
  asyncHandler(async (req, res) => {
    const d = departmentSchema.parse(req.body);
    const department = await prisma.department.create({ data: d, select });
    await audit(req, "DEPARTMENT_CREATED", "Department", department.id, { code: department.code });
    res.status(201).json({ department });
  }),
);

router.patch(
  "/:id",
  writers,
  asyncHandler(async (req, res) => {
    const d = departmentUpdateSchema.parse(req.body);
    if (!(await prisma.department.findUnique({ where: { id: req.params.id }, select: { id: true } }))) throw notFound("Department not found");
    const department = await prisma.department.update({ where: { id: req.params.id }, data: d, select });
    await audit(req, "DEPARTMENT_UPDATED", "Department", department.id, { fields: Object.keys(d) });
    res.json({ department });
  }),
);

router.delete(
  "/:id",
  writers,
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
    if (!dept) throw notFound("Department not found");
    const [courses, faculty, students] = await Promise.all([
      prisma.course.count({ where: { departmentId: dept.id } }),
      prisma.faculty.count({ where: { departmentId: dept.id } }),
      prisma.student.count({ where: { departmentId: dept.id } }),
    ]);
    if (courses || faculty || students)
      throw conflict(`Cannot delete: ${courses} courses, ${faculty} faculty and ${students} students are linked to this department. Deactivate it instead.`);
    await prisma.department.delete({ where: { id: dept.id } });
    await audit(req, "DEPARTMENT_DELETED", "Department", dept.id, { name: dept.name });
    res.json({ ok: true });
  }),
);

export default router;
