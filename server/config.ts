import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  authSecret: required("AUTH_SECRET"),
  cookieName: process.env.AUTH_COOKIE_NAME ?? "scsco_session",
  authTtlHours: Number(process.env.AUTH_TTL_HOURS ?? 12),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  uploadMaxMb: Number(process.env.UPLOAD_MAX_MB ?? 5),
  // Documents (assignments, study material, form attachments). Never served statically.
  privateDir: process.env.PRIVATE_UPLOAD_DIR ?? "./private-uploads",
  privateMaxMb: Number(process.env.PRIVATE_UPLOAD_MAX_MB ?? 10),
};
