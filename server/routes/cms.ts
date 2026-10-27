import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, forbidden, notFound } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { pageArgs, pageMeta, paginationQuery } from "../utils/pagination.js";
import { dateStr, optDate, optStr, toDate } from "../validators/ops.js";

const router = Router();
router.use(authenticate);

const status = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
// Only our own uploads or http(s) links; blocks javascript: and data: URLs.
const urlOk = (v: string) => v.startsWith("/uploads/") || /^https?:\/\/\S+$/i.test(v);
const optUrl = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(500).refine(urlOk, "Enter a valid link or upload an image").optional());
const reqUrl = z.string().trim().min(1, "Add an image").max(500).refine(urlOk, "Enter a valid link or upload an image");

// ═════════════ Generic publishable content (notices, events, gallery, facilities, achievements) ═════════════
interface Delegate {
  count(a: { where: object }): Promise<number>;
  findMany(a: object): Promise<unknown[]>;
  findUnique(a: { where: { id: string } }): Promise<Record<string, unknown> | null>;
  create(a: { data: object }): Promise<{ id: string }>;
  update(a: { where: { id: string }; data: object }): Promise<unknown>;
  delete(a: { where: { id: string } }): Promise<unknown>;
}

function content<S extends z.ZodTypeAny>(cfg: {
  path: string; entity: string; roles: Role[]; delegate: unknown; schema: S; search: string[]; orderBy: object;
  toData: (d: z.infer<S>, existing: Record<string, unknown> | null) => object;
}) {
  const db = cfg.delegate as Delegate;
  const guard: RequestHandler = authorize(...cfg.roles);
  const r = Router();
  r.use(guard);

  r.get("/", asyncHandler(async (req, res) => {
    const q = paginationQuery.extend({ status: status.optional() }).parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: cfg.search.map((f) => ({ [f]: { contains: q.search, mode: "insensitive" } })) } : {}),
    };
    const [total, data] = await Promise.all([db.count({ where }), db.findMany({ where, orderBy: cfg.orderBy, ...pageArgs(q.page, q.pageSize) })]);
    res.json({ data, meta: pageMeta(total, q.page, q.pageSize) });
  }));

  r.post("/", asyncHandler(async (req, res) => {
    const d = cfg.schema.parse(req.body);
    const row = await db.create({ data: cfg.toData(d, null) });
    await audit(req, `${cfg.entity.toUpperCase()}_CREATED`, cfg.entity, row.id);
    res.status(201).json({ id: row.id });
  }));

  r.patch("/:id", asyncHandler(async (req, res) => {
    const cur = await db.findUnique({ where: { id: req.params.id } });
    if (!cur) throw notFound(`${cfg.entity} not found`);
    const d = cfg.schema.parse(req.body);
    await db.update({ where: { id: req.params.id }, data: cfg.toData(d, cur) });
    await audit(req, `${cfg.entity.toUpperCase()}_UPDATED`, cfg.entity, req.params.id);
    res.json({ ok: true });
  }));

  r.delete("/:id", asyncHandler(async (req, res) => {
    const cur = await db.findUnique({ where: { id: req.params.id } });
    if (!cur) throw notFound(`${cfg.entity} not found`);
    await db.delete({ where: { id: req.params.id } });
    await audit(req, `${cfg.entity.toUpperCase()}_DELETED`, cfg.entity, req.params.id);
    res.json({ ok: true });
  }));

  router.use(cfg.path, r);
}

const A: Role[] = ["ADMIN"];
const AP: Role[] = ["ADMIN", "PRINCIPAL"];

content({
  path: "/notices", entity: "Notice", roles: AP, delegate: prisma.notice, search: ["title", "body"], orderBy: { createdAt: "desc" },
  schema: z.object({ title: z.string().trim().min(3, "Enter a title").max(200), body: z.string().trim().min(3, "Enter the notice text").max(10000), attachmentUrl: optUrl, status }),
  toData: (d, cur) => ({
    title: d.title, body: d.body, attachmentUrl: d.attachmentUrl ?? null, status: d.status,
    // The publish date is set the first time a notice goes live and then kept.
    publishedAt: d.status === "PUBLISHED" ? (cur?.publishedAt ?? new Date()) : (cur?.publishedAt ?? null),
  }),
});

content({
  path: "/events", entity: "Event", roles: AP, delegate: prisma.event, search: ["title", "venue"], orderBy: { date: "desc" },
  schema: z.object({ title: z.string().trim().min(3, "Enter a title").max(200), description: optStr(3000), venue: optStr(200), imageUrl: optUrl, date: dateStr, status }),
  toData: (d) => ({ title: d.title, description: d.description ?? null, venue: d.venue ?? null, imageUrl: d.imageUrl ?? null, date: toDate(d.date), status: d.status }),
});

content({
  path: "/gallery", entity: "GalleryItem", roles: A, delegate: prisma.galleryItem, search: ["title", "category"], orderBy: { createdAt: "desc" },
  schema: z.object({ title: z.string().trim().min(2, "Enter a title").max(150), imageUrl: reqUrl, category: optStr(60), status }),
  toData: (d) => ({ title: d.title, imageUrl: d.imageUrl, category: d.category ?? null, status: d.status }),
});

content({
  path: "/facilities", entity: "Facility", roles: A, delegate: prisma.facility, search: ["name", "description"], orderBy: { createdAt: "desc" },
  schema: z.object({ name: z.string().trim().min(2, "Enter a name").max(150), description: optStr(2000), imageUrl: optUrl, status }),
  toData: (d) => ({ name: d.name, description: d.description ?? null, imageUrl: d.imageUrl ?? null, status: d.status }),
});

content({
  path: "/achievements", entity: "Achievement", roles: A, delegate: prisma.achievement, search: ["title", "description"], orderBy: { createdAt: "desc" },
  schema: z.object({ title: z.string().trim().min(3, "Enter a title").max(200), description: optStr(2000), imageUrl: optUrl, date: optDate, status }),
  toData: (d) => ({ title: d.title, description: d.description ?? null, imageUrl: d.imageUrl ?? null, date: d.date ? toDate(d.date) : null, status: d.status }),
});

// Images used by these pages are uploaded through /api/uploads/image (staff only).

// ═════════════ Site content blocks (homepage, about, principal, contact, admissions, campus) ═════════════
const text = (max: number) => z.string().trim().max(max).default("");
const list = (max: number, n: number) => z.array(z.string().trim().max(max)).max(n).default([]).transform((a) => a.filter(Boolean));
const imgOrBlank = z.string().trim().max(500).default("").refine((v) => v === "" || urlOk(v), "Enter a valid link or upload an image");

const blocks: Record<string, { roles: Role[]; schema: z.ZodTypeAny }> = {
  "site.hero": { roles: A, schema: z.object({ title: text(150), subtitle: text(250), imageUrl: imgOrBlank, ctaLabel: text(40) }) },
  "site.about": { roles: A, schema: z.object({ summary: text(3000), mission: text(1500), vision: text(1500), imageUrl: imgOrBlank, highlights: list(200, 10) }) },
  "site.president": { roles: AP, schema: z.object({ name: text(120), designation: text(120), photoUrl: imgOrBlank, message: text(6000) }) },
  "site.principal": { roles: AP, schema: z.object({ name: text(120), designation: text(120), photoUrl: imgOrBlank, message: text(6000) }) },
  "site.contact": { roles: A, schema: z.object({ address: text(300), phone: text(40), email: z.string().trim().max(120).default("").refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"), hours: text(120), mapUrl: z.string().trim().max(500).default("").refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a valid https link") }) },
  "site.admissions": { roles: A, schema: z.object({ intro: text(2000), steps: list(300, 15), documents: list(200, 20) }) },
  "site.campus": { roles: A, schema: z.object({ intro: text(2000), activities: z.array(z.object({ title: z.string().trim().min(1).max(120), imageUrl: imgOrBlank })).max(20).default([]) }) },
};

router.get(
  "/site",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.siteContent.findMany();
    res.json({ content: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  }),
);

router.put(
  "/site/:key",
  authorize("ADMIN", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const block = blocks[req.params.key];
    if (!block) throw notFound("Unknown content block");
    if (req.user!.role !== "SUPER_ADMIN" && !block.roles.includes(req.user!.role)) throw forbidden();
    const value = block.schema.parse(req.body) as Prisma.InputJsonValue;
    await prisma.siteContent.upsert({ where: { key: req.params.key }, update: { value }, create: { key: req.params.key, value } });
    await audit(req, "SITE_CONTENT_UPDATED", "SiteContent", req.params.key);
    res.json({ ok: true });
  }),
);

export default router;
