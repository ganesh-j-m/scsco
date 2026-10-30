import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../utils/errors.js";

// Public list of placed students (no login). Mounted at /api/public/placed-students.
const router = Router();

router.get(
    "/",
    asyncHandler(async (_req, res) => {
        const data = await prisma.placedStudent.findMany({
            where: { status: "PUBLISHED" },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
            take: 60,
            select: { id: true, name: true, photoUrl: true, company: true, companyLogo: true, role: true, course: true, batch: true, package: true },
        });
        res.setHeader("Cache-Control", "public, max-age=60");
        res.json({ data });
    }),
);

export default router;