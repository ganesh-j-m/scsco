import { Router } from "express";
import { z } from "zod";
import type { EventRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate } from "../middleware/auth.js";

// Online permission for college events.
// Student -> HOD of the student's department -> Principal. HOD and Principal can approve, reject, or ask for a change
// (for example a new date); the Principal can also call the student to the office. Everyone involved is notified.
const router = Router();
router.use(authenticate);

const MANAGERS = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const blankToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);
const optText = (max: number) => z.preprocess(blankToUndef, z.string().trim().max(max).optional());

const reqSchema = z.object({
  title: z.string().trim().min(3, "Enter the event name").max(150),
  description: z.string().trim().min(10, "Describe the event plan (at least 10 characters)").max(3000),
  eventDate: z.string().regex(dateRe, "Choose the event date"),
  endDate: z.preprocess(blankToUndef, z.string().regex(dateRe, "Choose a valid end date").optional()),
  venue: z.string().trim().min(2, "Enter the venue").max(150),
  expectedParticipants: z.preprocess(blankToUndef, z.coerce.number().int().min(1).max(100000).optional()),
  budget: optText(100),
});

const decideSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "CHANGES", "MEET"]),
  message: optText(500),
  proposedDate: z.preprocess(blankToUndef, z.string().regex(dateRe, "Choose a valid date").optional()),
});

function checkDates(d: { eventDate: string; endDate?: string }) {
  if (d.eventDate < todayIST()) throw badRequest("The event date cannot be in the past");
  if (d.endDate && d.endDate < d.eventDate) throw badRequest("End date must be on or after the event date");
}

async function notify(userIds: string[], title: string, body: string, link: string) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type: "NOTICE" as const, title, body, link })) });
  } catch (e) {
    console.error("event request notification failed", (e as Error).message);
  }
}

const STAFF_LINK = "/admin/event-requests";
const STUDENT_LINK = "/portal/event-requests";

async function hodUserIds(departmentId: string): Promise<string[]> {
  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { hod: { select: { userId: true, user: { select: { status: true } } } } } });
  const ids: string[] = [];
  if (dept?.hod && dept.hod.user.status === "ACTIVE") ids.push(dept.hod.userId);
  const byRole = await prisma.faculty.findMany({ where: { departmentId, user: { role: "HOD", status: "ACTIVE" } }, select: { userId: true } });
  return [...new Set([...ids, ...byRole.map((f) => f.userId)])];
}
async function principalUserIds(): Promise<string[]> {
  return (await prisma.user.findMany({ where: { role: "PRINCIPAL", status: "ACTIVE" }, select: { id: true } })).map((u) => u.id);
}
/** Departments a HOD is responsible for. */
async function hodDeptIds(userId: string): Promise<string[]> {
  const f = await prisma.faculty.findUnique({ where: { userId }, select: { id: true, departmentId: true } });
  if (!f) return [];
  const headed = await prisma.department.findMany({ where: { hodId: f.id }, select: { id: true } });
  return headed.length ? headed.map((d) => d.id) : [f.departmentId];
}

/** Which stage this person may act on right now (null = none). */
function stageFor(role: string, status: EventRequestStatus): "HOD" | "PRINCIPAL" | null {
  if (role === "HOD" && status === "PENDING_HOD") return "HOD";
  if (MANAGERS.includes(role) && (status === "PENDING_PRINCIPAL" || status === "MEET_PRINCIPAL")) return "PRINCIPAL";
  return null;
}

async function loadVisible(req: { user?: { id: string; role: string } }, id: string) {
  const me = req.user!;
  const r = await prisma.eventRequest.findUnique({ where: { id }, include: { actions: { orderBy: { createdAt: "asc" } } } });
  if (!r) throw notFound("Event request not found");
  if (me.role === "STUDENT") { if (r.requesterId !== me.id) throw forbidden(); }
  else if (me.role === "HOD") { if (!(await hodDeptIds(me.id)).includes(r.departmentId)) throw forbidden(); }
  else if (!MANAGERS.includes(me.role)) throw forbidden();
  return r;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    let where: Prisma.EventRequestWhereInput = {};
    if (me.role === "STUDENT") where = { requesterId: me.id };
    else if (me.role === "HOD") where = { departmentId: { in: await hodDeptIds(me.id) } };
    else if (!MANAGERS.includes(me.role)) return res.json({ data: [] });
    const rows = await prisma.eventRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ data: rows.map((r) => ({ ...r, canAct: stageFor(me.role, r.status) })) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const r = await loadVisible(req, req.params.id);
    res.json({ ...r, canAct: stageFor(req.user!.role, r.status) });
  }),
);

// Student sends a new request (goes to the HOD first).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    if (me.role !== "STUDENT") throw forbidden("Only students can send event requests");
    const d = reqSchema.parse(req.body);
    checkDates(d);
    const st = await prisma.student.findUnique({ where: { userId: me.id }, select: { departmentId: true, courseId: true, year: true, division: true, course: { select: { name: true } }, user: { select: { name: true } } } });
    if (!st) throw badRequest("Student record not found");
    const hods = await hodUserIds(st.departmentId);
    const toPrincipal = hods.length === 0; // no HOD assigned: go straight to the Principal
    const r = await prisma.eventRequest.create({
      data: {
        title: d.title, description: d.description, eventDate: toDate(d.eventDate), endDate: d.endDate ? toDate(d.endDate) : null, venue: d.venue,
        expectedParticipants: d.expectedParticipants ?? null, budget: d.budget ?? null,
        requesterId: me.id, requesterName: st.user.name, requesterClass: `${st.course.name} · Year ${st.year} · Div ${st.division}`,
        departmentId: st.departmentId, courseId: st.courseId, status: toPrincipal ? "PENDING_PRINCIPAL" : "PENDING_HOD",
        actions: { create: { actorId: me.id, actorName: st.user.name, actorRole: "STUDENT", action: "SUBMITTED", message: toPrincipal ? "No HOD is assigned to this department, so the request went to the Principal." : null } },
      },
    });
    const body = `${st.user.name} (${st.course.name} Year ${st.year}): ${d.title} on ${d.eventDate}`;
    if (toPrincipal) await notify(await principalUserIds(), "Event request waiting for your approval", body, STAFF_LINK);
    else await notify(hods, "New event request", body, STAFF_LINK);
    await audit(req, "EVENT_REQUEST_CREATED", "EventRequest", r.id);
    res.status(201).json({ id: r.id });
  }),
);

// Student edits the request after a change was asked, and sends it again to the person who asked.
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const r = await loadVisible(req, req.params.id);
    if (r.requesterId !== me.id) throw forbidden();
    if (r.status !== "CHANGES_REQUESTED") throw badRequest("This request can be edited only when a change was asked");
    const d = reqSchema.parse(req.body);
    checkDates(d);
    const backToPrincipal = r.changesFrom === "PRINCIPAL";
    await prisma.eventRequest.update({
      where: { id: r.id },
      data: {
        title: d.title, description: d.description, eventDate: toDate(d.eventDate), endDate: d.endDate ? toDate(d.endDate) : null, venue: d.venue,
        expectedParticipants: d.expectedParticipants ?? null, budget: d.budget ?? null,
        status: backToPrincipal ? "PENDING_PRINCIPAL" : "PENDING_HOD", changesFrom: null,
        actions: { create: { actorId: me.id, actorName: r.requesterName, actorRole: "STUDENT", action: "RESUBMITTED", message: `Updated. Event date: ${d.eventDate}` } },
      },
    });
    const body = `${r.requesterName}: ${d.title} on ${d.eventDate} (updated)`;
    await notify(backToPrincipal ? await principalUserIds() : await hodUserIds(r.departmentId), "Event request updated", body, STAFF_LINK);
    res.json({ ok: true });
  }),
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const r = await loadVisible(req, req.params.id);
    if (r.requesterId !== me.id) throw forbidden();
    if (["APPROVED", "REJECTED", "CANCELLED"].includes(r.status)) throw badRequest("This request is already closed");
    await prisma.eventRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", actions: { create: { actorId: me.id, actorName: r.requesterName, actorRole: "STUDENT", action: "CANCELLED" } } } });
    const who = r.status === "PENDING_HOD" || r.status === "CHANGES_REQUESTED" ? await hodUserIds(r.departmentId) : await principalUserIds();
    await notify(who, "Event request cancelled", `${r.requesterName} cancelled "${r.title}".`, STAFF_LINK);
    res.json({ ok: true });
  }),
);

// HOD or Principal decides.
router.post(
  "/:id/decide",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const r = await loadVisible(req, req.params.id);
    const stage = stageFor(me.role, r.status);
    if (!stage) throw forbidden("This request is not waiting for your decision");
    const d = decideSchema.parse(req.body);
    if (d.decision !== "APPROVE" && (d.message ?? "").length < 3) throw badRequest("Please write a short message for the student");
    if (d.decision === "MEET" && stage !== "PRINCIPAL") throw forbidden();
    if (d.proposedDate && d.proposedDate < todayIST()) throw badRequest("The proposed date cannot be in the past");

    const prefix = stage === "HOD" ? "HOD" : "PRINCIPAL";
    const actor = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true } });
    const act = { actorId: me.id, actorName: actor?.name ?? me.role, actorRole: me.role, message: d.message ?? null, proposedDate: d.proposedDate ? toDate(d.proposedDate) : null };
    const hods = await hodUserIds(r.departmentId);
    const who = stage === "HOD" ? "HOD" : "Principal";
    const note = d.message ? ` ${d.message}` : "";
    const dateNote = d.proposedDate ? ` Suggested date: ${d.proposedDate}.` : "";
    let status: EventRequestStatus;
    let action: string;

    if (d.decision === "APPROVE") {
      status = stage === "HOD" ? "PENDING_PRINCIPAL" : "APPROVED";
      action = `${prefix}_APPROVED`;
      if (stage === "HOD") {
        await notify([r.requesterId], "Event request forwarded", `"${r.title}" was approved by the HOD and sent to the Principal.`, STUDENT_LINK);
        await notify(await principalUserIds(), "Event request waiting for your approval", `${r.requesterName} (${r.requesterClass}): ${r.title} on ${ymd(r.eventDate)}`, STAFF_LINK);
      } else {
        await notify([r.requesterId], "Event approved", `"${r.title}" is approved for ${ymd(r.eventDate)} at ${r.venue}.`, STUDENT_LINK);
        await notify(hods, "Event approved by Principal", `${r.requesterName}: "${r.title}" on ${ymd(r.eventDate)}.`, STAFF_LINK);
      }
    } else if (d.decision === "REJECT") {
      status = "REJECTED"; action = `${prefix}_REJECTED`;
      await notify([r.requesterId], "Event request rejected", `"${r.title}" was not approved by the ${who}.${note}`, STUDENT_LINK);
      if (stage === "PRINCIPAL") await notify(hods, "Event request rejected by Principal", `"${r.title}" (${r.requesterName}).${note}`, STAFF_LINK);
    } else if (d.decision === "CHANGES") {
      status = "CHANGES_REQUESTED"; action = `${prefix}_CHANGES`;
      await notify([r.requesterId], "Change asked in your event request", `${who} asked for a change in "${r.title}".${note}${dateNote}`, STUDENT_LINK);
      if (stage === "PRINCIPAL") await notify(hods, "Principal asked for a change", `"${r.title}" (${r.requesterName}).${note}${dateNote}`, STAFF_LINK);
    } else {
      status = "MEET_PRINCIPAL"; action = "PRINCIPAL_MEET";
      await notify([r.requesterId], "Principal wants to meet you", `About "${r.title}".${note}`, STUDENT_LINK);
      await notify(hods, "Principal called the student", `About "${r.title}" (${r.requesterName}).${note}`, STAFF_LINK);
    }

    await prisma.eventRequest.update({
      where: { id: r.id },
      data: { status, changesFrom: d.decision === "CHANGES" ? stage : null, actions: { create: { ...act, action } } },
    });
    await audit(req, `EVENT_REQUEST_${action}`, "EventRequest", r.id);
    res.json({ ok: true, status });
  }),
);

export default router;
