import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { createParentSchema, updateParentSchema } from "../validators/people.js";
import { hashPassword } from "../services/authService.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL"));

const include = {
  user: { select: { name: true, email: true, phone: true, loginId: true, status: true } },
  children: { select: { id: true, studentId: true, user: { select: { name: true } } } },
} as const;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.parse(req.query);
    const where = q.search
      ? {
          OR: [
            { user: { name: { contains: q.search, mode: "insensitive" as const } } },
            { user: { loginId: { contains: q.search, mode: "insensitive" as const } } },
            { user: { email: { contains: q.search, mode: "insensitive" as const } } },
          ],
        }
      : {};
    const [total, data] = await Promise.all([
      prisma.parent.count({ where }),
      prisma.parent.findMany({ where, include, orderBy: q.sortBy === "name" ? { user: { name: q.sortDir } } : { createdAt: q.sortDir }, ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const p = await prisma.parent.findUnique({ where: { id: req.params.id }, include });
    if (!p) throw notFound("Parent not found");
    res.json({ parent: p });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = createParentSchema.parse(req.body);
    const parent = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { loginId: d.loginId, name: d.name, email: d.email, phone: d.phone, role: "PARENT", passwordHash: await hashPassword(d.password) },
      });
      return tx.parent.create({ data: { userId: user.id, occupation: d.occupation, address: d.address }, include });
    });
    await audit(req, "PARENT_CREATED", "Parent", parent.id, { loginId: d.loginId });
    res.status(201).json({ parent });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = updateParentSchema.parse(req.body);
    const current = await prisma.parent.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Parent not found");
    const { name, email, phone, ...rest } = d;
    const parent = await prisma.$transaction(async (tx) => {
      if (name !== undefined || email !== undefined || phone !== undefined) await tx.user.update({ where: { id: current.userId }, data: { name, email, phone } });
      return tx.parent.update({ where: { id: current.id }, data: rest, include });
    });
    await audit(req, "PARENT_UPDATED", "Parent", parent.id, { fields: Object.keys(d) });
    res.json({ parent });
  }),
);

// Replaces the full set of linked students. A parent can then see only these children.
router.put(
  "/:id/children",
  asyncHandler(async (req, res) => {
    const { studentIds } = z.object({ studentIds: z.array(z.string()).max(20) }).parse(req.body);
    const current = await prisma.parent.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Parent not found");
    const found = await prisma.student.count({ where: { id: { in: studentIds } } });
    if (found !== new Set(studentIds).size) throw badRequest("One or more selected students do not exist");

    const parent = await prisma.$transaction(async (tx) => {
      await tx.student.updateMany({ where: { parentId: current.id, id: { notIn: studentIds } }, data: { parentId: null } });
      await tx.student.updateMany({ where: { id: { in: studentIds } }, data: { parentId: current.id } });
      return tx.parent.findUniqueOrThrow({ where: { id: current.id }, include });
    });
    await audit(req, "PARENT_CHILDREN_LINKED", "Parent", current.id, { count: studentIds.length });
    res.json({ parent });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.parent.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Parent not found");
    // Linked students are kept (their parentId becomes null); only the parent login is removed.
    await prisma.user.delete({ where: { id: current.userId } });
    await audit(req, "PARENT_DELETED", "Parent", current.id);
    res.json({ ok: true });
  }),
);

export default router;
