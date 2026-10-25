# SCSCO — Production deployment

Layout: **Vercel** serves the React app and proxies `/api` + `/uploads` to the **backend host** (Render / Railway / VPS), which talks to **Neon**.
Because the browser only ever talks to the Vercel domain, the login cookie is same-origin (no CORS, no third-party cookie problems).

## 1. Database (Neon)
1. Create a project + database `scsco`.
2. Copy two URLs: **pooled** (`...-pooler...`) → `DATABASE_URL`; **direct** → `DIRECT_URL`.
3. From your laptop (with `.env` filled): `npx prisma db push` then `npm run db:seed` (creates ADMIN001 super admin).
4. Optional demo data: `npm run db:seed:demo` — skip this on the real college database.

## 2. Backend (Render example — Web Service, Node 20+)
- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start`
- Env vars:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` / `DIRECT_URL` | Neon URLs |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `CLIENT_ORIGIN` | `https://your-site.vercel.app` (exact, no trailing `/`) |
| `TRUST_PROXY` | `2` (Vercel + Render proxy) |
| `SEED_ADMIN_PASSWORD` | strong password (only used by seed) |
| `UPLOAD_DIR` | path of a **persistent disk**, e.g. `/var/data/uploads` (public images) |
| `PRIVATE_UPLOAD_DIR` | persistent path for assignments, study material and form attachments, e.g. `/var/data/private` (**not** served publicly; downloads need login) |

- **Schema changes:** after deploying a version that changes `prisma/schema.prisma` (Phase 11b added 3 tables) run `npx prisma db push` once against Neon.
- **Uploads:** Render/Railway free disks are wiped on redeploy. Attach a persistent disk and point `UPLOAD_DIR` at it, otherwise gallery images disappear. (Later option: move to S3/Cloudinary.)
- Health check path: `/api/health`.

## 3. Frontend (Vercel)
1. Edit `vercel.json`: replace both `YOUR-BACKEND-HOST` with your backend hostname (e.g. `scsco-api.onrender.com`).
2. Import the repo: framework **Vite**, build command `vite build`, output directory `dist`.
3. Deploy, then put the final Vercel URL into the backend's `CLIENT_ORIGIN` and redeploy the backend.

## 4. First-day checklist
- [ ] Login ADMIN001 with the seed password, **change it immediately**.
- [ ] Delete `reset-admin.mjs` if present; never commit `.env`.
- [ ] Create departments → courses → subjects → users (CSV import) → students.
- [ ] Open site on a phone; generate a QR and scan from a real phone (QR uses the site URL, so deployed HTTPS URL works from any network).
- [ ] Refresh on `/admin/users` and `/portal/forms` (SPA fallback must not 404).
- [ ] Neon: enable automatic backups / point-in-time restore.

## 5. Known limits
- Sessions are not revoked on password change (only on deactivation).
- A QR photo shared with a friend who is logged in as themselves can't mark someone else (login required), but a student physically absent could scan a forwarded image — keep the 5-minute window short.
- Free Neon/Render sleep when idle: first request after idle is slow.
