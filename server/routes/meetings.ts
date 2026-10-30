import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate } from "../middleware/auth.js";

// Meetings called by the Principal. Participants (faculty / HODs) are fixed when the meeting is created, get a bell
// notification, and later ask the Principal to confirm they attended. The Principal approves or rejects each request.
const router = Router();
router.use(authenticate);

const MANAGERS = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
const isManager = (role: string) => MANAGERS.includes(role);
const ACTIVE = { status: "ACTIVE" as const, user: { status: "ACTIVE" as const } };

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const optText = (max: number) => z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(max).optional());

const createSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(150),
    topic: optText(1000),
    date: z.string().regex(dateRe, "Choose a date"),
    startTime: z.string().regex(timeRe, "Enter the start time"),
    endTime: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().regex(timeRe, "Enter a valid end time").optional()),
    venue: z.string().trim().min(2, "Enter the venue").max(150),
    audience: z.enum(["ALL", "DEPARTMENT", "HOD"]),
    departmentIds: z.array(z.string()).max(60).default([]),
  })
  .refine((d) => d.audience !== "DEPARTMENT" || d.departmentIds.length > 0, { message: "Choose at least one department", path: ["departmentIds"] });

const updateSchema = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  topic: optText(1000),
  date: z.string().regex(dateRe).optional(),
  startTime: z.string().regex(timeRe).optional(),
  endTime: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().regex(timeRe).optional()),
  venue: z.string().trim().min(2).max(150).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  minutes: optText(6000),
});

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const when = (m: { date: Date; startTime: string; endTime?: string | null; venue: string }) =>
  `${ymd(m.date)} ${m.startTime}${m.endTime ? `-${m.endTime}` : ""}, ${m.venue}`;

async function notify(userIds: string[], title: string, body: string) {
  if (!userIds.length) return;
  try {
    await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, type: "NOTICE" as const, title, body, link: "/admin/meetings" })) });
  } catch (e) {
    console.error("meeting notification failed", (e as Error).message);
  }
}

/** Active faculty / HOD user ids for the chosen audience. */
async function resolveAudience(audience: "ALL" | "DEPARTMENT" | "HOD", departmentIds: string[]): Promise<string[]> {
  let rows: { userId: string }[] = [];
  if (audience === "ALL") {
    rows = await prisma.faculty.findMany({ where: ACTIVE, select: { userId: true } });
  } else if (audience === "DEPARTMENT") {
    rows = await prisma.faculty.findMany({
      where: { ...ACTIVE, OR: [{ departmentId: { in: departmentIds } }, { headOf: { is: { id: { in: departmentIds } } } }] },
      select: { userId: true },
    });
  } else {
    const depts = await prisma.department.findMany({
      where: { hodId: { not: null }, ...(departmentIds.length ? { id: { in: departmentIds } } : {}) },
      select: { hodId: true },
    });
    const hodIds = depts.map((d) => d.hodId!).filter(Boolean);
    rows = await prisma.faculty.findMany({
      where: {
        ...ACTIVE,
        OR: [{ id: { in: hodIds } }, { user: { role: "HOD" }, ...(departmentIds.length ? { departmentId: { in: departmentIds } } : {}) }],
      },
      select: { userId: true },
    });
  }
  return [...new Set(rows.map((r) => r.userId))];
}

// Department list for the "choose departments" boxes (Principal / Admin).
router.get(
  "/departments",
  asyncHandler(async (req, res) => {
    if (!isManager(req.user!.role)) throw forbidden();
    const data = await prisma.department.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ data });
  }),
);

// List: managers see every meeting with counts; faculty / HOD see only meetings they were called to.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    if (isManager(me.role)) {
      const data = await prisma.meeting.findMany({ orderBy: [{ date: "desc" }, { startTime: "desc" }], take: 100 });
      const g = await prisma.meetingParticipant.groupBy({ by: ["meetingId", "status"], where: { meetingId: { in: data.map((m) => m.id) } }, _count: { _all: true } });
      const out = data.map((m) => {
        const counts = { INVITED: 0, REQUESTED: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
        g.filter((x) => x.meetingId === m.id).forEach((x) => { counts[x.status] = x._count._all; });
        return { ...m, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
      });
      return res.json({ data: out, manager: true });
    }
    const mine = await prisma.meetingParticipant.findMany({
      where: { userId: me.id },
      include: { meeting: true },
      orderBy: { meeting: { date: "desc" } },
      take: 100,
    });
    res.json({
      manager: false,
      data: mine.map((p) => ({ ...p.meeting, myStatus: p.status, myNote: p.note, myRemarks: p.remarks })),
    });
  }),
);

// One meeting. Managers get the full participant record.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const m = await prisma.meeting.findUnique({ where: { id: req.params.id }, include: { participants: true } });
    if (!m) throw notFound("Meeting not found");
    if (!isManager(me.role)) {
      const mine = m.participants.find((p) => p.userId === me.id);
      if (!mine) throw forbidden();
      const rest: Record<string, unknown> = { ...m };
      delete rest.participants;
      return res.json({ ...rest, myStatus: mine.status });
    }
    const users = await prisma.user.findMany({
      where: { id: { in: m.participants.map((p) => p.userId) } },
      select: { id: true, name: true, role: true, faculty: { select: { designation: true, department: { select: { name: true } } } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const participants = m.participants
      .map((p) => {
        const u = byId.get(p.userId);
        return { ...p, name: u?.name ?? "Unknown", role: u?.role ?? "", department: u?.faculty?.department?.name ?? "", designation: u?.faculty?.designation ?? "" };
      })
      .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
    res.json({ ...m, participants });
  }),
);

// Principal creates a meeting; the chosen faculty / HODs are notified.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    if (!isManager(me.role)) throw forbidden();
    const d = createSchema.parse(req.body);
    const ids = (await resolveAudience(d.audience, d.departmentIds)).filter((id) => id !== me.id);
    if (!ids.length) throw badRequest("No active faculty found for this audience");
    const meeting = await prisma.meeting.create({
      data: {
        title: d.title, topic: d.topic ?? null, date: new Date(`${d.date}T00:00:00.000Z`), startTime: d.startTime, endTime: d.endTime ?? null,
        venue: d.venue, audience: d.audience, departmentIds: d.audience === "ALL" ? [] : d.departmentIds, createdById: me.id,
        participants: { create: ids.map((userId) => ({ userId })) },
      },
    });
    await notify(ids, `Meeting: ${d.title}`, `${when(meeting)}.${d.topic ? ` Topic: ${d.topic}` : ""}`);
    await audit(req, "MEETING_CREATED", "Meeting", meeting.id);
    res.status(201).json({ id: meeting.id, invited: ids.length });
  }),
);

// Edit / reschedule / complete / cancel. Participants are told about any change that matters to them.
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isManager(req.user!.role)) throw forbidden();
    const cur = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!cur) throw notFound("Meeting not found");
    const d = updateSchema.parse(req.body);
    const next = await prisma.meeting.update({
      where: { id: cur.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.topic !== undefined && { topic: d.topic }),
        ...(d.date !== undefined && { date: new Date(`${d.date}T00:00:00.000Z`) }),
        ...(d.startTime !== undefined && { startTime: d.startTime }),
        ...(d.endTime !== undefined && { endTime: d.endTime }),
        ...(d.venue !== undefined && { venue: d.venue }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.minutes !== undefined && { minutes: d.minutes }),
      },
    });
    const ids = (await prisma.meetingParticipant.findMany({ where: { meetingId: cur.id }, select: { userId: true } })).map((p) => p.userId);
    if (d.status === "CANCELLED" && cur.status !== "CANCELLED") await notify(ids, `Meeting cancelled: ${next.title}`, when(next));
    else if (next.status !== "CANCELLED" && (d.date || d.startTime || d.endTime !== undefined || d.venue) && (ymd(cur.date) !== ymd(next.date) || cur.startTime !== next.startTime || cur.venue !== next.venue || cur.endTime !== next.endTime))
      await notify(ids, `Meeting updated: ${next.title}`, `New schedule: ${when(next)}`);
    await audit(req, "MEETING_UPDATED", "Meeting", cur.id);
    res.json({ ok: true });
  }),
);

// Faculty / HOD: "I attended" -> request for the Principal to confirm.
router.post(
  "/:id/attend",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const body = z.object({ note: optText(500) }).parse(req.body ?? {});
    const m = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!m) throw notFound("Meeting not found");
    const p = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: m.id, userId: me.id } } });
    if (!p) throw forbidden();
    if (m.status === "CANCELLED") throw badRequest("This meeting was cancelled");
    if (ymd(m.date) > todayIST()) throw badRequest("You can send this request on or after the meeting date");
    if (p.status === "APPROVED") throw badRequest("Your attendance is already approved");
    await prisma.meetingParticipant.update({ where: { id: p.id }, data: { status: "REQUESTED", note: body.note ?? null, requestedAt: new Date(), decidedAt: null, decidedById: null, remarks: null } });
    const u = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true } });
    await notify([m.createdById], "Attendance request", `${u?.name ?? "A faculty member"} says they attended "${m.title}" (${ymd(m.date)}). Please confirm.`);
    res.json({ ok: true });
  }),
);

// Principal: approve or reject requests (one, several, or all pending).
router.post(
  "/:id/decide",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    if (!isManager(me.role)) throw forbidden();
    const d = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), userIds: z.array(z.string()).max(500).optional(), remarks: optText(300) }).parse(req.body);
    const m = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!m) throw notFound("Meeting not found");
    const where = { meetingId: m.id, status: "REQUESTED" as const, ...(d.userIds ? { userId: { in: d.userIds } } : {}) };
    const targets = await prisma.meetingParticipant.findMany({ where, select: { userId: true } });
    if (!targets.length) throw badRequest("No pending requests to update");
    await prisma.meetingParticipant.updateMany({ where, data: { status: d.decision, decidedAt: new Date(), decidedById: me.id, remarks: d.remarks ?? null } });
    await notify(
      targets.map((t) => t.userId),
      d.decision === "APPROVED" ? "Attendance approved" : "Attendance not approved",
      `"${m.title}" (${ymd(m.date)})${d.remarks ? ` - ${d.remarks}` : ""}`,
    );
    await audit(req, `MEETING_ATTENDANCE_${d.decision}`, "Meeting", m.id);
    res.json({ updated: targets.length });
  }),
);

export default router;
