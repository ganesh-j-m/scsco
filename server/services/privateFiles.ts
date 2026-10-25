import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import type { Request, RequestHandler, Response } from "express";
import { config } from "../config.js";
import { badRequest, notFound } from "../utils/errors.js";

// Document types accepted for assignments, study material and form attachments.
// The extension picks the family; the file's first bytes must then match it, so a renamed .exe is refused.
type Family = "pdf" | "zipdoc" | "ole" | "png" | "jpg";
const EXT: Record<string, { family: Family; mime: string }> = {
  ".pdf": { family: "pdf", mime: "application/pdf" },
  ".docx": { family: "zipdoc", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ".pptx": { family: "zipdoc", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  ".xlsx": { family: "zipdoc", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ".doc": { family: "ole", mime: "application/msword" },
  ".ppt": { family: "ole", mime: "application/vnd.ms-powerpoint" },
  ".xls": { family: "ole", mime: "application/vnd.ms-excel" },
  ".png": { family: "png", mime: "image/png" },
  ".jpg": { family: "jpg", mime: "image/jpeg" },
  ".jpeg": { family: "jpg", mime: "image/jpeg" },
};
export const ALLOWED_LABEL = "PDF, Word, PowerPoint, Excel, PNG or JPG";

const root = path.resolve(config.privateDir);
fs.mkdirSync(root, { recursive: true });

function headMatches(file: string, family: Family) {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(8);
  try { fs.readSync(fd, b, 0, 8, 0); } finally { fs.closeSync(fd); }
  switch (family) {
    case "pdf": return b.subarray(0, 4).toString("latin1") === "%PDF";
    case "zipdoc": return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
    case "ole": return b.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    case "png": return b.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "jpg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }
}

export interface StoredFile { key: string; name: string; mime: string; size: number }

const uploader = multer({
  storage: multer.diskStorage({
    destination: root,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: config.privateMaxMb * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => (EXT[path.extname(file.originalname).toLowerCase()] ? cb(null, true) : cb(new Error(`Only ${ALLOWED_LABEL} files are allowed`))),
});

/** Multer for one optional "file" field; turns upload errors into friendly 400s. */
export const receiveFile: RequestHandler = (req, res, next) =>
  uploader.single("file")(req, res, (err) => {
    if (err) return next(badRequest(err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? `File must be under ${config.privateMaxMb} MB` : err.message));
    next();
  });

/** Verifies the uploaded file and returns its stored description. Deletes it and throws if it is not what it claims to be. */
export function acceptFile(req: Request): StoredFile | null {
  const f = req.file;
  if (!f) return null;
  const meta = EXT[path.extname(f.originalname).toLowerCase()];
  if (!meta || !headMatches(f.path, meta.family)) {
    fs.unlink(f.path, () => undefined);
    throw badRequest(`This file is not a valid ${ALLOWED_LABEL} file`);
  }
  // Display name: keep it readable but strip anything path-like or control characters.
  const name = path.basename(f.originalname.replace(/[\u0000-\u001f"\\/]/g, "_")).slice(0, 120) || "file";
  return { key: f.filename, name, mime: meta.mime, size: f.size };
}

export function removeFile(key: string | null | undefined) {
  if (!key || key !== path.basename(key)) return;
  fs.unlink(path.join(root, key), () => undefined);
}

/** Sends a stored file as a download (never rendered inline, never sniffed). */
export function sendFile(res: Response, f: { fileKey: string | null; fileName: string | null; fileMime: string | null }) {
  if (!f.fileKey || f.fileKey !== path.basename(f.fileKey)) throw notFound("File not found");
  const full = path.join(root, f.fileKey);
  if (!fs.existsSync(full)) throw notFound("The file is no longer available");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.type(f.fileMime ?? "application/octet-stream");
  res.download(full, f.fileName ?? "file");
}
