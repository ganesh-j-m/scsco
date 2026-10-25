import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { CERTIFICATE_TYPES, optStr } from "../validators/ops.js";
import { notifyUsers } from "../services/notify.js";

const router = Router();
router.use(authenticate);
const status = z.enum(["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"]);

router.get("/types", (_req, res) => res.json({ data: CERTIFICATE_TYPES }));

// ───────── Student ─────────
router.get(
  "/my",
  authorize("STUDENT"),
  asyncHandler(async (req, res) => {
    const me = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    const data = me ? await prisma.certificate.findMany({ where: { studentId: me.id }, orderBy: { createdAt: "desc" }, take: 100 }) : [];
    res.json({ data });
  }),
);

router.post(
  "/",
  authorize("STUDENT"),
  asyncHandler(async (req, res) => {
    const d = z.object({ type: z.enum(CERTIFICATE_TYPES), reason: optStr(500) }).parse(req.body);
    const me = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true, status: true } });
    if (!me || me.status !== "ACTIVE") throw notFound("Active student profile not found");
    const open = await prisma.certificate.findFirst({ where: { studentId: me.id, type: d.type, status: { in: ["PENDING", "IN_REVIEW"] } }, select: { id: true } });
    if (open) throw conflict("You already have a pending request for this certificate");
    const c = await prisma.certificate.create({ data: { studentId: me.id, type: d.type, reason: d.reason } });
    await audit(req, "CERTIFICATE_REQUESTED", "Certificate", c.id, { type: d.type });
    res.status(201).json({ certificate: c });
  }),
);

// ───────── Admin / Principal ─────────
router.get(
  "/",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: status.optional() }).parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ type: { contains: q.search, mode: "insensitive" as const } }, { student: { studentId: { contains: q.search, mode: "insensitive" as const } } }, { student: { user: { name: { contains: q.search, mode: "insensitive" as const } } } }] } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.certificate.count({ where }),
      prisma.certificate.findMany({
        where, orderBy: { createdAt: "desc" }, ...pageArgs(q.page, q.pageSize),
        include: { student: { select: { studentId: true, user: { select: { name: true } } } } },
      }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.patch(
  "/:id",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const d = z.object({ status, remarks: optStr(500) }).parse(req.body);
    const c = await prisma.certificate.findUnique({ where: { id: req.params.id }, include: { student: { select: { userId: true } } } });
    if (!c) throw notFound("Request not found");
    await prisma.certificate.update({
      where: { id: c.id },
      data: { status: d.status, remarks: d.remarks ?? null, issuedAt: d.status === "APPROVED" ? new Date() : null },
    });
    await audit(req, "CERTIFICATE_REVIEWED", "Certificate", c.id, { status: d.status });
    if (d.status === "APPROVED" || d.status === "REJECTED")
      await notifyUsers([c.student.userId], { type: "ACADEMIC", title: `${c.type} ${d.status === "APPROVED" ? "approved" : "rejected"}`, body: d.status === "APPROVED" ? "Collect it from the college office." : d.remarks, link: "/portal/certificates" });
    res.json({ ok: true });
  }),
);

export default router;
