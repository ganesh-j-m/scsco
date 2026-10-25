import { z } from "zod";
import { blankToUndefined } from "../services/scope.js";
import { loginIdRule, passwordRule } from "./auth.js";

/** Optional string/number field that treats "" from an HTML form as "not provided". */
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess(blankToUndefined, s.optional());

const phone = z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid phone number");
const imageUrl = z
  .string()
  .trim()
  .max(300)
  .refine((u) => u.startsWith("/uploads/") || /^https:\/\//.test(u), "Invalid image URL");

export const studentBase = z.object({
  studentId: loginIdRule,
  prn: optional(z.string().trim().max(30)),
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: optional(phone),
  dateOfBirth: optional(z.coerce.date()),
  gender: optional(z.enum(["Male", "Female", "Other"])),
  departmentId: z.string().min(1, "Select a department"),
  courseId: z.string().min(1, "Select a course"),
  year: z.coerce.number().int().min(1).max(5),
  semester: z.coerce.number().int().min(1).max(10),
  division: z.string().trim().toUpperCase().min(1, "Enter a division").max(5),
  admissionYear: z.coerce.number().int().min(2000).max(2100),
  address: optional(z.string().trim().max(300)),
  parentId: optional(z.string()),
  photoUrl: optional(imageUrl),
});
export const createStudentSchema = studentBase.extend({ password: passwordRule });
export const updateStudentSchema = studentBase.omit({ studentId: true }).partial();

export const facultyBase = z.object({
  employeeId: loginIdRule,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: optional(phone),
  departmentId: z.string().min(1, "Select a department"),
  designation: optional(z.string().trim().max(80)),
  qualification: optional(z.string().trim().max(120)),
  photoUrl: optional(imageUrl),
});
export const createFacultySchema = facultyBase.extend({ password: passwordRule });
export const updateFacultySchema = facultyBase.omit({ employeeId: true }).partial();

export const parentBase = z.object({
  loginId: loginIdRule,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: optional(phone),
  occupation: optional(z.string().trim().max(80)),
  address: optional(z.string().trim().max(300)),
});
export const createParentSchema = parentBase.extend({ password: passwordRule });
export const updateParentSchema = parentBase.omit({ loginId: true }).partial();
