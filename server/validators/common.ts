import { z } from "zod";

/** Treat "" from HTML forms as "not provided". */
export const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());

export const phoneRule = z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid phone number");

export const accountFields = {
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: optional(phoneRule),
};
