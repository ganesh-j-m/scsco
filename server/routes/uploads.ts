import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { config } from "../config.js";
import { asyncHandler, badRequest } from "../utils/errors.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import rateLimit from "express-rate-limit";

const router = Router();
router.use(authenticate, authorize("ADMIN", "PRINCIPAL", "HOD", "FACULTY"));
router.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many uploads. Please wait a minute." } }));

// The browser-supplied MIME type can be faked, so the file's first bytes must match an image format too.
function looksLikeImage(file: string, mime: string) {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(12);
  try { fs.readSync(fd, b, 0, 12, 0); } finally { fs.closeSync(fd); }
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

// ───────────── permanent storage on Cloudinary (used when the 3 CLOUDINARY_* variables are set) ─────────────
const cloud = {
  name: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
};
const useCloudinary = Boolean(cloud.name && cloud.key && cloud.secret);

/** Signed upload through Cloudinary's REST API (no extra npm package). Returns the permanent https URL. */
async function uploadToCloudinary(file: string, mime: string, publicId: string): Promise<string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = "scsco";
  // signature = sha1 of the sorted params (not file/api_key) + api secret
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + cloud.secret).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([await fs.promises.readFile(file)], { type: mime }), `${publicId}`);
  form.append("api_key", cloud.key!);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signature);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud.name}/image/upload`, { method: "POST", body: form, signal: ctrl.signal });
    const j = (await r.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
    if (!r.ok || !j.secure_url) {
      console.error("cloudinary upload failed:", r.status, j.error?.message ?? "");
      throw new Error("Image storage failed. Please try again.");
    }
    // f_auto,q_auto = Cloudinary serves the smallest good-looking format for each visitor
    return j.secure_url.replace("/upload/", "/upload/f_auto,q_auto/");
  } finally {
    clearTimeout(timer);
  }
}

const ALLOWED: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const dir = path.resolve(config.uploadDir, "images");
fs.mkdirSync(dir, { recursive: true }); // also used as the temporary folder while Cloudinary uploads

const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    // Random name + extension chosen from the verified MIME type, never from the client filename.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype] ?? ".bin"}`),
  }),
  limits: { fileSize: config.uploadMaxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(new Error("Only JPG, PNG or WebP images are allowed"))),
});

router.post(
  "/image",
  (req, res, next) =>
    upload.single("file")(req, res, (err) => {
      if (err) return next(badRequest(err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? `Image must be under ${config.uploadMaxMb} MB` : err.message));
      next();
    }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("Attach an image in the 'file' field");
    if (!looksLikeImage(req.file.path, req.file.mimetype)) {
      fs.unlink(req.file.path, () => undefined);
      throw badRequest("This file is not a valid JPG, PNG or WebP image");
    }
    if (useCloudinary) {
      const id = path.parse(req.file.filename).name;
      try {
        const url = await uploadToCloudinary(req.file.path, req.file.mimetype, id);
        await audit(req, "IMAGE_UPLOADED", "Upload", id);
        res.status(201).json({ url });
      } catch (e) {
        throw badRequest((e as Error).message);
      } finally {
        fs.unlink(req.file.path, () => undefined); // the permanent copy lives on Cloudinary
      }
      return;
    }
    // fallback (no Cloudinary variables): local disk, lost when Render redeploys
    await audit(req, "IMAGE_UPLOADED", "Upload", req.file.filename);
    res.status(201).json({ url: `/uploads/images/${req.file.filename}` });
  }),
);

export default router;