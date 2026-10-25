import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { config } from "../config.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const unauthorized = (m = "Authentication required") => new HttpError(401, m);
export const forbidden = (m = "You do not have permission to do this") => new HttpError(403, m);
export const notFound = (m = "Record not found") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

/** Wraps async route handlers so rejections reach the error middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const parsed = err as { type?: string; status?: number };
  if (parsed?.type === "entity.parse.failed") return res.status(400).json({ error: "The request body is not valid JSON" });
  if (parsed?.type === "entity.too.large") return res.status(413).json({ error: "The request is too large" });
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: "A record with these values already exists" });
    if (err.code === "P2025") return res.status(404).json({ error: "Record not found" });
    if (err.code === "P2003")
      return res.status(409).json({ error: "This record is linked to other data and cannot be changed or deleted" });
  }
  if (!config.isProd) console.error(err);
  else console.error((err as Error)?.message);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}
