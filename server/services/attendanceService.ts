import type { Request } from "express";
import type { Role } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { forbidden } from "../utils/errors.js";
import { departmentScope } from "./scope.js";

export const QR_VALIDITY_MS = 5 * 60 * 1000;
// Scans in flight when a session ends must not collide with the auto-absent step.
const FINALIZE_GRACE_MS = 30_000;

/**
 * After a QR session ends, every active student of that class who did not scan gets an ABSENT row.
 * Safe to run repeatedly and from several processes: rows are unique per (session, student).
 */
export async function finalizeDueSessions(limit = 20) {
  const cutoff = new Date(Date.now() - FINALIZE_GRACE_MS);
  const due = await prisma.attendanceSession.findMany({
    where: { finalizedAt: null, OR: [{ expiresAt: { lt: cutoff } }, { closedAt: { lt: cutoff } }] },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  for (const s of due) {
    const students = await prisma.student.findMany({
      where: { status: "ACTIVE", courseId: s.courseId, year: s.year, division: s.division },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.attendance.createMany({
        data: students.map((st) => ({
          studentId: st.id, subjectId: s.subjectId, facultyId: s.facultyId, sessionId: s.id, date: s.date,
          time: s.closedAt && s.closedAt < s.expiresAt ? s.closedAt : s.expiresAt,
          status: "ABSENT" as const, courseId: s.courseId, year: s.year, division: s.division,
        })),
        skipDuplicates: true,
      }),
      prisma.attendanceSession.updateMany({ where: { id: s.id, finalizedAt: null }, data: { finalizedAt: new Date() } }),
    ]);
  }
  return due.length;
}

export interface StaffScope {
  role: Role;
  facultyId?: string; // FACULTY: only their own records
  departmentId?: string; // HOD: only their department
}

/** Who may see/manage attendance: faculty their own, HOD their department, Admin/Principal/Super Admin everything. */
export async function staffScope(req: Request): Promise<StaffScope> {
  const role = req.user!.role;
  if (role === "FACULTY") {
    const me = await prisma.faculty.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!me) throw forbidden("No faculty profile is linked to your account");
    return { role, facultyId: me.id };
  }
  if (role === "HOD") return { role, departmentId: await departmentScope(req) };
  return { role };
}

/** Throws unless the actor may act on a class's subject (teacher / HOD of that department / admin). */
export function assertCanManageSubject(scope: StaffScope, subject: { facultyId: string | null; departmentId: string }) {
  if (scope.facultyId && subject.facultyId !== scope.facultyId) throw forbidden("You can only manage attendance for subjects assigned to you");
  if (scope.departmentId && subject.departmentId !== scope.departmentId) throw forbidden("This subject belongs to another department");
}

export const percentage = (attended: number, total: number) => (total === 0 ? 0 : Math.round((attended / total) * 1000) / 10);
