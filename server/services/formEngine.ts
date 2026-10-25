import type { FormTargetType, Prisma, Role } from "@prisma/client";
import { prisma } from "../utils/prisma.js";

export const FIELD_TYPES = ["SHORT_TEXT", "LONG_TEXT", "NUMBER", "EMAIL", "PHONE", "DATE", "DROPDOWN", "RADIO", "CHECKBOXES", "YES_NO", "RATING", "FILE_UPLOAD"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const CHOICE_TYPES: FieldType[] = ["DROPDOWN", "RADIO", "CHECKBOXES"];
export const TARGET_TYPES = ["ALL_STUDENTS", "DEPARTMENT", "COURSE", "YEAR", "DIVISION", "CLASS", "FACULTY", "HOD", "TEACHERS", "PARENTS", "STAFF", "SELECTED_USERS"] as const;

// ───────────────────────── Audience ─────────────────────────
// targetId encodings: COURSE=courseId, YEAR="courseId|year", DIVISION="courseId|DIV", CLASS="courseId|year|DIV"
// ("*" in place of courseId means every course; admins only). FACULTY/TEACHERS: optional departmentId.
// PARENTS: optional courseId (parents with a child in that course). SELECTED_USERS: userId.

export interface Viewer {
  id: string;
  role: Role;
  student: { departmentId: string; courseId: string; year: number; division: string } | null;
  facultyDeptId: string | null;
  parentCourseIds: string[];
}

export async function loadViewer(user: { id: string; role: Role }): Promise<Viewer> {
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      student: { select: { departmentId: true, courseId: true, year: true, division: true, status: true } },
      faculty: { select: { departmentId: true } },
      parent: { select: { children: { select: { courseId: true } } } },
    },
  });
  return {
    id: user.id,
    role: user.role,
    student: u?.student && u.student.status === "ACTIVE" ? u.student : null,
    facultyDeptId: u?.faculty?.departmentId ?? null,
    parentCourseIds: [...new Set(u?.parent?.children.map((c) => c.courseId) ?? [])],
  };
}

/** Assignment rows that include this viewer. Used both to list forms and to authorise a submission. */
export function assignmentConditionsFor(v: Viewer): Prisma.FormAssignmentWhereInput[] {
  const c: Prisma.FormAssignmentWhereInput[] = [{ targetType: "SELECTED_USERS", targetId: v.id }];
  const type = (t: FormTargetType, ids?: string[]): Prisma.FormAssignmentWhereInput => ({ targetType: t, ...(ids ? { targetId: { in: ids } } : {}) });
  const optional = (t: FormTargetType, id: string | null): Prisma.FormAssignmentWhereInput =>
    id ? { targetType: t, OR: [{ targetId: null }, { targetId: id }] } : { targetType: t, targetId: null };

  if (v.role === "STUDENT" && v.student) {
    const s = v.student;
    c.push(
      type("ALL_STUDENTS"),
      type("DEPARTMENT", [s.departmentId]),
      type("COURSE", [s.courseId]),
      type("YEAR", [`${s.courseId}|${s.year}`, `*|${s.year}`]),
      type("DIVISION", [`${s.courseId}|${s.division}`, `*|${s.division}`]),
      type("CLASS", [`${s.courseId}|${s.year}|${s.division}`, `*|${s.year}|${s.division}`]),
    );
  }
  if (v.role === "FACULTY") c.push(optional("FACULTY", v.facultyDeptId), optional("TEACHERS", v.facultyDeptId), type("STAFF"));
  if (v.role === "HOD") c.push(type("HOD"), optional("TEACHERS", v.facultyDeptId), type("STAFF"));
  if (v.role === "ADMIN" || v.role === "PRINCIPAL") c.push(type("STAFF"));
  if (v.role === "PARENT") c.push({ targetType: "PARENTS", OR: [{ targetId: null }, { targetId: { in: v.parentCourseIds } }] });
  return c;
}

/** Users who belong to the audience described by these assignments (active accounts only). */
export function audienceWhere(assignments: { targetType: FormTargetType; targetId: string | null }[]): Prisma.UserWhereInput {
  const or: Prisma.UserWhereInput[] = [];
  for (const a of assignments) {
    const id = a.targetId;
    const [course, p2, p3] = (id ?? "").split("|");
    const courseCond = course && course !== "*" ? { courseId: course } : {};
    switch (a.targetType) {
      case "ALL_STUDENTS": or.push({ role: "STUDENT", student: { status: "ACTIVE" } }); break;
      case "DEPARTMENT": or.push({ role: "STUDENT", student: { departmentId: id ?? undefined, status: "ACTIVE" } }); break;
      case "COURSE": or.push({ role: "STUDENT", student: { courseId: id ?? undefined, status: "ACTIVE" } }); break;
      case "YEAR": or.push({ role: "STUDENT", student: { ...courseCond, year: Number(p2), status: "ACTIVE" } }); break;
      case "DIVISION": or.push({ role: "STUDENT", student: { ...courseCond, division: p2, status: "ACTIVE" } }); break;
      case "CLASS": or.push({ role: "STUDENT", student: { ...courseCond, year: Number(p2), division: p3, status: "ACTIVE" } }); break;
      case "FACULTY": or.push({ role: "FACULTY", ...(id ? { faculty: { departmentId: id } } : {}) }); break;
      case "HOD": or.push({ role: "HOD" }); break;
      case "TEACHERS": or.push({ role: { in: ["FACULTY", "HOD"] }, ...(id ? { faculty: { departmentId: id } } : {}) }); break;
      case "PARENTS": or.push({ role: "PARENT", ...(id ? { parent: { children: { some: { courseId: id } } } } : {}) }); break;
      case "STAFF": or.push({ role: { in: ["FACULTY", "HOD", "ADMIN", "PRINCIPAL"] } }); break;
      case "SELECTED_USERS": if (id) or.push({ id }); break;
    }
  }
  // An empty list must match nobody, not everybody.
  return { status: "ACTIVE", OR: or.length ? or : [{ id: "__none__" }] };
}

// ───────────────────────── Answer validation ─────────────────────────
export interface FieldDef {
  id: string;
  type: string;
  label: string;
  required: boolean;
  validationConfig: unknown;
  conditionalLogic: unknown;
  options: { value: string }[];
}
interface Cfg { min?: number; max?: number; minLength?: number; maxLength?: number }
interface Logic { fieldId: string; operator: "equals" | "notEquals"; value: string }

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

function logicHolds(logic: Logic, answers: Record<string, unknown>) {
  const a = answers[logic.fieldId];
  const eq = Array.isArray(a) ? a.map(String).includes(logic.value) : String(a ?? "") === logic.value;
  return logic.operator === "equals" ? eq : !eq;
}

/** Fields shown to the person, given their answers. A field depending on a hidden field is hidden too. */
export function visibleFieldIds(fields: FieldDef[], answers: Record<string, unknown>): Set<string> {
  const visible = new Set<string>();
  for (const f of fields) {
    const logic = f.conditionalLogic as Logic | null;
    if (!logic || (visible.has(logic.fieldId) && logicHolds(logic, answers))) visible.add(f.id);
  }
  return visible;
}

/** `files` = ids of files this person already uploaded to this form (needed for FILE_UPLOAD questions). */
export function validateAnswers(fields: FieldDef[], raw: Record<string, unknown>, files: Set<string> = new Set()) {
  const visible = visibleFieldIds(fields, raw);
  const clean: Record<string, Prisma.InputJsonValue> = {};
  const errors: Record<string, string> = {};

  for (const f of fields) {
    if (!visible.has(f.id)) continue; // hidden fields are neither required nor stored
    const v = raw[f.id];
    const cfg = (f.validationConfig ?? {}) as Cfg;
    if (isEmpty(v)) {
      if (f.required) errors[f.id] = "This question is required";
      continue;
    }
    const values = new Set(f.options.map((o) => o.value));
    switch (f.type) {
      case "SHORT_TEXT":
      case "LONG_TEXT": {
        const s = typeof v === "string" ? v.trim() : null;
        const cap = Math.min(cfg.maxLength ?? (f.type === "SHORT_TEXT" ? 500 : 5000), f.type === "SHORT_TEXT" ? 500 : 5000);
        if (s === null) errors[f.id] = "Enter text";
        else if (cfg.minLength && s.length < cfg.minLength) errors[f.id] = `Enter at least ${cfg.minLength} characters`;
        else if (s.length > cap) errors[f.id] = `Enter at most ${cap} characters`;
        else clean[f.id] = s;
        break;
      }
      case "NUMBER": {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
        if (!Number.isFinite(n)) errors[f.id] = "Enter a valid number";
        else if (cfg.min !== undefined && n < cfg.min) errors[f.id] = `Enter a number of ${cfg.min} or more`;
        else if (cfg.max !== undefined && n > cfg.max) errors[f.id] = `Enter a number of ${cfg.max} or less`;
        else clean[f.id] = n;
        break;
      }
      case "EMAIL": {
        const s = typeof v === "string" ? v.trim() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 200) errors[f.id] = "Enter a valid email address";
        else clean[f.id] = s;
        break;
      }
      case "PHONE": {
        const s = typeof v === "string" ? v.trim() : "";
        if (!/^[0-9+\-\s]{7,15}$/.test(s)) errors[f.id] = "Enter a valid phone number";
        else clean[f.id] = s;
        break;
      }
      case "DATE": {
        const s = typeof v === "string" ? v : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) errors[f.id] = "Choose a valid date";
        else clean[f.id] = s;
        break;
      }
      case "DROPDOWN":
      case "RADIO":
        if (typeof v !== "string" || !values.has(v)) errors[f.id] = "Choose one of the listed options";
        else clean[f.id] = v;
        break;
      case "CHECKBOXES": {
        const arr = Array.isArray(v) ? v : null;
        if (!arr || arr.some((x) => typeof x !== "string" || !values.has(x))) errors[f.id] = "Choose from the listed options";
        else {
          const uniq = [...new Set(arr as string[])];
          if (cfg.min !== undefined && uniq.length < cfg.min) errors[f.id] = `Choose at least ${cfg.min}`;
          else if (cfg.max !== undefined && uniq.length > cfg.max) errors[f.id] = `Choose at most ${cfg.max}`;
          else clean[f.id] = uniq;
        }
        break;
      }
      case "YES_NO":
        if (v !== "Yes" && v !== "No") errors[f.id] = "Choose Yes or No";
        else clean[f.id] = v;
        break;
      case "RATING": {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 5) errors[f.id] = "Choose a rating from 1 to 5";
        else clean[f.id] = n;
        break;
      }
      case "FILE_UPLOAD":
        if (typeof v !== "string" || !files.has(v)) errors[f.id] = "Upload your file again";
        else clean[f.id] = v;
        break;
      default:
        errors[f.id] = "Unsupported question type";
    }
  }
  return { clean, errors };
}

/** CSV cells starting with = + - @ can run as formulas in Excel; prefix them so they stay text. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
