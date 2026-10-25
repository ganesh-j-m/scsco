import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { pageArgs, pageMeta } from "../utils/pagination.js";

const router = Router();

// Public content changes rarely; let browsers/CDNs cache briefly.
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  next();
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(100).optional(),
});

/** All CMS key/value blocks (hero, contact, principal, about, admissions info, campus) in one call. */
router.get(
  "/site",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.siteContent.findMany();
    const content = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ content });
  }),
);

// Real counts only — nothing is hardcoded.
router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [students, faculty, departments, courses] = await Promise.all([
      prisma.student.count({ where: { status: "ACTIVE" } }),
      prisma.faculty.count({ where: { status: "ACTIVE" } }),
      prisma.department.count({ where: { status: "ACTIVE" } }),
      prisma.course.count({ where: { status: "ACTIVE" } }),
    ]);
    res.json({ students, faculty, departments, courses });
  }),
);

router.get(
  "/notices",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = {
      status: "PUBLISHED" as const,
      ...(q.search ? { title: { contains: q.search, mode: "insensitive" as const } } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.notice.count({ where }),
      prisma.notice.findMany({ where, orderBy: { publishedAt: "desc" }, ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const when = z.enum(["upcoming", "past"]).optional().parse(req.query.when);
    const now = new Date();
    const where = {
      status: "PUBLISHED" as const,
      ...(when === "upcoming" ? { date: { gte: now } } : when === "past" ? { date: { lt: now } } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.event.count({ where }),
      prisma.event.findMany({ where, orderBy: { date: when === "past" ? "desc" : "asc" }, ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.get(
  "/gallery",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const category = z.string().trim().max(60).optional().parse(req.query.category);
    const where = { status: "PUBLISHED" as const, ...(category ? { category } : {}) };
    const [total, data, cats] = await Promise.all([
      prisma.galleryItem.count({ where }),
      prisma.galleryItem.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q.page, q.pageSize) }),
      prisma.galleryItem.findMany({ where: { status: "PUBLISHED", category: { not: null } }, distinct: ["category"], select: { category: true } }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize), categories: cats.map((c) => c.category) });
  }),
);

router.get(
  "/facilities",
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.facility.findMany({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "asc" } }) });
  }),
);

router.get(
  "/achievements",
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.achievement.findMany({ where: { status: "PUBLISHED" }, orderBy: { date: "desc" } }) });
  }),
);

router.get(
  "/placements",
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.placement.findMany({ where: { status: "PUBLISHED" }, orderBy: { driveDate: "desc" }, take: 50 }) });
  }),
);

router.get(
  "/departments",
  asyncHandler(async (_req, res) => {
    const data = await prisma.department.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, code: true, description: true,
        hod: { select: { designation: true, photoUrl: true, user: { select: { name: true } } } },
        _count: { select: { courses: true, faculty: true } },
      },
    });
    res.json({ data });
  }),
);

router.get(
  "/courses",
  asyncHandler(async (req, res) => {
    const departmentId = z.string().optional().parse(req.query.departmentId);
    const data = await prisma.course.findMany({
      where: { status: "ACTIVE", ...(departmentId ? { departmentId } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, durationYears: true, description: true, department: { select: { id: true, name: true } } },
    });
    res.json({ data });
  }),
);

// Public faculty list exposes only name, designation, qualification, photo and department.
router.get(
  "/faculty",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const departmentId = z.string().optional().parse(req.query.departmentId);
    const where = {
      status: "ACTIVE" as const,
      ...(departmentId ? { departmentId } : {}),
      ...(q.search ? { user: { name: { contains: q.search, mode: "insensitive" as const } } } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.faculty.count({ where }),
      prisma.faculty.findMany({
        where,
        orderBy: { user: { name: "asc" } },
        select: { id: true, designation: true, qualification: true, photoUrl: true, user: { select: { name: true } }, department: { select: { name: true } } },
        ...pageArgs(q.page, q.pageSize),
      }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

const applySchema = z.object({
  applicantName: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid phone number"),
  courseId: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  previousMarks: z.coerce.number().min(0).max(100).optional(),
  address: z.string().trim().max(300).optional(),
});

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many applications from this connection. Please try again later." },
});

router.post(
  "/admissions",
  applyLimiter,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const d = applySchema.parse(req.body);
    const created = await prisma.admission.create({ data: d });
    await audit(req, "ADMISSION_SUBMITTED", "Admission", created.id, undefined, undefined);
    res.status(201).json({ ok: true, reference: created.id.slice(-8).toUpperCase() });
  }),
);

export default router;
