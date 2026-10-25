import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { createUserSchema, updateUserSchema } from "../validators/auth.js";
import { hashPassword, toSafeUser } from "../services/authService.js";
import { assertCanManageRole, buildUserWhere, importUsersCsv } from "../services/userService.js";

const router = Router();
router.use(authenticate, authorize("ADMIN"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const listQuery = paginationQuery.extend({
  role: z.nativeEnum(Role).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
const SORTABLE = new Set(["loginId", "name", "email", "role", "status", "createdAt"]);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = buildUserWhere(q);
    const orderBy = { [SORTABLE.has(q.sortBy ?? "") ? q.sortBy! : "createdAt"]: q.sortDir };
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy, ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data: rows.map(toSafeUser), meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.get(
  "/export.csv",
  asyncHandler(async (req, res) => {
    const q = listQuery.partial().parse(req.query);
    const rows = await prisma.user.findMany({ where: buildUserWhere(q), orderBy: { createdAt: "desc" }, take: 5000 });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
    const csv = [
      "loginId,name,email,phone,role,status,createdAt",
      ...rows.map((u) => [u.loginId, u.name, u.email, u.phone, u.role, u.status, u.createdAt.toISOString()].map(esc).join(",")),
    ].join("\n");
    await audit(req, "USERS_EXPORTED", "User", undefined, { count: rows.length });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
    res.send(csv);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!u) throw notFound("User not found");
    res.json({ user: toSafeUser(u) });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = createUserSchema.parse(req.body);
    assertCanManageRole(req.user!.role, d.role);
    const u = await prisma.user.create({
      data: { loginId: d.loginId, name: d.name, email: d.email, phone: d.phone, role: d.role, passwordHash: await hashPassword(d.password) },
    });
    await audit(req, "USER_CREATED", "User", u.id, { loginId: u.loginId, role: u.role });
    res.status(201).json({ user: toSafeUser(u) });
  }),
);

router.post(
  "/import",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("Attach a CSV file in the 'file' field");
    const report = await importUsersCsv(req.file.buffer.toString("utf8"), req.user!.role);
    await audit(req, "USERS_IMPORTED", "User", undefined, report.summary);
    res.json(report);
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = updateUserSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound("User not found");
    assertCanManageRole(req.user!.role, target.role);
    if (d.role) assertCanManageRole(req.user!.role, d.role);
    if (target.id === req.user!.id && d.role && d.role !== target.role) throw forbidden("You cannot change your own role");
    const { password, ...rest } = d;
    const u = await prisma.user.update({
      where: { id: target.id },
      data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
    });
    await audit(req, "USER_UPDATED", "User", u.id, { fields: Object.keys(d).filter((k) => k !== "password"), passwordReset: !!password });
    res.json({ user: toSafeUser(u) });
  }),
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound("User not found");
    assertCanManageRole(req.user!.role, target.role);
    if (target.id === req.user!.id) throw forbidden("You cannot deactivate your own account");
    const u = await prisma.user.update({ where: { id: target.id }, data: { status } });
    await audit(req, status === "ACTIVE" ? "USER_ACTIVATED" : "USER_DEACTIVATED", "User", u.id);
    res.json({ user: toSafeUser(u) });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound("User not found");
    assertCanManageRole(req.user!.role, target.role);
    if (target.id === req.user!.id) throw forbidden("You cannot delete your own account");
    if (target.role === "SUPER_ADMIN") {
      const supers = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
      if (supers <= 1) throw forbidden("The last Super Admin cannot be deleted");
    }
    await prisma.user.delete({ where: { id: target.id } });
    await audit(req, "USER_DELETED", "User", target.id, { loginId: target.loginId });
    res.json({ ok: true });
  }),
);

export default router;
