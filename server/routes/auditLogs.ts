import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../utils/errors.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";

const router = Router();
router.use(authenticate, authorize()); // SUPER_ADMIN only

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.parse(req.query);
    const where = q.search
      ? {
          OR: [
            { action: { contains: q.search, mode: "insensitive" as const } },
            { entity: { contains: q.search, mode: "insensitive" as const } },
            { user: { loginId: { contains: q.search, mode: "insensitive" as const } } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { loginId: true, name: true } } },
        ...pageArgs(q.page, q.pageSize),
      }),
    ]);
    res.json({ data: rows, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

export default router;
