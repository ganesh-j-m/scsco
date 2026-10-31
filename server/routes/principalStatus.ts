import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";

// "Is the Principal in the college today?" One click by the Principal; everyone sees it and is notified when it changes.
// The status is valid for one day only (India time), so an old "not available" never stays on by mistake.
const router = Router();
router.use(authenticate);

const KEY = "principal.status";
const dayIST = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
interface Stored { status: "IN_OFFICE" | "NOT_AVAILABLE"; note: string; updatedAt: string }

async function current(): Promise<{ status: "IN_OFFICE" | "NOT_AVAILABLE" | "UNSET"; note: string; updatedAt: string | null }> {
  const row = await prisma.siteContent.findUnique({ where: { key: KEY } });
  const v = row?.value as unknown as Stored | undefined;
  if (!v || dayIST(new Date(v.updatedAt)) !== dayIST(new Date())) return { status: "UNSET", note: "", updatedAt: null };
  return { status: v.status, note: v.note ?? "", updatedAt: v.updatedAt };
}

router.get("/", asyncHandler(async (_req, res) => { res.json(await current()); }));

router.put(
  "/",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const d = z.object({ status: z.enum(["IN_OFFICE", "NOT_AVAILABLE"]), note: z.string().trim().max(200).default("") }).parse(req.body);
    const before = await current();
    if (before.status === d.status && before.note === d.note) return res.json(before); // nothing changed, do not notify again
    const value: Stored = { status: d.status, note: d.note, updatedAt: new Date().toISOString() };
    await prisma.siteContent.upsert({ where: { key: KEY }, update: { value: value as unknown as Prisma.InputJsonValue }, create: { key: KEY, value: value as unknown as Prisma.InputJsonValue } });

    const users = await prisma.user.findMany({ where: { status: "ACTIVE", role: { in: ["STUDENT", "FACULTY", "HOD"] } }, select: { id: true } });
    const title = d.status === "IN_OFFICE" ? "Principal is in the office" : "Principal is not available in college";
    const body = d.note || (d.status === "IN_OFFICE" ? "You can meet the Principal now." : "Please do not come to the Principal's office.");
    try {
      await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: "NOTICE" as const, title, body, link: null })) });
    } catch (e) {
      console.error("principal status notification failed", (e as Error).message);
    }
    await audit(req, "PRINCIPAL_STATUS_CHANGED", "SiteContent", KEY, { status: d.status });
    res.json(await current());
  }),
);

export default router;
