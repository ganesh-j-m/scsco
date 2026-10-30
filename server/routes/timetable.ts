import { Router } from "express";
import { z } from "zod";
import type { Weekday } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, forbidden, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { timetableSchema, timetableUpdateSchema } from "../validators/academics.js";
import { assertInScope, departmentScope } from "../services/scope.js";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY"));

// Admin / Principal / HOD (own department) can change any slot. A FACULTY member can add, change and delete
// only the lectures of subjects assigned to them. Every change notifies the students of that class.
const DAY_NAME: Record<string, string> = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };

/** Bell notification for every active student of the class. Never breaks the main request. */
async function notifyClass(c: { courseId: string; year: number; division: string }, title: string, body: string) {
  try {
    const students = await prisma.student.findMany({
      where: { courseId: c.courseId, year: c.year, division: { equals: c.division, mode: "insensitive" }, status: "ACTIVE", user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    if (!students.length) return;
    await prisma.notification.createMany({ data: students.map((s) => ({ userId: s.userId, type: "ACADEMIC" as const, title, body, link: "/portal/dashboard" })) });
  } catch (e) {
    console.error("timetable notification failed", (e as Error).message);
  }
}

const describe = (x: { day: string; startTime: string; endTime: string; room?: string | null }, subject: string) =>
  `${subject} - ${DAY_NAME[x.day] ?? x.day} ${x.startTime}-${x.endTime}${x.room ? `, ${x.room}` : ""}`;

/** For FACULTY: their own faculty id (null for other roles). */
async function myFacultyId(req: { user?: { id: string; role: string } }) {
  if (req.user?.role !== "FACULTY") return null;
  const me = await prisma.faculty.findUnique({ where: { userId: req.user.id }, select: { id: true } });
  if (!me) throw forbidden();
  return me.id;
}

const include = {
  subject: { select: { id: true, name: true, code: true } },
  faculty: { select: { id: true, user: { select: { name: true } } } },
} as const;

interface Slot {
  day: Weekday; startTime: string; endTime: string; departmentId: string; courseId: string;
  year: number; division: string; subjectId: string; facultyId: string; room?: string | null;
}

/** Checks references are consistent and that the slot does not clash with another one. */
async function validateSlot(scope: string | undefined, s: Slot, excludeId?: string) {
  assertInScope(scope, s.departmentId);
  if (s.endTime <= s.startTime) throw badRequest("End time must be after start time");

  const [course, subject, faculty] = await Promise.all([
    prisma.course.findUnique({ where: { id: s.courseId }, select: { departmentId: true } }),
    prisma.subject.findUnique({ where: { id: s.subjectId }, select: { courseId: true } }),
    prisma.faculty.findUnique({ where: { id: s.facultyId }, select: { status: true } }),
  ]);
  if (!course || course.departmentId !== s.departmentId) throw badRequest("The course does not belong to the selected department");
  if (!subject || subject.courseId !== s.courseId) throw badRequest("The subject does not belong to the selected course");
  if (!faculty || faculty.status !== "ACTIVE") throw badRequest("The selected faculty member is not available");

  const clash = await prisma.timetable.findFirst({
    where: {
      day: s.day,
      startTime: { lt: s.endTime },
      endTime: { gt: s.startTime },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { facultyId: s.facultyId },
        { courseId: s.courseId, year: s.year, division: s.division },
        ...(s.room ? [{ room: s.room }] : []),
      ],
    },
    include,
  });
  if (clash) {
    const when = `${clash.startTime}-${clash.endTime}`;
    if (clash.facultyId === s.facultyId) throw conflict(`${clash.faculty.user.name} already teaches ${clash.subject.name} at ${when}.`);
    if (clash.courseId === s.courseId && clash.year === s.year && clash.division === s.division) throw conflict(`This class already has ${clash.subject.name} at ${when}.`);
    throw conflict(`Room ${s.room} is already used for ${clash.subject.name} at ${when}.`);
  }
}

async function withCourseNames<T extends { courseId: string }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.courseId))];
  const courses = await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true } });
  const byId = new Map(courses.map((c) => [c.id, c]));
  return rows.map((r) => ({ ...r, course: byId.get(r.courseId) ?? null }));
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery
      .extend({
        day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]).optional(),
        departmentId: z.string().optional(),
        courseId: z.string().optional(),
        year: z.coerce.number().int().optional(),
        division: z.string().trim().toUpperCase().optional(),
        facultyId: z.string().optional(),
      })
      .parse(req.query);

    let facultyId = q.facultyId;
    if (req.user!.role === "FACULTY") {
      const me = await prisma.faculty.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!me) return res.json({ data: [], meta: pageMeta(0, q.page, q.pageSize) });
      facultyId = me.id; // forced: faculty never see other teachers' slots
    }
    const scope = await departmentScope(req);
    const deptId = scope ?? q.departmentId;

    const where = {
      ...(q.day ? { day: q.day } : {}),
      ...(deptId ? { departmentId: deptId } : {}),
      ...(q.courseId ? { courseId: q.courseId } : {}),
      ...(q.year ? { year: q.year } : {}),
      ...(q.division ? { division: q.division } : {}),
      ...(facultyId ? { facultyId } : {}),
      ...(q.search ? { subject: { name: { contains: q.search, mode: "insensitive" as const } } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.timetable.count({ where }),
      prisma.timetable.findMany({ where, include, orderBy: [{ day: "asc" }, { startTime: "asc" }], ...pageArgs(q.page, q.pageSize) }),
    ]);
    res.json({ data: await withCourseNames(rows), meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = timetableSchema.parse(req.body);
    const mine = await myFacultyId(req);
    if (mine) {
      d.facultyId = mine; // a teacher can only schedule themselves
      const sub = await prisma.subject.findUnique({ where: { id: d.subjectId }, select: { facultyId: true } });
      if (!sub || sub.facultyId !== mine) throw forbidden("You can add lectures only for subjects assigned to you.");
    }
    await validateSlot(await departmentScope(req), d);
    const slot = await prisma.timetable.create({ data: d, include });
    await audit(req, "TIMETABLE_CREATED", "Timetable", slot.id, { day: slot.day, start: slot.startTime });
    await notifyClass(slot, "New lecture scheduled", describe(slot, slot.subject.name) + ` (${slot.faculty.user.name})`);
    res.status(201).json({ slot: (await withCourseNames([slot]))[0] });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = timetableUpdateSchema.parse(req.body);
    const scope = await departmentScope(req);
    const current = await prisma.timetable.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Timetable slot not found");
    assertInScope(scope, current.departmentId);
    const mine = await myFacultyId(req);
    if (mine) {
      if (current.facultyId !== mine) throw forbidden("You can change only your own lectures.");
      if (d.facultyId) d.facultyId = mine;
      if (d.subjectId) {
        const sub = await prisma.subject.findUnique({ where: { id: d.subjectId }, select: { facultyId: true } });
        if (!sub || sub.facultyId !== mine) throw forbidden("You can use only subjects assigned to you.");
      }
    }
    const merged: Slot = {
      day: d.day ?? current.day, startTime: d.startTime ?? current.startTime, endTime: d.endTime ?? current.endTime,
      departmentId: d.departmentId ?? current.departmentId, courseId: d.courseId ?? current.courseId, year: d.year ?? current.year,
      division: d.division ?? current.division, subjectId: d.subjectId ?? current.subjectId, facultyId: d.facultyId ?? current.facultyId,
      room: "room" in d ? d.room : current.room,
    };
    await validateSlot(scope, merged, current.id);
    const slot = await prisma.timetable.update({ where: { id: current.id }, data: d, include });
    await audit(req, "TIMETABLE_UPDATED", "Timetable", slot.id, { fields: Object.keys(d) });
    await notifyClass(slot, "Lecture changed", describe(slot, slot.subject.name) + ` (${slot.faculty.user.name})`);
    // if the lecture moved to another class, the old class is told too
    if (current.courseId !== slot.courseId || current.year !== slot.year || current.division !== slot.division)
      await notifyClass(current, "Lecture cancelled", `${DAY_NAME[current.day] ?? current.day} ${current.startTime}-${current.endTime} lecture was moved to another class.`);
    res.json({ slot: (await withCourseNames([slot]))[0] });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.timetable.findUnique({ where: { id: req.params.id }, include });
    if (!current) throw notFound("Timetable slot not found");
    assertInScope(await departmentScope(req), current.departmentId);
    const mine = await myFacultyId(req);
    if (mine && current.facultyId !== mine) throw forbidden("You can delete only your own lectures.");
    await prisma.timetable.delete({ where: { id: current.id } });
    await audit(req, "TIMETABLE_DELETED", "Timetable", current.id);
    await notifyClass(current, "Lecture cancelled", describe(current, current.subject.name) + " has been removed from the timetable.");
    res.json({ ok: true });
  }),
);

export default router;