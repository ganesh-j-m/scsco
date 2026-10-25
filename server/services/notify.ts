import type { NotificationType } from "@prisma/client";
import { prisma } from "../utils/prisma.js";

/** Creates in-app notifications. Never throws: a failed notification must not break the main action. */
export async function notifyUsers(userIds: string[], n: { type?: NotificationType; title: string; body?: string; link?: string }) {
  if (!userIds.length) return;
  try {
    await prisma.notification.createMany({
      data: [...new Set(userIds)].map((userId) => ({ userId, type: n.type ?? "SYSTEM", title: n.title, body: n.body, link: n.link })),
    });
  } catch (e) {
    console.error("notification failed", (e as Error).message);
  }
}
