import { z } from "zod";
import { Role } from "@prisma/client";

export const loginSchema = z.object({
  loginId: z.string().trim().min(3, "Login ID is required").max(40),
  password: z.string().min(1, "Password is required").max(128),
});

export const loginIdRule = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,40}$/, "Login ID must be 3-40 letters, numbers, - or _");

export const passwordRule = z.string().min(8, "Password must be at least 8 characters").max(128);

export const createUserSchema = z.object({
  loginId: loginIdRule,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  role: z.nativeEnum(Role),
  password: passwordRule,
});

export const updateUserSchema = createUserSchema
  .omit({ loginId: true, password: true })
  .partial()
  .extend({ password: passwordRule.optional() });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordRule,
});
