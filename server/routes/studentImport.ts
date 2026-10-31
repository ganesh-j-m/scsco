import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { hashPassword } from "../services/authService.js";

// Bulk create student logins from an Excel sheet (the browser reads the file and sends the rows as JSON).
// Login ID = prefix + roll number (BCS1, BCS2, BCS10 ...). Existing login IDs / emails are skipped, never overwritten.
const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL"));

const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schema = z.object({
  courseId: z.string().min(1, "Choose a course"),
  year: z.coerce.number().int().min(1).max(5),
  semester: z.coerce.number().int().min(1).max(10),
  division: z.string().trim().min(1, "Enter the division").max(5),
  admissionYear: z.coerce.number().int().min(2000).max(2100),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/, "Prefix can have only letters and numbers"),
  password: z.string().min(5, "Password must have at least 5 characters").max(64),
  dryRun: z.boolean().default(true),
  rows: z
    .array(z.object({
      name: z.string().trim().max(120).default(""),
      email: z.string().trim().max(120).default(""),
      phone: z.string().trim().max(30).default(""),
      roll: z.string().trim().max(12).default(""),
    }))
    .min(1, "The file has no students")
    .max(500, "Upload at most 500 students at a time"),
});

type Status = "NEW" | "EXISTS" | "ERROR";
interface Result { row: number; loginId: string; name: string; email: string; phone: string; status: Status; message?: string }

router.get(
  "/courses",
  asyncHandler(async (_req, res) => {
    const data = await prisma.course.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
    res.json({ data });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = schema.parse(req.body);
    const course = await prisma.course.findUnique({ where: { id: d.courseId }, select: { id: true, departmentId: true } });
    if (!course) throw badRequest("Course not found");

    const results: Result[] = [];
    const seenLogin = new Set<string>();
    const seenEmail = new Set<string>();

    // Existing login IDs and emails in one query each (not one per row).
    const wanted = d.rows.map((r, i) => `${d.prefix}${(r.roll || String(i + 1)).replace(/\s+/g, "")}`.toUpperCase());
    const existing = new Set((await prisma.user.findMany({ where: { loginId: { in: wanted } }, select: { loginId: true } })).map((u) => u.loginId.toUpperCase()));
    const existingStudentIds = new Set((await prisma.student.findMany({ where: { studentId: { in: wanted } }, select: { studentId: true } })).map((s) => s.studentId.toUpperCase()));
    const emails = d.rows.map((r) => r.email.toLowerCase()).filter((e) => emailOk.test(e));
    const takenEmails = new Set((await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email.toLowerCase()));

    const hash = d.dryRun ? "" : await hashPassword(d.password); // same password for all, hashed once

    for (let i = 0; i < d.rows.length; i++) {
      const r = d.rows[i];
      const loginId = wanted[i];
      const base = { row: i + 2, loginId, name: r.name, email: r.email, phone: r.phone };
      const fail = (status: Status, message: string) => results.push({ ...base, status, message });

      if (r.name.length < 2) { fail("ERROR", "Name is missing"); continue; }
      if (!/^[A-Z0-9_-]{2,30}$/.test(loginId)) { fail("ERROR", "Roll number is not valid"); continue; }
      if (seenLogin.has(loginId)) { fail("ERROR", "Same roll number appears twice in the file"); continue; }
      seenLogin.add(loginId);
      if (existing.has(loginId) || existingStudentIds.has(loginId)) { fail("EXISTS", "Login ID already exists, skipped"); continue; }

      const mail = r.email.toLowerCase();
      if (mail && !emailOk.test(mail)) { fail("ERROR", "Email is not valid"); continue; }
      if (mail && (takenEmails.has(mail) || seenEmail.has(mail))) { fail("ERROR", "Email is already used by another account"); continue; }
      if (mail) seenEmail.add(mail);

      if (d.dryRun) { results.push({ ...base, status: "NEW" }); continue; }
      try {
        await prisma.user.create({
          data: {
            loginId, name: r.name, email: mail || `${loginId.toLowerCase()}@import.scsco.invalid`, phone: r.phone.replace(/[^\d+]/g, "") || null,
            role: "STUDENT", passwordHash: hash, status: "ACTIVE",
            student: { create: { studentId: loginId, departmentId: course.departmentId, courseId: course.id, year: d.year, semester: d.semester, division: d.division.toUpperCase(), admissionYear: d.admissionYear, status: "ACTIVE" } },
          },
        });
        results.push({ ...base, status: "NEW" });
      } catch (e) {
        fail("ERROR", (e as { code?: string }).code === "P2002" ? "Login ID or email already exists" : "Could not create this student");
      }
    }

    const created = results.filter((x) => x.status === "NEW").length;
    if (!d.dryRun) await audit(req, "STUDENTS_IMPORTED", "Student", "bulk", { created, total: d.rows.length });
    res.json({ dryRun: d.dryRun, created, skipped: results.length - created, results });
  }),
);

export default router;