import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, forbidden, HttpError, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { staffScope, assertCanManageSubject } from "../services/attendanceService.js";
import { familyStudentId } from "../services/family.js";
import { notifyUsers } from "../services/notify.js";
import { acceptFile, receiveFile, removeFile, sendFile } from "../services/privateFiles.js";

const router = Router();
router.use(authenticate);

const kind = z.enum(["ASSIGNMENT", "MATERIAL"]);
const staff = authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY");
const blank = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const bodySchema = z.object({
  kind,
  title: z.string().trim().min(3, "Enter a title (at least 3 characters)").max(150),
  description: z.preprocess(blank, z.string().trim().max(3000).optional()),
  subjectId: z.string().min(1, "Choose a subject"),
  year: z.coerce.number().int().min(1).max(6),
  division: z.preprocess(blank, z.string().trim().toUpperCase().max(5).optional()),
  dueDate: z.preprocess(blank, z.string().datetime({ offset: true }).optional()),
  maxMarks: z.preprocess(blank, z.coerce.number().int().min(1).max(1000).optional()),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  removeFile: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
});

const subjectInclude = { subject: { select: { id: true, name: true, code: true, courseId: true, facultyId: true, course: { select: { id: true, name: true, departmentId: true, durationYears: true } } } } } as const;

async function loadManaged(req: Parameters<typeof staffScope>[0], id: string) {
  const scope = await staffScope(req);
  const w = await prisma.courseWork.findUnique({ where: { id }, include: subjectInclude });
  if (!w) throw notFound("Item not found");
  try { assertCanManageSubject(scope, { facultyId: w.subject.facultyId, departmentId: w.subject.course.departmentId }); } catch { throw notFound("Item not found"); }
  return { w, scope };
}

// ═════════════ Staff ═════════════
router.get(
  "/options",
  staff,
  asyncHandler(async (req, res) => {
    const scope = await staffScope(req);
    const subjects = await prisma.subject.findMany({
      where: { ...(scope.facultyId ? { facultyId: scope.facultyId } : {}), course: { status: "ACTIVE", ...(scope.departmentId ? { departmentId: scope.departmentId } : {}) } },
      orderBy: { name: "asc" }, take: 500,
      select: { id: true, name: true, code: true, course: { select: { name: true, durationYears: true } } },
    });
    res.json({ subjects });
  }),
);

router.get(
  "/",
  staff,
  asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ kind: kind.optional(), subjectId: z.string().optional() }).parse(req.query);
    const scope = await staffScope(req);
    const where: Prisma.CourseWorkWhereInput = {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.search ? { title: { contains: q.search, mode: "insensitive" } } : {}),
      subject: { ...(scope.facultyId ? { facultyId: scope.facultyId } : {}), ...(scope.departmentId ? { course: { departmentId: scope.departmentId } } : {}) },
    };
    const [total, rows] = await Promise.all([
      prisma.courseWork.count({ where }),
      prisma.courseWork.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q.page, q.pageSize), include: { ...subjectInclude, _count: { select: { submissions: true } } } }),
    ]);
    res.json({ data: rows.map(({ fileKey: _k, ...r }) => ({ ...r, hasFile: !!_k })), meta: pageMeta(total, q.page, q.pageSize) });
  }),
);

async function notifyClass(w: { id: string; kind: string; title: string; year: number; division: string | null; subject: { courseId: string; name: string } }) {
  const students = await prisma.student.findMany({ where: { status: "ACTIVE", courseId: w.subject.courseId, year: w.year, ...(w.division ? { division: w.division } : {}) }, select: { userId: true } });
  await notifyUsers(students.map((s) => s.userId), { type: "ACADEMIC", title: `${w.kind === "ASSIGNMENT" ? "New assignment" : "New study material"}: ${w.title}`, body: w.subject.name, link: w.kind === "ASSIGNMENT" ? "/portal/assignments" : "/portal/study-material" });
}

async function checkSubject(req: Parameters<typeof staffScope>[0], subjectId: string, year: number) {
  const scope = await staffScope(req);
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, include: { course: { select: { departmentId: true, durationYears: true } } } });
  if (!subject) throw badRequest("Selected subject does not exist");
  assertCanManageSubject(scope, { facultyId: subject.facultyId, departmentId: subject.course.departmentId });
  if (year > subject.course.durationYears) throw badRequest(`This course has only ${subject.course.durationYears} year(s)`);
}

router.post(
  "/",
  staff,
  receiveFile,
  asyncHandler(async (req, res) => {
    let file;
    try {
      const d = bodySchema.parse(req.body);
      await checkSubject(req, d.subjectId, d.year);
      file = acceptFile(req);
      if (d.kind === "MATERIAL" && !file) throw badRequest("Attach the study material file");
      if (d.kind === "MATERIAL" && (d.dueDate || d.maxMarks)) throw badRequest("Study material has no due date or marks");
      const w = await prisma.courseWork.create({
        data: { kind: d.kind, title: d.title, description: d.description ?? null, subjectId: d.subjectId, year: d.year, division: d.division ?? null, dueDate: d.dueDate ? new Date(d.dueDate) : null, maxMarks: d.maxMarks ?? null, status: d.status, createdById: req.user!.id, ...(file ? { fileKey: file.key, fileName: file.name, fileMime: file.mime, fileSize: file.size } : {}) },
        include: { subject: { select: { name: true, courseId: true } } },
      });
      await audit(req, "COURSEWORK_CREATED", "CourseWork", w.id, { kind: w.kind });
      if (w.status === "PUBLISHED") await notifyClass(w);
      res.status(201).json({ id: w.id });
    } catch (e) { if (req.file && !file) removeFile(req.file.filename); else if (file) removeFile(file.key); throw e; }
  }),
);

router.patch(
  "/:id",
  staff,
  receiveFile,
  asyncHandler(async (req, res) => {
    let file;
    try {
      const { w } = await loadManaged(req, req.params.id);
      const d = bodySchema.parse(req.body);
      if (d.kind !== w.kind) throw badRequest("The type of an item cannot be changed");
      await checkSubject(req, d.subjectId, d.year);
      file = acceptFile(req);
      if (d.kind === "MATERIAL" && (d.dueDate || d.maxMarks)) throw badRequest("Study material has no due date or marks");
      if (d.kind === "MATERIAL" && d.removeFile && !file) throw badRequest("Study material needs a file");
      const replace = !!file || d.removeFile;
      await prisma.courseWork.update({
        where: { id: w.id },
        data: { title: d.title, description: d.description ?? null, subjectId: d.subjectId, year: d.year, division: d.division ?? null, dueDate: d.dueDate ? new Date(d.dueDate) : null, maxMarks: d.maxMarks ?? null, status: d.status, ...(replace ? { fileKey: file?.key ?? null, fileName: file?.name ?? null, fileMime: file?.mime ?? null, fileSize: file?.size ?? null } : {}) },
      });
      if (replace) removeFile(w.fileKey);
      await audit(req, "COURSEWORK_UPDATED", "CourseWork", w.id);
      if (w.status !== "PUBLISHED" && d.status === "PUBLISHED") await notifyClass({ ...w, ...d, division: d.division ?? null, subject: { courseId: w.subject.courseId, name: w.subject.name } });
      res.json({ ok: true });
    } catch (e) { if (req.file && !file) removeFile(req.file.filename); else if (file) removeFile(file.key); throw e; }
  }),
);

router.delete(
  "/:id",
  staff,
  asyncHandler(async (req, res) => {
    const { w } = await loadManaged(req, req.params.id);
    const subs = await prisma.courseWorkSubmission.findMany({ where: { courseWorkId: w.id }, select: { fileKey: true } });
    await prisma.courseWork.delete({ where: { id: w.id } });
    removeFile(w.fileKey);
    subs.forEach((s) => removeFile(s.fileKey));
    await audit(req, "COURSEWORK_DELETED", "CourseWork", w.id);
    res.json({ ok: true });
  }),
);

router.get(
  "/:id/submissions",
  staff,
  asyncHandler(async (req, res) => {
    const { w } = await loadManaged(req, req.params.id);
    const [students, subs] = await Promise.all([
      prisma.student.findMany({ where: { status: "ACTIVE", courseId: w.subject.courseId, year: w.year, ...(w.division ? { division: w.division } : {}) }, orderBy: [{ division: "asc" }, { studentId: "asc" }], take: 1000, select: { id: true, studentId: true, division: true, user: { select: { name: true } } } }),
      prisma.courseWorkSubmission.findMany({ where: { courseWorkId: w.id }, select: { id: true, studentId: true, note: true, fileName: true, fileSize: true, marks: true, feedback: true, submittedAt: true } }),
    ]);
    const by = new Map(subs.map((s) => [s.studentId, s]));
    res.json({
      item: { id: w.id, title: w.title, dueDate: w.dueDate, maxMarks: w.maxMarks },
      rows: students.map((s) => { const sub = by.get(s.id); return { student: { id: s.id, studentId: s.studentId, division: s.division, name: s.user.name }, submission: sub ? { ...sub, late: !!w.dueDate && sub.submittedAt > w.dueDate } : null }; }),
      submitted: subs.length, total: students.length,
    });
  }),
);

router.patch(
  "/:id/submissions/:sid",
  staff,
  asyncHandler(async (req, res) => {
    const { w } = await loadManaged(req, req.params.id);
    const d = z.object({ marks: z.preprocess(blank, z.coerce.number().int().min(0).optional()), feedback: z.preprocess(blank, z.string().trim().max(1000).optional()) }).parse(req.body);
    if (d.marks !== undefined && w.maxMarks !== null && d.marks > w.maxMarks) throw badRequest(`Marks cannot be more than ${w.maxMarks}`);
    const sub = await prisma.courseWorkSubmission.findFirst({ where: { id: req.params.sid, courseWorkId: w.id }, include: { student: { select: { userId: true } } } });
    if (!sub) throw notFound("Submission not found");
    await prisma.courseWorkSubmission.update({ where: { id: sub.id }, data: { marks: d.marks ?? null, feedback: d.feedback ?? null } });
    await audit(req, "COURSEWORK_GRADED", "CourseWork", w.id, { submissionId: sub.id });
    await notifyUsers([sub.student.userId], { type: "ACADEMIC", title: `Assignment checked: ${w.title}`, link: "/portal/assignments" });
    res.json({ ok: true });
  }),
);

// ═════════════ Student / parent ═════════════
router.get(
  "/portal",
  authorize("STUDENT", "PARENT"),
  asyncHandler(async (req, res) => {
    const q = z.object({ kind, studentId: z.string().optional() }).parse(req.query);
    const sid = await familyStudentId(req, q.studentId);
    const st = await prisma.student.findUnique({ where: { id: sid }, select: { courseId: true, year: true, division: true } });
    if (!st) throw notFound("Student not found");
    const rows = await prisma.courseWork.findMany({
      where: { kind: q.kind, status: "PUBLISHED", year: st.year, subject: { courseId: st.courseId }, OR: [{ division: null }, { division: st.division }] },
      orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, kind: true, title: true, description: true, dueDate: true, maxMarks: true, fileName: true, fileSize: true, fileKey: true, createdAt: true, subject: { select: { name: true, code: true } }, submissions: { where: { studentId: sid }, select: { id: true, fileName: true, note: true, marks: true, feedback: true, submittedAt: true } } },
    });
    res.json({ data: rows.map(({ fileKey, submissions, ...r }) => ({ ...r, hasFile: !!fileKey, submission: submissions[0] ? { ...submissions[0], late: !!r.dueDate && submissions[0].submittedAt > r.dueDate } : null })) });
  }),
);

async function assertVisibleToStudent(id: string, studentDbId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentDbId }, select: { courseId: true, year: true, division: true, status: true } });
  const w = await prisma.courseWork.findFirst({ where: { id, status: "PUBLISHED" }, include: { subject: { select: { courseId: true } } } });
  if (!st || !w || w.subject.courseId !== st.courseId || w.year !== st.year || (w.division && w.division !== st.division)) throw notFound("Item not found");
  return { st, w };
}

router.post(
  "/portal/:id/submit",
  authorize("STUDENT"),
  receiveFile,
  asyncHandler(async (req, res) => {
    let file;
    try {
      const sid = await familyStudentId(req);
      const { st, w } = await assertVisibleToStudent(req.params.id, sid);
      if (st.status !== "ACTIVE") throw forbidden("Your student record is not active");
      if (w.kind !== "ASSIGNMENT") throw badRequest("This item does not accept submissions");
      const note = z.preprocess(blank, z.string().trim().max(1000).optional()).parse(req.body?.note);
      file = acceptFile(req);
      if (!file) throw badRequest("Attach your file");
      const prev = await prisma.courseWorkSubmission.findUnique({ where: { courseWorkId_studentId: { courseWorkId: w.id, studentId: sid } } });
      if (prev && (prev.marks !== null || prev.feedback)) throw new HttpError(409, "This submission has already been checked and can no longer be changed");
      const data = { note: note ?? null, fileKey: file.key, fileName: file.name, fileMime: file.mime, fileSize: file.size, submittedAt: new Date() };
      await prisma.courseWorkSubmission.upsert({ where: { courseWorkId_studentId: { courseWorkId: w.id, studentId: sid } }, create: { courseWorkId: w.id, studentId: sid, ...data }, update: data });
      if (prev) removeFile(prev.fileKey);
      await audit(req, prev ? "ASSIGNMENT_RESUBMITTED" : "ASSIGNMENT_SUBMITTED", "CourseWork", w.id);
      res.status(prev ? 200 : 201).json({ ok: true, late: !!w.dueDate && new Date() > w.dueDate });
    } catch (e) { if (file) removeFile(file.key); else if (req.file) removeFile(req.file.filename); throw e; }
  }),
);

// ═════════════ Downloads (always access-checked) ═════════════
router.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    if (role === "STUDENT" || role === "PARENT") {
      const sid = await familyStudentId(req, z.string().optional().parse(req.query.studentId));
      const { w } = await assertVisibleToStudent(req.params.id, sid);
      return sendFile(res, w);
    }
    if (!["ADMIN", "PRINCIPAL", "HOD", "FACULTY"].includes(role) && role !== "SUPER_ADMIN") throw forbidden();
    const { w } = await loadManaged(req, req.params.id);
    sendFile(res, w);
  }),
);

router.get(
  "/:id/submissions/:sid/file",
  asyncHandler(async (req, res) => {
    const sub = await prisma.courseWorkSubmission.findFirst({ where: { id: req.params.sid, courseWorkId: req.params.id }, include: { student: { select: { userId: true, parentId: true } } } });
    if (!sub) throw notFound("Submission not found");
    const role = req.user!.role;
    if (role === "STUDENT") { if (sub.student.userId !== req.user!.id) throw notFound("Submission not found"); }
    else if (role === "PARENT") {
      const me = await prisma.parent.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!me || me.id !== sub.student.parentId) throw notFound("Submission not found");
    } else if (["ADMIN", "PRINCIPAL", "HOD", "FACULTY", "SUPER_ADMIN"].includes(role)) await loadManaged(req, req.params.id);
    else throw forbidden();
    sendFile(res, sub);
  }),
);

export default router;
