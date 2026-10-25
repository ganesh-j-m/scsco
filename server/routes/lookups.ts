import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../utils/errors.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { departmentScope } from "../services/scope.js";

// Small read-only lists used to fill dropdowns in admin forms.
const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY"));

router.get(
  "/academic",
  asyncHandler(async (req, res) => {
    const scope = await departmentScope(req);
    const [departments, courses] = await Promise.all([
      prisma.department.findMany({
        where: { status: "ACTIVE", ...(scope ? { id: scope } : {}) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true },
      }),
      prisma.course.findMany({
        where: { status: "ACTIVE", ...(scope ? { departmentId: scope } : {}) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true, departmentId: true, durationYears: true },
      }),
    ]);
    res.json({ departments, courses });
  }),
);

router.get(
  "/parents",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (_req, res) => {
    const data = await prisma.parent.findMany({
      orderBy: { user: { name: "asc" } },
      take: 300,
      select: { id: true, user: { select: { name: true, loginId: true } } },
    });
    res.json({ data });
  }),
);

export default router;
