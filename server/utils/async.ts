import type { NextFunction, Request, RequestHandler, Response } from "express";
export const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
