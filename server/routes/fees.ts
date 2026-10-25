import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { dateStr, rupees, toDate } from "../validators/ops.js";
import { familyStudentId } from "../services/family.js";
import { notifyUsers } from "../services/notify.js";

const router = Router();
router.use(authenticate);

type FeeRow = { amount: Prisma.Decimal; paid: Prisma.Decimal; status: string; dueDate: Date };
const view = <T extends FeeRow>(f: T) => {
  const amount = Number(f.amount), paid = Number(f.paid);
  const status = f.status === "PAID" ? "PAID" : f.dueDate < new Date() ? "OVERDUE" : f.status;
  return { ...f, amount, paid, balance: Math.max(0, amount - paid), status };
};

// ───────── Student / parent ─────────
router.get(
  "/my",
  authorize("STUDENT", "PARENT"),
  asyncHandler(async (req, res) => {
    const studentId = await familyStudentId(req, z.string().optional().parse(req.query.studentId));
    const rows = await prisma.fee.findMany({ where: { studentId }, orderBy: { dueDate: "desc" }, take: 100 });
    const data = rows.map(view);
    res.json({ data, totals: { amount: data.reduce((n, f) => n + f.amount, 0), paid: data.reduce((n, f) => n + f.paid, 0), due: data.reduce((n, f) => n + f.balance, 0) } });
  }),
);

// ───────── Admin ─────────
const admin = authorize("ADMIN");
const statusQ = z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE"]);

router.get(
  "/",
  admin,
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: statusQ.optional(), courseId: z.string().optional() }).parse(req.query);
    const now = new Date();
    const statusWhere =
      q.status === "OVERDUE" ? { status: { in: ["PENDING", "PARTIAL"] as ("PENDING" | "PARTIAL")[] }, dueDate: { lt: now } }
      : q.status === "PENDING" || q.status === "PARTIAL" ? { status: q.status, dueDate: { gte: now } }
      : q.status ? { status: q.status } : {};
    const where = {
      ...statusWhere,
      ...(q.courseId ? { student: { courseId: q.courseId } } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: "insensitive" as const } }, { student: { studentId: { contains: q.search, mode: "insensitive" as const } } }, { student: { user: { name: { contains: q.search, mode: "insensitive" as const } } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.fee.count({ where }),
      prisma.fee.findMany({
        where, orderBy: { dueDate: "desc" }, ...pageArgs(q.page, q.pageSize),
        include: { student: { select: { studentId: true, user: { select: { name: true } } } } },
      }),
    ]);
    res.json({ data: rows.map(view), meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

const createSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    amount: rupees,
    dueDate: dateStr,
    studentId: z.string().trim().optional(), // Student ID (login ID) for a single student
    courseId: z.string().optional(),
    year: z.coerce.number().int().min(1).max(5).optional(),
    division: z.string().trim().toUpperCase().max(5).optional(),
  })
  .refine((v) => v.studentId || v.courseId, { message: "Choose a student or a class" });

router.post(
  "/",
  admin,
  asyncHandler(async (req, res) => {
    const d = createSchema.parse(req.body);
    const students = await prisma.student.findMany({
      where: d.studentId
        ? { studentId: d.studentId, status: "ACTIVE" }
        : { status: "ACTIVE", courseId: d.courseId, ...(d.year ? { year: d.year } : {}), ...(d.division ? { division: d.division } : {}) },
      select: { id: true, userId: true },
      take: 1000,
    });
    if (!students.length) throw badRequest(d.studentId ? "No active student found with that Student ID" : "No active students match this class");
    await prisma.fee.createMany({ data: students.map((s) => ({ studentId: s.id, title: d.title, amount: d.amount, dueDate: toDate(d.dueDate) })) });
    await audit(req, "FEE_CREATED", "Fee", undefined, { title: d.title, amount: d.amount, students: students.length });
    await notifyUsers(students.map((s) => s.userId), { type: "ACADEMIC", title: `New fee: ${d.title}`, body: `Amount ₹${d.amount}, due ${d.dueDate}`, link: "/portal/fees" });
    res.status(201).json({ ok: true, created: students.length });
  }),
);

router.post(
  "/:id/payment",
  admin,
  asyncHandler(async (req, res) => {
    const { amount } = z.object({ amount: rupees }).parse(req.body);
    // The fee row is locked while the payment is applied, so two payments recorded at the same time
    // (two counters, double click) add up correctly instead of one overwriting the other.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fee" WHERE id = ${req.params.id} FOR UPDATE`;
      const fee = await tx.fee.findUnique({ where: { id: req.params.id }, include: { student: { select: { userId: true } } } });
      if (!fee) throw notFound("Fee record not found");
      const balance = fee.amount.minus(fee.paid);
      if (balance.lte(0)) throw conflict("This fee is already fully paid");
      if (new Prisma.Decimal(amount).gt(balance)) throw badRequest(`Payment cannot exceed the balance of ₹${balance.toFixed(2)}`);
      const paid = fee.paid.plus(amount);
      const updated = await tx.fee.update({
        where: { id: fee.id },
        data: {
          paid, status: paid.gte(fee.amount) ? "PAID" : "PARTIAL", paidAt: new Date(),
          receiptNo: fee.receiptNo ?? `RC-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`,
        },
      });
      return { fee, receiptNo: updated.receiptNo };
    });
    await audit(req, "FEE_PAYMENT_RECORDED", "Fee", result.fee.id, { amount, receiptNo: result.receiptNo });
    await notifyUsers([result.fee.student.userId], { type: "ACADEMIC", title: `Payment received: ${result.fee.title}`, body: `₹${amount} received. Receipt ${result.receiptNo}.`, link: "/portal/fees" });
    res.json({ ok: true, receiptNo: result.receiptNo });
  }),
);

router.delete(
  "/:id",
  admin,
  asyncHandler(async (req, res) => {
    const fee = await prisma.fee.findUnique({ where: { id: req.params.id }, select: { id: true, paid: true } });
    if (!fee) throw notFound("Fee record not found");
    if (fee.paid.gt(0)) throw conflict("A fee with recorded payments cannot be deleted");
    await prisma.fee.delete({ where: { id: fee.id } });
    await audit(req, "FEE_DELETED", "Fee", fee.id);
    res.json({ ok: true });
  }),
);

export default router;
