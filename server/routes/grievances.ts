import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { GRIEVANCE_CATEGORIES, optStr } from "../validators/ops.js";
import { notifyUsers } from "../services/notify.js";

const router = Router();
router.use(authenticate);
const status = z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"]);

router.get("/categories", (_req, res) => res.json({ data: GRIEVANCE_CATEGORIES }));

// Users only ever see their own grievances.
router.get(
  "/my",
  authorize("STUDENT", "PARENT", "FACULTY", "ALUMNI"),
  asyncHandler(async (req, res) => {
    const data = await prisma.grievance.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ data });
  }),
);

router.post(
  "/",
  authorize("STUDENT", "PARENT", "FACULTY", "ALUMNI"),
  asyncHandler(async (req, res) => {
    const d = z.object({
      category: z.enum(GRIEVANCE_CATEGORIES),
      subject: z.string().trim().min(4, "Enter a subject").max(150),
      description: z.string().trim().min(10, "Describe the issue in at least 10 characters").max(3000),
      attachmentUrl: optStr(300),
    }).parse(req.body);
    const g = await prisma.grievance.create({ data: { ...d, userId: req.user!.id } });
    await audit(req, "GRIEVANCE_SUBMITTED", "Grievance", g.id, { category: d.category });
    res.status(201).json({ grievance: g });
  }),
);

router.get(
  "/",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: status.optional(), category: z.string().optional() }).parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.search ? { OR: [{ subject: { contains: q.search, mode: "insensitive" as const } }, { user: { name: { contains: q.search, mode: "insensitive" as const } } }, { user: { loginId: { contains: q.search, mode: "insensitive" as const } } }] } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.grievance.count({ where }),
      prisma.grievance.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q.page, q.pageSize), include: { user: { select: { name: true, loginId: true, role: true } } } }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.patch(
  "/:id",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const d = z.object({ status, response: optStr(2000) }).parse(req.body);
    const g = await prisma.grievance.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true, subject: true } });
    if (!g) throw notFound("Grievance not found");
    const closed = d.status === "RESOLVED" || d.status === "REJECTED";
    await prisma.grievance.update({ where: { id: g.id }, data: { status: d.status, response: d.response ?? null, resolvedAt: closed ? new Date() : null } });
    await audit(req, "GRIEVANCE_UPDATED", "Grievance", g.id, { status: d.status });
    await notifyUsers([g.userId], { type: "SYSTEM", title: `Grievance ${d.status.replace("_", " ").toLowerCase()}: ${g.subject}`, body: d.response, link: "/portal/grievances" });
    res.json({ ok: true });
  }),
);

export default router;
