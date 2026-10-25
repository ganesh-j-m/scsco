import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, forbidden, unauthorized } from "../utils/errors.js";

export interface TokenPayload {
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.authSecret, {
    expiresIn: `${config.authTtlHours}h`,
  });
}

export const cookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: (config.isProd ? "none" : "lax") as "none" | "lax",
  maxAge: config.authTtlHours * 3600 * 1000,
  path: "/",
};

/** Verifies the session cookie and loads the user's CURRENT role/status from the database. */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[config.cookieName];
  if (!token) throw unauthorized();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, config.authSecret) as TokenPayload;
  } catch {
    throw unauthorized("Session expired. Please log in again.");
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, loginId: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") throw unauthorized("Account is not active");
  req.user = { id: user.id, loginId: user.loginId, role: user.role };
  next();
});

/** Allows only the listed roles. SUPER_ADMIN always passes. */
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "SUPER_ADMIN" || roles.includes(req.user.role)) return next();
    next(forbidden());
  };
