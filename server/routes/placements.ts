import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { optDate, optStr, toDate } from "../validators/ops.js";

const router = Router();
router.use(authenticate);

// Signed-in portal users: published drives only.
router.get(
  "/open",
  asyncHandler(async (_req, res) => {
    const data = await prisma.placement.findMany({
      where: { status: "PUBLISHED", OR: [{ deadline: null }, { deadline: { gte: new Date() } }] },
      orderBy: [{ driveDate: "asc" }, { createdAt: "desc" }], take: 50,
    });
    res.json({ data });
  }),
);

const manage = authorize("ADMIN", "PRINCIPAL");
const schema = z.object({
  company: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().min(2).max(120),
  eligibility: optStr(300), package: optStr(60), location: optStr(120), description: optStr(2000),
  driveDate: optDate, deadline: optDate,
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});
const data = (d: z.infer<typeof schema>) => ({
  ...d, eligibility: d.eligibility ?? null, package: d.package ?? null, location: d.location ?? null, description: d.description ?? null,
  driveDate: d.driveDate ? toDate(d.driveDate) : null, deadline: d.deadline ? toDate(d.deadline) : null,
});

router.get(
  "/",
  manage,
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() }).parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [{ company: { contains: q.search, mode: "insensitive" as const } }, { jobTitle: { contains: q.search, mode: "insensitive" as const } }] } : {}),
    };
    const [total, rows] = await Promise.all([prisma.placement.count({ where }), prisma.placement.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q.page, q.pageSize) })]);
    res.json({ data: rows, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.post("/", manage, asyncHandler(async (req, res) => {
  const p = await prisma.placement.create({ data: data(schema.parse(req.body)) });
  await audit(req, "PLACEMENT_CREATED", "Placement", p.id, { company: p.company });
  res.status(201).json({ placement: p });
}));

router.patch("/:id", manage, asyncHandler(async (req, res) => {
  const cur = await prisma.placement.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!cur) throw notFound("Placement not found");
  const p = await prisma.placement.update({ where: { id: cur.id }, data: data(schema.parse(req.body)) });
  await audit(req, "PLACEMENT_UPDATED", "Placement", p.id);
  res.json({ placement: p });
}));

router.delete("/:id", manage, asyncHandler(async (req, res) => {
  const cur = await prisma.placement.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!cur) throw notFound("Placement not found");
  await prisma.placement.delete({ where: { id: cur.id } });
  await audit(req, "PLACEMENT_DELETED", "Placement", cur.id);
  res.json({ ok: true });
}));

export default router;
