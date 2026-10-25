import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { familyStudentId } from "../services/family.js";
import { notifyUsers } from "../services/notify.js";

const router = Router();
router.use(authenticate);

const MAX_ACTIVE = 3;
const FINE_PER_DAY = 2;
const DAY = 86400000;

// ───────── Everyone signed in: catalogue ─────────
router.get(
  "/books",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ category: z.string().optional(), availableOnly: z.enum(["true", "false"]).optional() }).parse(req.query);
    const where = {
      ...(q.category ? { category: q.category } : {}),
      ...(q.availableOnly === "true" ? { available: { gt: 0 } } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: "insensitive" as const } }, { author: { contains: q.search, mode: "insensitive" as const } }, { isbn: { contains: q.search } }] } : {}),
    };
    const [total, data, cats] = await Promise.all([
      prisma.libraryBook.count({ where }),
      prisma.libraryBook.findMany({ where, orderBy: { title: "asc" }, ...pageArgs(q.page, q.pageSize) }),
      prisma.libraryBook.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" }, take: 100 }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize), categories: cats.map((c) => c.category) });
  }),
);

// ───────── Student / parent ─────────
router.get(
  "/my",
  authorize("STUDENT", "PARENT"),
  asyncHandler(async (req, res) => {
    const studentId = await familyStudentId(req, z.string().optional().parse(req.query.studentId));
    const rows = await prisma.bookIssue.findMany({ where: { studentId }, orderBy: { issuedAt: "desc" }, take: 100, include: { book: { select: { title: true, author: true } } } });
    const now = Date.now();
    res.json({
      data: rows.map((r) => {
        const late = r.returnedAt ? 0 : Math.max(0, Math.ceil((now - r.dueDate.getTime()) / DAY));
        return { ...r, fine: r.returnedAt ? Number(r.fine) : late * FINE_PER_DAY, overdue: !r.returnedAt && late > 0 };
      }),
      finePerDay: FINE_PER_DAY,
    });
  }),
);

// ───────── Admin: books ─────────
const admin = authorize("ADMIN");
const bookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  isbn: z.string().trim().min(5).max(20),
  totalCopies: z.coerce.number().int().min(1).max(1000),
});

router.post(
  "/books",
  admin,
  asyncHandler(async (req, res) => {
    const d = bookSchema.parse(req.body);
    const book = await prisma.libraryBook.create({ data: { ...d, available: d.totalCopies } });
    await audit(req, "BOOK_CREATED", "LibraryBook", book.id, { isbn: d.isbn });
    res.status(201).json({ book });
  }),
);

router.patch(
  "/books/:id",
  admin,
  asyncHandler(async (req, res) => {
    const d = bookSchema.parse(req.body);
    const cur = await prisma.libraryBook.findUnique({ where: { id: req.params.id }, select: { id: true, totalCopies: true, available: true } });
    if (!cur) throw notFound("Book not found");
    const out = cur.totalCopies - cur.available; // copies currently issued
    if (d.totalCopies < out) throw badRequest(`${out} copies are currently issued, so total copies cannot be below ${out}`);
    const book = await prisma.libraryBook.update({ where: { id: cur.id }, data: { ...d, available: d.totalCopies - out } });
    await audit(req, "BOOK_UPDATED", "LibraryBook", book.id);
    res.json({ book });
  }),
);

router.delete(
  "/books/:id",
  admin,
  asyncHandler(async (req, res) => {
    const cur = await prisma.libraryBook.findUnique({ where: { id: req.params.id }, select: { id: true, _count: { select: { issues: true } } } });
    if (!cur) throw notFound("Book not found");
    if (cur._count.issues > 0) throw conflict("This book has issue history and cannot be deleted");
    await prisma.libraryBook.delete({ where: { id: cur.id } });
    await audit(req, "BOOK_DELETED", "LibraryBook", cur.id);
    res.json({ ok: true });
  }),
);

// ───────── Admin: issue / return ─────────
router.get(
  "/issues",
  admin,
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ state: z.enum(["active", "overdue", "returned"]).optional() }).parse(req.query);
    const now = new Date();
    const where = {
      ...(q.state === "active" ? { returnedAt: null } : q.state === "overdue" ? { returnedAt: null, dueDate: { lt: now } } : q.state === "returned" ? { returnedAt: { not: null } } : {}),
      ...(q.search ? { OR: [{ book: { title: { contains: q.search, mode: "insensitive" as const } } }, { student: { studentId: { contains: q.search, mode: "insensitive" as const } } }, { student: { user: { name: { contains: q.search, mode: "insensitive" as const } } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.bookIssue.count({ where }),
      prisma.bookIssue.findMany({
        where, orderBy: { issuedAt: "desc" }, ...pageArgs(q.page, q.pageSize),
        include: { book: { select: { title: true } }, student: { select: { studentId: true, user: { select: { name: true } } } } },
      }),
    ]);
    res.json({
      data: rows.map((r) => {
        const late = r.returnedAt ? 0 : Math.max(0, Math.ceil((now.getTime() - r.dueDate.getTime()) / DAY));
        return { ...r, fine: r.returnedAt ? Number(r.fine) : late * FINE_PER_DAY, overdue: !r.returnedAt && late > 0 };
      }),
      meta: pageMeta(total, q.page, q.pageSize),
    });
  }),
);

router.post(
  "/issues",
  admin,
  asyncHandler(async (req, res) => {
    const d = z.object({ bookId: z.string().min(1), studentId: z.string().trim().min(1), days: z.coerce.number().int().min(1).max(60).default(14) }).parse(req.body);
    const student = await prisma.student.findUnique({ where: { studentId: d.studentId }, select: { id: true, userId: true, status: true } });
    if (!student || student.status !== "ACTIVE") throw badRequest("No active student found with that Student ID");
    const active = await prisma.bookIssue.findMany({ where: { studentId: student.id, returnedAt: null }, select: { bookId: true } });
    if (active.length >= MAX_ACTIVE) throw conflict(`This student already has ${MAX_ACTIVE} books issued`);
    if (active.some((a) => a.bookId === d.bookId)) throw conflict("This student already has a copy of this book");
    const dueDate = new Date(Date.now() + d.days * DAY);
    const issue = await prisma.$transaction(async (tx) => {
      // Atomic decrement: fails (count 0) when no copy is available, even with parallel requests.
      const dec = await tx.libraryBook.updateMany({ where: { id: d.bookId, available: { gt: 0 } }, data: { available: { decrement: 1 } } });
      if (dec.count === 0) {
        const exists = await tx.libraryBook.findUnique({ where: { id: d.bookId }, select: { id: true } });
        throw exists ? conflict("No copies of this book are available") : notFound("Book not found");
      }
      return tx.bookIssue.create({ data: { bookId: d.bookId, studentId: student.id, dueDate }, include: { book: { select: { title: true } } } });
    });
    await audit(req, "BOOK_ISSUED", "BookIssue", issue.id, { bookId: d.bookId, studentId: d.studentId });
    await notifyUsers([student.userId], { type: "ACADEMIC", title: `Book issued: ${issue.book.title}`, body: `Due on ${dueDate.toISOString().slice(0, 10)}`, link: "/portal/library" });
    res.status(201).json({ ok: true });
  }),
);

router.post(
  "/issues/:id/return",
  admin,
  asyncHandler(async (req, res) => {
    const issue = await prisma.bookIssue.findUnique({ where: { id: req.params.id } });
    if (!issue) throw notFound("Issue record not found");
    if (issue.returnedAt) throw conflict("This book is already returned");
    const now = new Date();
    const late = Math.max(0, Math.ceil((now.getTime() - issue.dueDate.getTime()) / DAY));
    const fine = late * FINE_PER_DAY;
    await prisma.$transaction(async (tx) => {
      const done = await tx.bookIssue.updateMany({ where: { id: issue.id, returnedAt: null }, data: { returnedAt: now, fine } });
      if (done.count === 0) throw conflict("This book is already returned");
      await tx.libraryBook.update({ where: { id: issue.bookId }, data: { available: { increment: 1 } } });
    });
    await audit(req, "BOOK_RETURNED", "BookIssue", issue.id, { fine });
    res.json({ ok: true, fine });
  }),
);

export default router;
