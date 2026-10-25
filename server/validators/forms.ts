import { z } from "zod";
import { FIELD_TYPES, TARGET_TYPES } from "../services/formEngine.js";
import { optStr } from "./ops.js";

const isoDate = z.preprocess((v) => (v === "" ? null : v), z.string().datetime({ offset: true }).nullable().optional());

export const settingsSchema = z.object({
  title: z.string().trim().min(3, "Enter a title (at least 3 characters)").max(150),
  description: optStr(1000),
  instructions: optStr(2000),
  startAt: isoDate,
  endAt: isoDate,
  submissionLimit: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(1).max(100000).optional()),
  allowMultipleSubmissions: z.boolean().default(false),
  allowEditAfterSubmission: z.boolean().default(false),
});

const num = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().finite().optional());

export const structureSchema = z.object({
  sections: z.array(z.object({ key: z.string().min(1).max(60), title: z.string().trim().min(1, "Enter a section title").max(120) })).max(20),
  fields: z
    .array(
      z.object({
        key: z.string().min(1).max(60),
        sectionKey: z.string().max(60).nullable().optional(),
        type: z.enum(FIELD_TYPES),
        label: z.string().trim().min(1, "Every question needs a label").max(200),
        description: optStr(500),
        placeholder: optStr(120),
        helpText: optStr(300),
        defaultValue: optStr(200),
        required: z.boolean().default(false),
        validation: z.object({ min: num, max: num, minLength: num, maxLength: num }).partial().nullable().optional(),
        logic: z.object({ fieldKey: z.string().min(1).max(60), operator: z.enum(["equals", "notEquals"]), value: z.string().max(100) }).nullable().optional(),
        options: z.array(z.object({ label: z.string().trim().min(1, "Option text is required").max(100) })).max(50).default([]),
      }),
    )
    .max(100),
});

export const assignmentsSchema = z.object({
  assignments: z.array(z.object({ targetType: z.enum(TARGET_TYPES), targetId: z.string().trim().max(120).nullable().optional() })).max(200),
});
