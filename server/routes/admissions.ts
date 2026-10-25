import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { optStr } from "../validators/ops.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL"));
const status = z.enum(["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"]);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: status.optional(), courseId: z.string().optional() }).parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.courseId ? { courseId: q.courseId } : {}),
      ...(q.search ? { OR: [{ applicantName: { contains: q.search, mode: "insensitive" as const } }, { email: { contains: q.search, mode: "insensitive" as const } }, { phone: { contains: q.search } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.admission.count({ where }),
      prisma.admission.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q.page, q.pageSize) }),
    ]);
    const courseIds = [...new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x))];
    const courses = await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } });
    const name = new Map(courses.map((c) => [c.id, c.name]));
    res.json({ data: rows.map((r) => ({ ...r, reference: r.id.slice(-8).toUpperCase(), courseName: r.courseId ? name.get(r.courseId) ?? null : null })), meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = z.object({ status, remarks: optStr(1000) }).parse(req.body);
    const cur = await prisma.admission.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!cur) throw notFound("Application not found");
    await prisma.admission.update({ where: { id: cur.id }, data: { status: d.status, remarks: d.remarks ?? null } });
    await audit(req, "ADMISSION_REVIEWED", "Admission", cur.id, { status: d.status });
    res.json({ ok: true });
  }),
);

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const g = await prisma.admission.groupBy({ by: ["status"], _count: { _all: true } });
    res.json(Object.fromEntries(g.map((x) => [x.status, x._count._all])));
  }),
);

export default router;
