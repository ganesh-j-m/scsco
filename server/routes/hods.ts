import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";

// Only the Super Admin, Admin and Principal decide who heads a department.
const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL"));

const hodInclude = { select: { id: true, designation: true, user: { select: { name: true, loginId: true, email: true } } } } as const;

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, status: true, hod: hodInclude, _count: { select: { faculty: true } } },
    });
    res.json({ data });
  }),
);

router.put(
  "/:departmentId",
  asyncHandler(async (req, res) => {
    const { facultyId } = z.object({ facultyId: z.string().min(1) }).parse(req.body);
    const dept = await prisma.department.findUnique({ where: { id: req.params.departmentId }, select: { id: true, hodId: true } });
    if (!dept) throw notFound("Department not found");
    const faculty = await prisma.faculty.findUnique({ where: { id: facultyId }, include: { user: { select: { id: true, role: true, status: true } }, headOf: { select: { id: true } } } });
    if (!faculty) throw notFound("Faculty member not found");
    if (faculty.departmentId !== dept.id) throw badRequest("The HOD must be a faculty member of this department");
    if (faculty.user.status !== "ACTIVE") throw badRequest("An inactive faculty member cannot be made HOD");
    if (faculty.headOf && faculty.headOf.id !== dept.id) throw conflict("This person already heads another department");
    if (faculty.user.role !== "FACULTY" && faculty.user.role !== "HOD") throw badRequest("This account's role cannot be changed to HOD");

    await prisma.$transaction(async (tx) => {
      if (dept.hodId && dept.hodId !== faculty.id) {
        const prev = await tx.faculty.findUnique({ where: { id: dept.hodId }, select: { userId: true } });
        if (prev) await tx.user.updateMany({ where: { id: prev.userId, role: "HOD" }, data: { role: "FACULTY" } });
      }
      await tx.department.update({ where: { id: dept.id }, data: { hodId: faculty.id } });
      await tx.user.update({ where: { id: faculty.user.id }, data: { role: "HOD" } });
    });
    await audit(req, "HOD_ASSIGNED", "Department", dept.id, { facultyId });
    res.json({ ok: true });
  }),
);

router.delete(
  "/:departmentId",
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.findUnique({ where: { id: req.params.departmentId }, select: { id: true, hodId: true } });
    if (!dept) throw notFound("Department not found");
    if (!dept.hodId) throw badRequest("This department has no HOD");
    const hod = await prisma.faculty.findUnique({ where: { id: dept.hodId }, select: { userId: true } });
    await prisma.$transaction(async (tx) => {
      await tx.department.update({ where: { id: dept.id }, data: { hodId: null } });
      if (hod) await tx.user.updateMany({ where: { id: hod.userId, role: "HOD" }, data: { role: "FACULTY" } });
    });
    await audit(req, "HOD_REMOVED", "Department", dept.id);
    res.json({ ok: true });
  }),
);

export default router;
