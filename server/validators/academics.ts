import { z } from "zod";
import { blankToUndefined } from "../services/scope.js";

const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,15}$/, "Use 2-15 letters, numbers or -");
const status = z.enum(["ACTIVE", "INACTIVE"]);

export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  code,
  description: optionalText(500),
  status: status.default("ACTIVE"),
});
export const departmentUpdateSchema = departmentSchema.partial();

export const courseSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100),
  code,
  departmentId: z.string().min(1, "Select a department"),
  durationYears: z.coerce.number().int().min(1).max(6),
  description: optionalText(500),
  status: status.default("ACTIVE"),
});
export const courseUpdateSchema = courseSchema.partial();

// "" from a form clears the assigned faculty (null); undefined leaves it unchanged.
const nullableId = z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional());

export const subjectSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100),
  code,
  courseId: z.string().min(1, "Select a course"),
  semester: z.coerce.number().int().min(1).max(10),
  credits: z.coerce.number().int().min(1).max(10),
  facultyId: nullableId,
});
export const subjectUpdateSchema = subjectSchema.partial();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const timetableSchema = z.object({
  day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  startTime: time,
  endTime: time,
  departmentId: z.string().min(1, "Select a department"),
  courseId: z.string().min(1, "Select a course"),
  year: z.coerce.number().int().min(1).max(5),
  division: z.string().trim().toUpperCase().min(1, "Enter a division").max(5),
  subjectId: z.string().min(1, "Select a subject"),
  facultyId: z.string().min(1, "Select a faculty member"),
  room: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(30).nullable().optional()),
});
export const timetableUpdateSchema = timetableSchema.partial();
