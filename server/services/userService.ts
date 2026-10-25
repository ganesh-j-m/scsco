import { parse } from "csv-parse/sync";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { createUserSchema } from "../validators/auth.js";
import { hashPassword } from "./authService.js";
import { forbidden } from "../utils/errors.js";

/** Roles an actor may create/modify. Only SUPER_ADMIN can touch SUPER_ADMIN/ADMIN/PRINCIPAL accounts. */
export function assertCanManageRole(actorRole: Role, targetRole: Role) {
  if (actorRole === "SUPER_ADMIN") return;
  const privileged: Role[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
  if (privileged.includes(targetRole)) throw forbidden("Only the Super Admin can manage this role");
}

export function buildUserWhere(q: { search?: string; role?: Role; status?: "ACTIVE" | "INACTIVE" }): Prisma.UserWhereInput {
  return {
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { loginId: { contains: q.search, mode: "insensitive" } },
            { name: { contains: q.search, mode: "insensitive" } },
            { email: { contains: q.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export interface ImportRowResult {
  row: number;
  loginId: string;
  outcome: "created" | "duplicate" | "invalid";
  reason?: string;
}

const MAX_ROWS = 2000;

/**
 * Imports users from CSV text. Expected header: loginId,name,email,role,phone,password
 * Every row is reported — nothing is silently discarded.
 */
export async function importUsersCsv(csv: string, actorRole: Role) {
  const records = parse(csv, { columns: (h: string[]) => h.map((x) => x.trim()), skip_empty_lines: true, trim: true, bom: true }) as Record<
    string,
    string
  >[];
  if (records.length > MAX_ROWS) throw forbidden(`Import is limited to ${MAX_ROWS} rows at a time`);

  const results: ImportRowResult[] = [];
  const seenLogin = new Set<string>();
  const seenEmail = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const raw = records[i]!;
    const rowNo = i + 2; // header is row 1
    const parsed = createUserSchema.safeParse({
      loginId: raw.loginId,
      name: raw.name,
      email: raw.email,
      phone: raw.phone,
      role: (raw.role ?? "").toUpperCase(),
      password: raw.password,
    });
    if (!parsed.success) {
      results.push({
        row: rowNo,
        loginId: raw.loginId ?? "",
        outcome: "invalid",
        reason: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
      });
      continue;
    }
    const d = parsed.data;
    try {
      assertCanManageRole(actorRole, d.role);
    } catch (e) {
      results.push({ row: rowNo, loginId: d.loginId, outcome: "invalid", reason: (e as Error).message });
      continue;
    }
    if (seenLogin.has(d.loginId) || seenEmail.has(d.email)) {
      results.push({ row: rowNo, loginId: d.loginId, outcome: "duplicate", reason: "Duplicate within the file" });
      continue;
    }
    seenLogin.add(d.loginId);
    seenEmail.add(d.email);

    const exists = await prisma.user.findFirst({
      where: { OR: [{ loginId: d.loginId }, { email: d.email }] },
      select: { loginId: true, email: true },
    });
    if (exists) {
      results.push({
        row: rowNo,
        loginId: d.loginId,
        outcome: "duplicate",
        reason: exists.loginId === d.loginId ? "Login ID already exists" : "Email already exists",
      });
      continue;
    }
    await prisma.user.create({
      data: {
        loginId: d.loginId,
        name: d.name,
        email: d.email,
        phone: d.phone,
        role: d.role,
        passwordHash: await hashPassword(d.password),
      },
    });
    results.push({ row: rowNo, loginId: d.loginId, outcome: "created" });
  }

  const count = (o: ImportRowResult["outcome"]) => results.filter((r) => r.outcome === o).length;
  return {
    summary: {
      total: results.length,
      successful: count("created"),
      failed: count("duplicate") + count("invalid"),
      duplicate: count("duplicate"),
      invalid: count("invalid"),
    },
    results,
  };
}
