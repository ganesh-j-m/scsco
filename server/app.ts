import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { config } from "./config.js";
import api from "./routes/index.js";
import { errorMiddleware, forbidden } from "./utils/errors.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1)); // hops between the internet and this server (2 = Vercel proxy + host proxy)
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(compression());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Defence in depth against cross-site request forgery: in production a browser request that
  // changes data must come from our own site. (Skipped in development so phones on the LAN can test.)
  app.use("/api", (req, _res, next) => {
    if (!config.isProd || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (!origin) return next(); // non-browser clients; the httpOnly cookie is still required
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.get("host"); } catch { /* malformed origin */ }
    if (origin === config.clientOrigin || sameHost) return next();
    next(forbidden("Request blocked: unexpected origin"));
  });

  // Signed-in API responses must never be stored by browsers or shared caches.
  // (The public content router overrides this with a short cache.)
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use("/uploads", express.static(path.resolve(config.uploadDir), { maxAge: "7d", immutable: true, dotfiles: "deny", index: false }));
  app.use("/api", api);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint not found" }));
  app.use(errorMiddleware);
  return app;
}
