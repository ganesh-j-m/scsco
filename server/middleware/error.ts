import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError } from "../utils/errors.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof ZodError)
    return res.status(400).json({ error: "Validation failed", details: err.flatten().fieldErrors });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: "A record with this value already exists" });
    if (err.code === "P2003" || err.code === "P2014")
      return res.status(409).json({ error: "This record is linked to other data and cannot be removed" });
    if (err.code === "P2025") return res.status(404).json({ error: "Record not found" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
