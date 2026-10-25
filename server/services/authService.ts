import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { unauthorized } from "../utils/errors.js";

export const hashPassword = (p: string) => bcrypt.hash(p, 12);

export type SafeUser = Omit<User, "passwordHash">;

export function toSafeUser(u: User): SafeUser {
  const { passwordHash: _ph, ...safe } = u;
  return safe;
}

// Compared against when the login ID does not exist, to keep timing uniform.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export async function verifyLogin(loginId: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { loginId: loginId.toUpperCase() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized("Invalid Login ID or password");
  if (user.status !== "ACTIVE") throw unauthorized("This account is deactivated. Contact the administrator.");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

/** Where the frontend should send each role after login (the backend decides, never the UI). */
export function homeRouteFor(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
    case "PRINCIPAL":
    case "HOD":
      return "/admin/dashboard";
    default:
      return "/portal/dashboard";
  }
}
