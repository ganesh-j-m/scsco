import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { optStr } from "../validators/ops.js";
import { notifyUsers } from "../services/notify.js";

const router = Router();
router.use(authenticate);

// Every signed-in user: only their own notifications (userId always comes from the session).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ unread: z.enum(["true", "false"]).optional() }).parse(req.query);
    const where = { userId: req.user!.id, ...(q.unread === "true" ? { readAt: null } : {}) };
    const [total, data, unread] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q.page, q.pageSize) }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize), unread });
  }),
);

router.get("/unread-count", asyncHandler(async (req, res) => {
  res.json({ unread: await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }) });
}));

router.post("/read-all", asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

router.post("/:id/read", asyncHandler(async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { readAt: new Date() } });
  if (r.count === 0) throw notFound("Notification not found");
  res.json({ ok: true });
}));

// Admin / Principal: send an announcement to a group.
router.post(
  "/broadcast",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const d = z.object({
      audience: z.enum(["ALL", "STUDENT", "FACULTY", "PARENT"]),
      courseId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
      type: z.enum(["NOTICE", "ACADEMIC", "ALERT"]).default("NOTICE"),
      title: z.string().trim().min(3).max(120),
      body: optStr(1000),
    }).parse(req.body);
    if (d.courseId && d.audience !== "STUDENT") throw badRequest("A course can only be chosen when sending to students");
    const users = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: d.audience === "ALL" ? { in: ["STUDENT", "FACULTY", "PARENT", "HOD"] } : d.audience,
        ...(d.courseId ? { student: { courseId: d.courseId } } : {}),
      },
      select: { id: true }, take: 5000,
    });
    if (!users.length) throw badRequest("No active users match this audience");
    await notifyUsers(users.map((u) => u.id), { type: d.type, title: d.title, body: d.body });
    await audit(req, "NOTIFICATION_BROADCAST", "Notification", undefined, { audience: d.audience, courseId: d.courseId, recipients: users.length });
    res.status(201).json({ ok: true, recipients: users.length });
  }),
);

export default router;
