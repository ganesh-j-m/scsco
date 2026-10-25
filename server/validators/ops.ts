import { z } from "zod";
import { blankToUndefined } from "../services/scope.js";

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const optStr = (max = 500) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
export const optDate = z.preprocess(blankToUndefined, dateStr.optional());
export const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const rupees = z.coerce.number().positive("Enter an amount greater than 0").max(10_000_000);

export const CERTIFICATE_TYPES = ["Bonafide Certificate", "Character Certificate", "Transfer Certificate", "No Dues Certificate", "Marksheet Copy", "Fee Receipt Copy"] as const;
export const GRIEVANCE_CATEGORIES = ["Academic", "Examination", "Fees", "Library", "Hostel / Facilities", "Harassment", "Other"] as const;

export function gradeFor(marks: number, max: number) {
  const pct = (marks / max) * 100;
  const grade = pct >= 90 ? "O" : pct >= 80 ? "A+" : pct >= 70 ? "A" : pct >= 60 ? "B+" : pct >= 50 ? "B" : pct >= 40 ? "C" : "F";
  return { grade, passed: pct >= 40 };
}
export function academicYearOf(d: Date) {
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 5 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}
