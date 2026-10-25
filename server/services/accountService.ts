import { prisma } from "../utils/prisma.js";
import { conflict } from "../utils/errors.js";

/** Friendly duplicate checks before hitting database unique constraints. */
export async function assertUnique(opts: { loginId?: string; email?: string; excludeUserId?: string }) {
  const { loginId, email, excludeUserId } = opts;
  const or = [...(loginId ? [{ loginId }] : []), ...(email ? [{ email }] : [])];
  if (!or.length) return;
  const hit = await prisma.user.findFirst({
    where: { OR: or, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
    select: { loginId: true, email: true },
  });
  if (!hit) return;
  if (loginId && hit.loginId === loginId) throw conflict("This Login ID is already in use");
  throw conflict("This email is already in use");
}
