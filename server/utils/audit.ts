import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function audit(
  req: Request,
  action: string,
  entity?: string,
  entityId?: string,
  metadata?: Prisma.InputJsonValue,
  userIdOverride?: string,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userIdOverride ?? req.user?.id ?? null,
        action,
        entity,
        entityId,
        metadata,
        ip: req.ip,
      },
    });
  } catch (e) {
    // Audit failures must never break the main request
    console.error("audit log failed", (e as Error).message);
  }
}
