# SCSCO College Digital Platform

Vite + React + TypeScript frontend, Express + Prisma backend, Neon PostgreSQL.

## Setup
1. `cp .env.example .env` and fill DATABASE_URL, DIRECT_URL, AUTH_SECRET
2. `npm install`
3. `npx prisma generate && npx prisma db push`
4. `npm run db:seed`  (creates ADMIN001 with SEED_ADMIN_PASSWORD)
5. `npm run dev`  (web: http://localhost:5173, api: http://localhost:4000)

## Status
Phase 1: schema, auth, RBAC, users + CSV import, audit logs.
Phase 2: public website (15 pages), public API, demo seed (`npm run db:seed:demo`).
Phase 3: role-aware dashboard (real DB stats), Students, Faculty, HODs, Parents (HOD scoped to own department), image upload.
Phase 4: Departments, Courses, Subjects (teacher assignment), Timetable with teacher/class/room clash detection.
Phase 5: Attendance (manual + records), Smart QR Attendance (5-minute QR, duplicate block, auto-absent), student scan page, portal attendance.
Phase 6: Admissions review, Fees + payments/receipts, Certificate requests, Examinations (room clash check), Results entry + grades.
Phase 7: Library (issue/return/fines), Placements, Grievances, Notifications + broadcast. Student/parent portal pages for all of these.
Phase 8: Form Builder (11 question types, sections, conditional logic, audience by role/department/course/year/division/users, publish/close, responses + CSV export). Portal form filling.
Phase 9: Website CMS admin (notices, events, gallery, facilities, achievements, homepage, principal, contact, admissions info).
Phase 11b: Assignments + Study material (staff create/grade, students submit, private downloads) and form File-upload question. Needs `npx prisma db push`.
Phase 11: Form analytics, form templates, drag-drop question ordering, form draft autosave, portal Profile (change password) + Exams pages. End-to-end testing against a real Postgres (auth, RBAC, payments race fix, forms, CMS, uploads, CSV), student portal dashboard, multer 2, TRUST_PROXY, DEPLOYMENT.md.
Phase 10: Hardening (CSRF origin check, upload magic-byte check, login/password rate limits, no-store API cache, compression), accessibility (skip link, focus management, modal focus trap, titles), reduced motion, notification bell, error boundary, session-expiry handling, security headers.
