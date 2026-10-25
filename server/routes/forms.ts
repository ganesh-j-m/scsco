import { Router, type Request } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, conflict, forbidden, HttpError, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import rateLimit from "express-rate-limit";
import { departmentScope } from "../services/scope.js";
import { acceptFile, receiveFile, removeFile, sendFile } from "../services/privateFiles.js";
import { notifyUsers } from "../services/notify.js";
import { CHOICE_TYPES, type FieldDef, assignmentConditionsFor, audienceWhere, csvCell, loadViewer, validateAnswers } from "../services/formEngine.js";
import { assignmentsSchema, settingsSchema, structureSchema } from "../validators/forms.js";

const router = Router();
router.use(authenticate);

const structureInclude = {
  sections: { orderBy: { order: "asc" as const } },
  fields: { orderBy: { order: "asc" as const }, include: { options: { orderBy: { order: "asc" as const } } } },
} as const;

const publicField = (f: { id: string; sectionId: string | null; type: string; label: string; description: string | null; placeholder: string | null; helpText: string | null; defaultValue: string | null; required: boolean; validationConfig: unknown; conditionalLogic: unknown; options: { label: string; value: string }[] }) => ({
  id: f.id, sectionId: f.sectionId, type: f.type, label: f.label, description: f.description, placeholder: f.placeholder, helpText: f.helpText,
  defaultValue: f.defaultValue, required: f.required, validationConfig: f.validationConfig, conditionalLogic: f.conditionalLogic, options: f.options.map((o) => ({ label: o.label, value: o.value })),
});

// ═════════════════ Portal: forms assigned to me ═════════════════
type PortalState = "open" | "upcoming" | "ended";
const stateOf = (f: { startAt: Date | null; endAt: Date | null }, now = new Date()): PortalState => (f.startAt && f.startAt > now ? "upcoming" : f.endAt && f.endAt < now ? "ended" : "open");

async function loadAssigned(req: Request, id: string) {
  const viewer = await loadViewer(req.user!);
  const form = await prisma.form.findFirst({
    where: { id, status: "PUBLISHED", assignments: { some: { OR: assignmentConditionsFor(viewer) } } },
    include: structureInclude,
  });
  if (!form) throw notFound("This form is not available to you");
  return form;
}

router.get(
  "/portal/list",
  asyncHandler(async (req, res) => {
    const viewer = await loadViewer(req.user!);
    const forms = await prisma.form.findMany({
      where: { status: "PUBLISHED", assignments: { some: { OR: assignmentConditionsFor(viewer) } } },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, title: true, description: true, startAt: true, endAt: true, allowMultipleSubmissions: true, allowEditAfterSubmission: true, createdAt: true },
    });
    const mine = await prisma.formSubmission.groupBy({ by: ["formId"], where: { userId: req.user!.id, formId: { in: forms.map((f) => f.id) } }, _count: { _all: true }, _max: { submittedAt: true } });
    const by = new Map(mine.map((m) => [m.formId, m]));
    res.json({ data: forms.map((f) => ({ ...f, state: stateOf(f), submissions: by.get(f.id)?._count._all ?? 0, lastSubmittedAt: by.get(f.id)?._max.submittedAt ?? null })) });
  }),
);

router.get(
  "/portal/:id",
  asyncHandler(async (req, res) => {
    const form = await loadAssigned(req, req.params.id);
    const last = await prisma.formSubmission.findFirst({ where: { formId: form.id, userId: req.user!.id }, orderBy: { attempt: "desc" }, include: { answers: true } });
    const count = await prisma.formSubmission.count({ where: { formId: form.id, userId: req.user!.id } });
    const answers = last ? Object.fromEntries(last.answers.map((a) => [a.fieldId, a.value])) : null;
    const submittable = count === 0 || form.allowMultipleSubmissions || form.allowEditAfterSubmission;
    res.json({
      form: { id: form.id, title: form.title, description: form.description, instructions: form.instructions, startAt: form.startAt, endAt: form.endAt, allowMultipleSubmissions: form.allowMultipleSubmissions, allowEditAfterSubmission: form.allowEditAfterSubmission },
      state: stateOf(form),
      sections: form.sections.map((s) => ({ id: s.id, title: s.title })),
      fields: form.fields.map(publicField),
      submitted: count,
      // Pre-fill only when the person is going to edit their previous answers.
      answers: answers && !form.allowMultipleSubmissions && form.allowEditAfterSubmission ? answers : null,
      canSubmit: submittable,
    });
  }),
);

// Attach a file to a "File upload" question. The returned id goes into the answer when the form is submitted.
router.post(
  "/portal/:id/upload",
  rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many uploads. Please wait a minute." } }),
  receiveFile,
  asyncHandler(async (req, res) => {
    let file;
    try {
      const form = await loadAssigned(req, req.params.id);
      const state = stateOf(form);
      if (state === "upcoming") throw forbidden("This form is not open yet");
      if (state === "ended") throw new HttpError(410, "This form is closed");
      if (!form.fields.some((f) => f.type === "FILE_UPLOAD")) throw badRequest("This form has no file upload question");
      file = acceptFile(req);
      if (!file) throw badRequest("Attach a file");
      // Unsent uploads pile up if someone keeps retrying; cap them per person and form.
      if ((await prisma.formFile.count({ where: { formId: form.id, userId: req.user!.id } })) >= 20) throw badRequest("Too many files uploaded for this form");
      const row = await prisma.formFile.create({ data: { formId: form.id, userId: req.user!.id, fileKey: file.key, fileName: file.name, fileMime: file.mime, fileSize: file.size } });
      res.status(201).json({ id: row.id, name: row.fileName, size: row.fileSize });
    } catch (e) { if (file) removeFile(file.key); else if (req.file) removeFile(req.file.filename); throw e; }
  }),
);

// The uploader can open their own file; form managers can open files sent to forms they manage.
router.get(
  "/portal/file/:fid",
  asyncHandler(async (req, res) => {
    const f = await prisma.formFile.findFirst({ where: { id: req.params.fid, userId: req.user!.id } });
    if (!f) throw notFound("File not found");
    sendFile(res, f);
  }),
);

router.post(
  "/portal/:id/submit",
  asyncHandler(async (req, res) => {
    const body = z.object({ answers: z.record(z.string(), z.unknown()) }).parse(req.body);
    const form = await loadAssigned(req, req.params.id);
    const state = stateOf(form);
    if (state === "upcoming") throw forbidden("This form is not open yet");
    if (state === "ended") throw new HttpError(410, "This form is closed");

    const defs: FieldDef[] = form.fields.map((f) => ({ id: f.id, type: f.type, label: f.label, required: f.required, validationConfig: f.validationConfig, conditionalLogic: f.conditionalLogic, options: f.options }));
    const mine = await prisma.formFile.findMany({ where: { formId: form.id, userId: req.user!.id }, select: { id: true } });
    const { clean, errors } = validateAnswers(defs, body.answers, new Set(mine.map((f) => f.id)));
    if (Object.keys(errors).length) throw new HttpError(400, "Please correct the highlighted answers", Object.entries(errors).map(([path, message]) => ({ path, message })));
    const rows = Object.entries(clean).map(([fieldId, value]) => ({ fieldId, value }));

    const result = await prisma.$transaction(async (tx) => {
      // Serialise submissions per form so the response limit and attempt numbers cannot be raced.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${form.id}))`;
      const last = await tx.formSubmission.findFirst({ where: { formId: form.id, userId: req.user!.id }, orderBy: { attempt: "desc" }, select: { id: true, attempt: true } });
      if (last && !form.allowMultipleSubmissions) {
        if (!form.allowEditAfterSubmission) throw conflict("You have already submitted this form");
        await tx.formAnswer.deleteMany({ where: { submissionId: last.id } });
        await tx.formAnswer.createMany({ data: rows.map((r) => ({ ...r, submissionId: last.id })) });
        await tx.formSubmission.update({ where: { id: last.id }, data: { updatedAt: new Date() } });
        return { id: last.id, edited: true };
      }
      if (form.submissionLimit) {
        const total = await tx.formSubmission.count({ where: { formId: form.id } });
        if (total >= form.submissionLimit) throw conflict("This form is no longer accepting responses");
      }
      const sub = await tx.formSubmission.create({ data: { formId: form.id, userId: req.user!.id, attempt: (last?.attempt ?? 0) + 1 } });
      await tx.formAnswer.createMany({ data: rows.map((r) => ({ ...r, submissionId: sub.id })) });
      return { id: sub.id, edited: false };
    });
    await audit(req, result.edited ? "FORM_SUBMISSION_EDITED" : "FORM_SUBMITTED", "Form", form.id);
    res.status(result.edited ? 200 : 201).json({ ok: true, ...result });
  }),
);

// ═════════════════ Staff: build and manage forms ═════════════════
const creators = authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY");
router.use(creators);

interface Actor { userId: string; role: string; full: boolean; departmentId: string | null }

async function actorOf(req: Request): Promise<Actor> {
  const role = req.user!.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "PRINCIPAL") return { userId: req.user!.id, role, full: true, departmentId: null };
  if (role === "HOD") return { userId: req.user!.id, role, full: false, departmentId: (await departmentScope(req)) ?? null };
  const f = await prisma.faculty.findUnique({ where: { userId: req.user!.id }, select: { departmentId: true } });
  if (!f) throw forbidden("No faculty profile is linked to your account");
  return { userId: req.user!.id, role, full: false, departmentId: f.departmentId };
}

const canManage = (a: Actor, f: { createdById: string; scopeDepartmentId: string | null }) =>
  a.full || f.createdById === a.userId || (a.role === "HOD" && !!a.departmentId && f.scopeDepartmentId === a.departmentId);

async function loadManaged(req: Request, id: string) {
  const actor = await actorOf(req);
  const form = await prisma.form.findUnique({ where: { id }, include: { ...structureInclude, assignments: true, createdBy: { select: { name: true } }, _count: { select: { submissions: true } } } });
  if (!form || !canManage(actor, form)) throw notFound("Form not found");
  return { actor, form };
}

const dateOrNull = (s: string | null | undefined) => (s ? new Date(s) : null);
function assertWindow(startAt: Date | null, endAt: Date | null) {
  if (startAt && endAt && endAt <= startAt) throw badRequest("The closing time must be after the opening time");
}

// Find a user by Login ID when choosing "selected users" as the audience.
router.get(
  "/lookup/user",
  asyncHandler(async (req, res) => {
    const loginId = z.string().trim().min(1).max(60).parse(req.query.loginId);
    const u = await prisma.user.findFirst({ where: { loginId: { equals: loginId, mode: "insensitive" }, status: "ACTIVE" }, select: { id: true, name: true, loginId: true, role: true } });
    if (!u) throw notFound("No active user found with that Login ID");
    res.json({ user: u });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]).optional() }).parse(req.query);
    const a = await actorOf(req);
    const where: Prisma.FormWhereInput = {
      ...(a.full ? {} : { OR: [{ createdById: a.userId }, ...(a.role === "HOD" && a.departmentId ? [{ scopeDepartmentId: a.departmentId }] : [])] }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { title: { contains: q.search, mode: "insensitive" as const } } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.form.count({ where }),
      prisma.form.findMany({
        where, orderBy: { updatedAt: "desc" }, ...pageArgs(q.page, q.pageSize),
        select: { id: true, title: true, status: true, startAt: true, endAt: true, createdAt: true, updatedAt: true, createdBy: { select: { name: true } }, _count: { select: { submissions: true, fields: true } } },
      }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = settingsSchema.parse(req.body);
    const actor = await actorOf(req);
    const startAt = dateOrNull(d.startAt), endAt = dateOrNull(d.endAt);
    assertWindow(startAt, endAt);
    const form = await prisma.form.create({
      data: {
        title: d.title, description: d.description, instructions: d.instructions, startAt, endAt, submissionLimit: d.submissionLimit,
        allowMultipleSubmissions: d.allowMultipleSubmissions, allowEditAfterSubmission: d.allowEditAfterSubmission,
        createdById: actor.userId, scopeDepartmentId: actor.full ? null : actor.departmentId,
      },
    });
    await audit(req, "FORM_CREATED", "Form", form.id, { title: form.title });
    res.status(201).json({ form: { id: form.id } });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    res.json({
      form: {
        id: form.id, title: form.title, description: form.description, instructions: form.instructions, status: form.status, startAt: form.startAt, endAt: form.endAt,
        submissionLimit: form.submissionLimit, allowMultipleSubmissions: form.allowMultipleSubmissions, allowEditAfterSubmission: form.allowEditAfterSubmission,
        createdBy: form.createdBy.name, submissions: form._count.submissions,
      },
      sections: form.sections.map((s) => ({ id: s.id, title: s.title })),
      fields: form.fields.map(publicField),
      assignments: form.assignments.map((a) => ({ targetType: a.targetType, targetId: a.targetId })),
    });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    const d = settingsSchema.parse(req.body);
    const startAt = dateOrNull(d.startAt), endAt = dateOrNull(d.endAt);
    assertWindow(startAt, endAt);
    await prisma.form.update({
      where: { id: form.id },
      data: { title: d.title, description: d.description ?? null, instructions: d.instructions ?? null, startAt, endAt, submissionLimit: d.submissionLimit ?? null, allowMultipleSubmissions: d.allowMultipleSubmissions, allowEditAfterSubmission: d.allowEditAfterSubmission },
    });
    await audit(req, "FORM_UPDATED", "Form", form.id);
    res.json({ ok: true });
  }),
);

router.put(
  "/:id/structure",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    if (form._count.submissions > 0) throw conflict("This form already has responses, so its questions can no longer be changed. Duplicate the form to make a new version.");
    const d = structureSchema.parse(req.body);

    const sectionIds = new Map(d.sections.map((s) => [s.key, crypto.randomUUID()]));
    if (sectionIds.size !== d.sections.length) throw badRequest("Section keys must be unique");
    const fieldIds = new Map(d.fields.map((f) => [f.key, crypto.randomUUID()]));
    if (fieldIds.size !== d.fields.length) throw badRequest("Question keys must be unique");

    const seen = new Set<string>();
    d.fields.forEach((f) => {
      if (f.sectionKey && !sectionIds.has(f.sectionKey)) throw badRequest(`"${f.label}" refers to a section that does not exist`);
      if (CHOICE_TYPES.includes(f.type)) {
        if (f.options.length < 1) throw badRequest(`"${f.label}" needs at least one option`);
        const labels = f.options.map((o) => o.label.toLowerCase());
        if (new Set(labels).size !== labels.length) throw badRequest(`"${f.label}" has duplicate options`);
      }
      if (f.logic) {
        if (!seen.has(f.logic.fieldKey)) throw badRequest(`"${f.label}": the condition must depend on a question placed above it`);
      }
      const v = f.validation;
      if (v?.min !== undefined && v.max !== undefined && v.min > v.max) throw badRequest(`"${f.label}": minimum cannot be greater than maximum`);
      if (v?.minLength !== undefined && v.maxLength !== undefined && v.minLength > v.maxLength) throw badRequest(`"${f.label}": minimum length cannot be greater than maximum length`);
      seen.add(f.key);
    });

    await prisma.$transaction(async (tx) => {
      await tx.formField.deleteMany({ where: { formId: form.id } });
      await tx.formSection.deleteMany({ where: { formId: form.id } });
      if (d.sections.length) await tx.formSection.createMany({ data: d.sections.map((s, i) => ({ id: sectionIds.get(s.key)!, formId: form.id, title: s.title, order: i })) });
      if (d.fields.length) {
        await tx.formField.createMany({
          data: d.fields.map((f, i) => ({
            id: fieldIds.get(f.key)!, formId: form.id, sectionId: f.sectionKey ? sectionIds.get(f.sectionKey)! : null, type: f.type, label: f.label,
            description: f.description, placeholder: f.placeholder, helpText: f.helpText, defaultValue: f.defaultValue, required: f.required, order: i,
            validationConfig: f.validation && Object.values(f.validation).some((x) => x !== undefined) ? (f.validation as Prisma.InputJsonValue) : undefined,
            conditionalLogic: f.logic ? { fieldId: fieldIds.get(f.logic.fieldKey)!, operator: f.logic.operator, value: f.logic.value } : undefined,
          })),
        });
        const options = d.fields.flatMap((f) => (CHOICE_TYPES.includes(f.type) ? f.options.map((o, i) => ({ fieldId: fieldIds.get(f.key)!, label: o.label, value: o.label, order: i })) : []));
        if (options.length) await tx.formOption.createMany({ data: options });
      }
      await tx.form.update({ where: { id: form.id }, data: { updatedAt: new Date() } });
    });
    await audit(req, "FORM_STRUCTURE_SAVED", "Form", form.id, { fields: d.fields.length });
    res.json({ ok: true });
  }),
);

// Validates that the actor may target each audience, and normalises ids.
async function normaliseAssignments(actor: Actor, input: z.infer<typeof assignmentsSchema>["assignments"]) {
  const out = new Map<string, { targetType: (typeof input)[number]["targetType"]; targetId: string | null }>();
  const deptIds = new Set<string>(), courseIds = new Set<string>(), userIds = new Set<string>();
  const noId = ["ALL_STUDENTS", "HOD", "STAFF"];
  const allowedFor = actor.full ? null : actor.role === "HOD"
    ? ["DEPARTMENT", "COURSE", "YEAR", "DIVISION", "CLASS", "FACULTY", "TEACHERS", "PARENTS", "SELECTED_USERS"]
    : ["COURSE", "YEAR", "DIVISION", "CLASS", "SELECTED_USERS"];

  for (const a of input) {
    if (allowedFor && !allowedFor.includes(a.targetType)) throw forbidden("You cannot send a form to that audience");
    let id: string | null = a.targetId ? a.targetId : null;
    if (noId.includes(a.targetType)) id = null;
    else {
      const [course, p2, p3] = (id ?? "").split("|");
      switch (a.targetType) {
        case "DEPARTMENT": if (!id) throw badRequest("Choose a department"); deptIds.add(id); break;
        case "COURSE": if (!id) throw badRequest("Choose a course"); courseIds.add(id); break;
        case "YEAR": case "DIVISION": case "CLASS": {
          if (!course) throw badRequest("Choose a course");
          if (course === "*" && !actor.full) throw forbidden("Choose a specific course");
          if (a.targetType === "YEAR" && !(Number(p2) >= 1 && Number(p2) <= 5)) throw badRequest("Choose a year");
          if (a.targetType === "CLASS" && !(Number(p2) >= 1 && Number(p2) <= 5 && p3)) throw badRequest("Choose a year and division");
          if (a.targetType === "DIVISION" && !p2) throw badRequest("Enter a division");
          id = a.targetType === "DIVISION" ? `${course}|${p2.toUpperCase()}` : a.targetType === "CLASS" ? `${course}|${Number(p2)}|${p3.toUpperCase()}` : `${course}|${Number(p2)}`;
          if (course !== "*") courseIds.add(course);
          break;
        }
        case "FACULTY": case "TEACHERS":
          if (!actor.full) id = actor.departmentId;
          if (id) deptIds.add(id);
          break;
        case "PARENTS":
          if (!actor.full && !id) throw badRequest("Choose a course for the parents");
          if (id) courseIds.add(id);
          break;
        case "SELECTED_USERS": if (!id) throw badRequest("Choose a user"); userIds.add(id); break;
      }
    }
    out.set(`${a.targetType}:${id ?? ""}`, { targetType: a.targetType, targetId: id });
  }

  const [depts, courses, users] = await Promise.all([
    prisma.department.findMany({ where: { id: { in: [...deptIds] } }, select: { id: true } }),
    prisma.course.findMany({ where: { id: { in: [...courseIds] } }, select: { id: true, departmentId: true } }),
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, role: true, student: { select: { departmentId: true } }, faculty: { select: { departmentId: true } } } }),
  ]);
  if (depts.length !== deptIds.size) throw badRequest("A selected department does not exist");
  if (courses.length !== courseIds.size) throw badRequest("A selected course does not exist");
  if (users.length !== userIds.size) throw badRequest("A selected user does not exist");
  if (!actor.full) {
    if ([...deptIds].some((d) => d !== actor.departmentId)) throw forbidden("You can only choose your own department");
    if (courses.some((c) => c.departmentId !== actor.departmentId)) throw forbidden("You can only choose courses of your own department");
    for (const u of users) {
      const dept = u.student?.departmentId ?? (actor.role === "HOD" ? u.faculty?.departmentId : undefined);
      if (dept !== actor.departmentId) throw forbidden("You can only choose users of your own department");
    }
  }
  return [...out.values()];
}

router.put(
  "/:id/assignments",
  asyncHandler(async (req, res) => {
    const { actor, form } = await loadManaged(req, req.params.id);
    const d = assignmentsSchema.parse(req.body);
    const list = await normaliseAssignments(actor, d.assignments);
    await prisma.$transaction([
      prisma.formAssignment.deleteMany({ where: { formId: form.id } }),
      prisma.formAssignment.createMany({ data: list.map((a) => ({ formId: form.id, targetType: a.targetType, targetId: a.targetId })) }),
    ]);
    const audience = await prisma.user.count({ where: audienceWhere(list) });
    await audit(req, "FORM_AUDIENCE_SAVED", "Form", form.id, { rules: list.length, audience });
    res.json({ ok: true, audience });
  }),
);

router.get(
  "/:id/audience",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    const where = audienceWhere(form.assignments);
    const [audience, responded] = await Promise.all([
      prisma.user.count({ where }),
      prisma.formSubmission.findMany({ where: { formId: form.id }, distinct: ["userId"], select: { userId: true } }),
    ]);
    res.json({ audience, responded: responded.length });
  }),
);

router.post(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]) }).parse(req.body);
    const { form } = await loadManaged(req, req.params.id);
    if (status === form.status) return res.json({ ok: true });
    if (status === "DRAFT" && form._count.submissions > 0) throw conflict("A form with responses cannot go back to draft. Close or archive it instead.");
    let notify: string[] = [];
    if (status === "PUBLISHED") {
      if (form.fields.length === 0) throw badRequest("Add at least one question before publishing");
      if (form.assignments.length === 0) throw badRequest("Choose who should receive this form before publishing");
      if (form.endAt && form.endAt < new Date()) throw badRequest("The closing time is in the past. Change it before publishing.");
      const users = await prisma.user.findMany({ where: audienceWhere(form.assignments), select: { id: true }, take: 5000 });
      if (users.length === 0) throw badRequest("No active users match the chosen audience");
      if (form.status === "DRAFT") notify = users.map((u) => u.id);
    }
    await prisma.form.update({ where: { id: form.id }, data: { status } });
    await audit(req, "FORM_STATUS_CHANGED", "Form", form.id, { from: form.status, to: status });
    await notifyUsers(notify, { type: "FORM", title: `New form: ${form.title}`, body: form.endAt ? `Please respond before ${form.endAt.toISOString().slice(0, 10)}.` : undefined, link: `/portal/forms/${form.id}` });
    res.json({ ok: true, notified: notify.length });
  }),
);

router.post(
  "/:id/duplicate",
  asyncHandler(async (req, res) => {
    const { actor, form } = await loadManaged(req, req.params.id);
    const copy = await prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          title: `${form.title} (copy)`.slice(0, 150), description: form.description, instructions: form.instructions, submissionLimit: form.submissionLimit,
          allowMultipleSubmissions: form.allowMultipleSubmissions, allowEditAfterSubmission: form.allowEditAfterSubmission,
          createdById: actor.userId, scopeDepartmentId: actor.full ? null : actor.departmentId,
        },
      });
      const sec = new Map(form.sections.map((s) => [s.id, crypto.randomUUID()]));
      const fld = new Map(form.fields.map((f) => [f.id, crypto.randomUUID()]));
      if (form.sections.length) await tx.formSection.createMany({ data: form.sections.map((s) => ({ id: sec.get(s.id)!, formId: created.id, title: s.title, order: s.order })) });
      if (form.fields.length) {
        await tx.formField.createMany({
          data: form.fields.map((f) => {
            const logic = f.conditionalLogic as { fieldId: string; operator: string; value: string } | null;
            return {
              id: fld.get(f.id)!, formId: created.id, sectionId: f.sectionId ? sec.get(f.sectionId)! : null, type: f.type, label: f.label, description: f.description,
              placeholder: f.placeholder, helpText: f.helpText, defaultValue: f.defaultValue, required: f.required, order: f.order,
              validationConfig: (f.validationConfig as Prisma.InputJsonValue | null) ?? undefined,
              conditionalLogic: logic ? { ...logic, fieldId: fld.get(logic.fieldId)! } : undefined,
            };
          }),
        });
        const opts = form.fields.flatMap((f) => f.options.map((o) => ({ fieldId: fld.get(f.id)!, label: o.label, value: o.value, order: o.order })));
        if (opts.length) await tx.formOption.createMany({ data: opts });
      }
      return created;
    });
    await audit(req, "FORM_DUPLICATED", "Form", copy.id, { from: form.id });
    res.status(201).json({ form: { id: copy.id } });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    if (form._count.submissions > 0) throw conflict("This form has responses and cannot be deleted. Archive it instead.");
    await prisma.form.delete({ where: { id: form.id } });
    await audit(req, "FORM_DELETED", "Form", form.id, { title: form.title });
    res.json({ ok: true });
  }),
);

// ───── Responses ─────
router.get(
  "/:id/submissions",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    const q = paginationQuery.parse(req.query);
    const where: Prisma.FormSubmissionWhereInput = {
      formId: form.id,
      ...(q.search ? { user: { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { loginId: { contains: q.search, mode: "insensitive" as const } }] } } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.formSubmission.count({ where }),
      prisma.formSubmission.findMany({ where, orderBy: { submittedAt: "desc" }, ...pageArgs(q.page, q.pageSize), select: { id: true, attempt: true, submittedAt: true, updatedAt: true, user: { select: { name: true, loginId: true, role: true } } } }),
    ]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

// Per-question summary of all responses (counts for choices, min/avg/max for numbers and ratings).
router.get(
  "/:id/analytics",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    const [responses, answers] = await Promise.all([
      prisma.formSubmission.count({ where: { formId: form.id } }),
      prisma.formAnswer.findMany({ where: { submission: { formId: form.id } }, select: { fieldId: true, value: true } }),
    ]);
    const byField = new Map<string, unknown[]>();
    for (const a of answers) byField.set(a.fieldId, [...(byField.get(a.fieldId) ?? []), a.value]);
    const questions = form.fields.map((f) => {
      const vals = byField.get(f.id) ?? [];
      const base = { id: f.id, label: f.label, type: f.type, answered: vals.length };
      if (CHOICE_TYPES.includes(f.type as never) || f.type === "YES_NO") {
        const counts = new Map<string, number>();
        for (const v of vals) for (const x of Array.isArray(v) ? v : [v]) counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
        return { ...base, kind: "choice" as const, counts: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count) };
      }
      if (f.type === "NUMBER" || f.type === "RATING") {
        const nums = vals.map(Number).filter((n) => Number.isFinite(n));
        const dist = new Map<number, number>();
        if (f.type === "RATING") for (const n of nums) dist.set(n, (dist.get(n) ?? 0) + 1);
        return { ...base, kind: "number" as const, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null, distribution: [...dist].sort((a, b) => a[0] - b[0]).map(([label, count]) => ({ label: String(label), count })) };
      }
      return { ...base, kind: "text" as const };
    });
    const audience = await prisma.formAssignment.count({ where: { formId: form.id } });
    res.json({ responses, hasAudience: audience > 0, questions });
  }),
);

router.get(
  "/file/:fid",
  asyncHandler(async (req, res) => {
    const f = await prisma.formFile.findUnique({ where: { id: req.params.fid } });
    if (!f) throw notFound("File not found");
    await loadManaged(req, f.formId);
    sendFile(res, f);
  }),
);

router.get(
  "/:id/submissions/:sid",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    const sub = await prisma.formSubmission.findFirst({ where: { id: req.params.sid, formId: form.id }, include: { answers: true, user: { select: { name: true, loginId: true, role: true } } } });
    if (!sub) throw notFound("Response not found");
    const ans = new Map(sub.answers.map((a) => [a.fieldId, a.value]));
    const fileIds = form.fields.filter((f) => f.type === "FILE_UPLOAD").map((f) => ans.get(f.id)).filter((v): v is string => typeof v === "string");
    const files = new Map((await prisma.formFile.findMany({ where: { id: { in: fileIds }, formId: form.id }, select: { id: true, fileName: true, fileSize: true } })).map((x) => [x.id, x]));
    const show = (f: { id: string; type: string }) => {
      const v = ans.get(f.id) ?? null;
      if (f.type !== "FILE_UPLOAD" || typeof v !== "string") return v;
      const x = files.get(v);
      return x ? { fileId: x.id, name: x.fileName, size: x.fileSize } : null;
    };
    res.json({ user: sub.user, attempt: sub.attempt, submittedAt: sub.submittedAt, answers: form.fields.map((f) => ({ fieldId: f.id, label: f.label, type: f.type, value: show(f) })) });
  }),
);

router.get(
  "/:id/export",
  asyncHandler(async (req, res) => {
    const { form } = await loadManaged(req, req.params.id);
    const subs = await prisma.formSubmission.findMany({
      where: { formId: form.id }, orderBy: { submittedAt: "asc" }, take: 5000,
      include: { answers: true, user: { select: { name: true, loginId: true, role: true } } },
    });
    const fileNames = new Map((await prisma.formFile.findMany({ where: { formId: form.id }, select: { id: true, fileName: true } })).map((x) => [x.id, x.fileName]));
    const cell = (f: { id: string; type: string }, a: Map<string, unknown>) => { const v = a.get(f.id) ?? ""; return f.type === "FILE_UPLOAD" && typeof v === "string" ? fileNames.get(v) ?? "" : v; };
    const header = ["Login ID", "Name", "Role", "Attempt", "Submitted at", ...form.fields.map((f) => f.label)];
    const lines = [header.map(csvCell).join(",")];
    for (const s of subs) {
      const a = new Map(s.answers.map((x) => [x.fieldId, x.value]));
      lines.push([s.user.loginId, s.user.name, s.user.role, s.attempt, s.submittedAt.toISOString(), ...form.fields.map((f) => cell(f, a))].map(csvCell).join(","));
    }
    await audit(req, "FORM_EXPORTED", "Form", form.id, { rows: subs.length });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="form-${form.id}.csv"`);
    res.send(`﻿${lines.join("\r\n")}`);
  }),
);

export default router;
