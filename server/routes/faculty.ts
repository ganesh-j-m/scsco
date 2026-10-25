import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, forbidden, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { createFacultySchema, updateFacultySchema } from "../validators/people.js";
import { hashPassword } from "../services/authService.js";
import { assertInScope, departmentScope } from "../services/scope.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD"));

const include = {
  user: { select: { name: true, email: true, phone: true, loginId: true, status: true, role: true } },
  department: { select: { id: true, name: true, code: true } },
  headOf: { select: { id: true, name: true } },
  _count: { select: { subjects: true } },
} as const;

const listQuery = paginationQuery.extend({
  departmentId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const scope = await departmentScope(req);
    const where = {
      ...(scope ? { departmentId: scope } : q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { employeeId: { contains: q.search, mode: "insensitive" as const } },
              { user: { name: { contains: q.search, mode: "insensitive" as const } } },
              { user: { email: { contains: q.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      prisma.faculty.count({ where }),
      prisma.faculty.findMany({
        where,
        include,
        orderBy: q.sortBy === "employeeId" ? { employeeId: q.sortDir } : q.sortBy === "name" ? { user: { name: q.sortDir } } : { createdAt: q.sortDir },
        ...pageArgs(q.page, q.pageSize),
      }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const f = await prisma.faculty.findUnique({ where: { id: req.params.id }, include });
    if (!f) throw notFound("Faculty member not found");
    assertInScope(await departmentScope(req), f.departmentId);
    res.json({ faculty: f });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = createFacultySchema.parse(req.body);
    assertInScope(await departmentScope(req), d.departmentId);
    const faculty = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { loginId: d.employeeId, name: d.name, email: d.email, phone: d.phone, role: "FACULTY", passwordHash: await hashPassword(d.password) },
      });
      return tx.faculty.create({
        data: { userId: user.id, employeeId: d.employeeId, departmentId: d.departmentId, designation: d.designation, qualification: d.qualification, photoUrl: d.photoUrl },
        include,
      });
    });
    await audit(req, "FACULTY_CREATED", "Faculty", faculty.id, { employeeId: faculty.employeeId });
    res.status(201).json({ faculty });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = updateFacultySchema.parse(req.body);
    const scope = await departmentScope(req);
    const current = await prisma.faculty.findUnique({ where: { id: req.params.id }, include: { headOf: { select: { id: true } } } });
    if (!current) throw notFound("Faculty member not found");
    assertInScope(scope, current.departmentId);
    if (d.departmentId) {
      assertInScope(scope, d.departmentId);
      if (current.headOf && d.departmentId !== current.departmentId) throw forbidden("Remove this person as HOD before moving them to another department");
    }
    const { name, email, phone, ...rest } = d;
    const faculty = await prisma.$transaction(async (tx) => {
      if (name !== undefined || email !== undefined || phone !== undefined) await tx.user.update({ where: { id: current.userId }, data: { name, email, phone } });
      return tx.faculty.update({ where: { id: current.id }, data: rest, include });
    });
    await audit(req, "FACULTY_UPDATED", "Faculty", faculty.id, { fields: Object.keys(d) });
    res.json({ faculty });
  }),
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(req.body);
    const current = await prisma.faculty.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Faculty member not found");
    assertInScope(await departmentScope(req), current.departmentId);
    const faculty = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: current.userId }, data: { status } });
      return tx.faculty.update({ where: { id: current.id }, data: { status }, include });
    });
    await audit(req, status === "ACTIVE" ? "FACULTY_ACTIVATED" : "FACULTY_DEACTIVATED", "Faculty", current.id);
    res.json({ faculty });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.faculty.findUnique({ where: { id: req.params.id }, include: { user: { select: { id: true } } } });
    if (!current) throw notFound("Faculty member not found");
    assertInScope(await departmentScope(req), current.departmentId);
    if (req.user!.id === current.userId) throw forbidden("You cannot delete your own account");
    // Fails with a clear 409 if attendance, forms or other records still reference this person; deactivate instead.
    await prisma.user.delete({ where: { id: current.userId } });
    await audit(req, "FACULTY_DELETED", "Faculty", current.id, { employeeId: current.employeeId });
    res.json({ ok: true });
  }),
);

export default router;
