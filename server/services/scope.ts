import type { Request } from "express";
import { prisma } from "../utils/prisma.js";
import { forbidden } from "../utils/errors.js";

/**
 * HOD access is limited to the department they head.
 * Returns the departmentId to restrict to, or undefined when the actor has college-wide access.
 */
export async function departmentScope(req: Request): Promise<string | undefined> {
  if (req.user?.role !== "HOD") return undefined;
  const faculty = await prisma.faculty.findUnique({
    where: { userId: req.user.id },
    select: { headOf: { select: { id: true } } },
  });
  if (!faculty?.headOf) throw forbidden("No department is assigned to you yet");
  return faculty.headOf.id;
}

export function assertInScope(scope: string | undefined, departmentId: string) {
  if (scope && scope !== departmentId) throw forbidden("This record belongs to another department");
}

/** Converts empty strings from forms into undefined so optional fields validate cleanly. */
export const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
