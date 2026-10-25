import type { Request } from "express";
import { prisma } from "../utils/prisma.js";
import { forbidden } from "../utils/errors.js";

/**
 * Resolves which student a STUDENT or PARENT is allowed to view.
 * A student only ever sees themselves; a parent only their linked children.
 */
export async function familyStudentId(req: Request, wanted?: string): Promise<string> {
  if (req.user!.role === "PARENT") {
    const parent = await prisma.parent.findUnique({ where: { userId: req.user!.id }, select: { children: { select: { id: true } } } });
    const ids = parent?.children.map((c) => c.id) ?? [];
    const id = wanted ?? ids[0] ?? "";
    if (!id || !ids.includes(id)) throw forbidden("You can only view your own children's records");
    return id;
  }
  const me = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!me) throw forbidden("No student profile is linked to your account");
  return me.id;
}
