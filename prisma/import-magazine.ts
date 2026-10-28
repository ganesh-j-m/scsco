/**
 * One-time, ADDITIVE import of the 2026-27 college magazine data.
 *
 *   npx tsx prisma/import-magazine.ts            -> DRY RUN (writes nothing, prints a report)
 *   npx tsx prisma/import-magazine.ts --apply    -> actually writes
 *
 * Safety rules:
 *  - never updates or deletes an existing row; only creates what is missing
 *  - re-running is harmless (everything already there is skipped)
 *  - SiteContent blocks are filled only if absent or still untouched since creation
 *  - field names are checked against your real Prisma schema at runtime; anything that
 *    does not fit is reported instead of guessed
 *  - faculty phone numbers are never imported
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { departments, courses, faculty, facilities, achievements, president, principal } from "./magazine-data.js";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const dm = Prisma.dmmf.datamodel;
const models = Object.fromEntries(dm.models.map((m) => [m.name, m]));
const enums = Object.fromEntries(dm.enums.map((e) => [e.name, e.values.map((v) => v.name)]));
const lc = (s: string) => s[0].toLowerCase() + s.slice(1);
const delegate = (m: string) => (prisma as any)[lc(m)];

const report: Record<string, { created: number; skipped: number; problems: string[] }> = {};
const R = (k: string) => (report[k] ??= { created: 0, skipped: 0, problems: [] });

/** keep only candidate fields that really exist on the model with a compatible type */
function pick(model: string, cand: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const fields = models[model]?.fields ?? [];
  for (const [k, v] of Object.entries(cand)) {
    if (v === undefined) continue;
    const f = fields.find((x) => x.name === k && x.kind !== "object");
    if (!f) continue;
    if (f.kind === "enum") { if (!enums[f.type]?.includes(String(v))) continue; }
    else if (f.type === "String" && typeof v !== "string") continue;
    else if (f.type === "Int" && typeof v !== "number") continue;
    else if (f.type === "Boolean" && typeof v !== "boolean") continue;
    out[k] = v;
  }
  return out;
}
function missingRequired(model: string, data: Record<string, unknown>) {
  return (models[model]?.fields ?? [])
    .filter((f) => f.isRequired && !f.hasDefaultValue && f.kind !== "object" && !f.isUpdatedAt && !f.isId && !(f.name in data))
    .map((f) => f.name);
}
async function ensure(model: string, label: string, where: Prisma.JsonObject[], data: Record<string, unknown>) {
  const r = R(model);
  const conds = where.map((w) => pick(model, w as any)).filter((w) => Object.keys(w).length);
  if (conds.length) {
    const found = await delegate(model).findFirst({ where: conds.length > 1 ? { OR: conds } : conds[0] });
    if (found) { r.skipped++; return found; }
  }
  const miss = missingRequired(model, data);
  if (miss.length) { r.problems.push(`${label}: required field(s) not filled: ${miss.join(", ")}`); return null; }
  if (!APPLY) { r.created++; return { id: "DRY" }; }
  try { const row = await delegate(model).create({ data }); r.created++; return row; }
  catch (e: any) { r.problems.push(`${label}: ${String(e.message).split("\n").slice(-2).join(" ")}`); return null; }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  console.log(APPLY ? "MODE: APPLY (writing to database)" : "MODE: DRY RUN (nothing is written)");
  for (const m of ["Department", "Course", "Faculty", "User", "Facility", "Achievement", "SiteContent"])
    if (!models[m]) console.log(`! model ${m} not found in schema - skipped`);

  // ---- Departments ----
  const deptId: Record<string, string> = {};
  for (const d of departments) {
    const row = await ensure("Department", d.name,
      [{ code: d.code }, { name: d.name }],
      pick("Department", { name: d.name, code: d.code, description: d.description, isActive: true }));
    if (row?.id) deptId[d.code] = row.id;
  }

  // ---- Courses ----
  const levelMap: Record<string, string[]> = { JUNIOR: ["JUNIOR", "JUNIOR_COLLEGE", "HSC"], UG: ["UG", "UNDERGRADUATE", "BACHELOR", "DEGREE"], PG: ["PG", "POSTGRADUATE", "MASTER"], OTHER: ["CERTIFICATE", "DIPLOMA", "OTHER"] };
  for (const c of courses) {
    const f = models.Course?.fields.find((x) => x.name === "level" || x.name === "type" || x.name === "category");
    const lvl = f?.kind === "enum" ? levelMap[c.level].find((v) => enums[f.type]?.includes(v)) : c.level;
    const data = pick("Course", {
      name: c.name, title: c.name, code: slug(c.name).toUpperCase().slice(0, 24),
      departmentId: deptId[c.dept], description: c.description,
      durationYears: c.years, duration: c.years, intake: c.intake, seats: c.intake, capacity: c.intake,
      ...(f && lvl ? { [f.name]: lvl } : {}), isActive: true,
    });
    await ensure("Course", c.name, [{ name: c.name, departmentId: deptId[c.dept] }, { title: c.name, departmentId: deptId[c.dept] }], data);
  }

  // ---- Faculty (User without a usable password + Faculty profile) ----
  let n = 0;
  for (const [code, groups] of Object.entries(faculty)) {
    for (const [lvl, list] of [["SR", groups.senior ?? []], ["JR", groups.junior ?? []]] as const) {
      for (const [name, qual, desig] of list) {
        n++;
        const key = `MAG${String(n).padStart(3, "0")}`;
        // skip if a person with this name already exists (e.g. you added them manually)
        const dup = await prisma.user.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { name: { equals: name.replace(/^(Dr\.|Shri|Smt\.|Mrs\.)\s*/, ""), mode: "insensitive" } }] } as any }).catch(() => null);
        if (dup) { R("User").skipped++; R("Faculty").skipped++; continue; }
        const user = await ensure("User", name, [{ loginId: key }],
          pick("User", {
            name, fullName: name, loginId: key, role: "FACULTY",
            email: `${key.toLowerCase()}@import.scsco.invalid`, // placeholder; admin can set the real email later
            passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10), // nobody can log in until admin resets
            isActive: true, status: "ACTIVE", mustChangePassword: true,
          }));
        if (!user?.id) continue;
        await ensure("Faculty", name, [{ employeeId: key }, { userId: user.id }],
          pick("Faculty", {
            userId: user.id, employeeId: key, departmentId: deptId[code],
            designation: desig, qualification: qual,
            // junior-college marker kept in designation text only
          }));
      }
    }
  }

  // ---- Facilities / activities ----
  for (const f of facilities) {
    await ensure("Facility", f.name, [{ name: f.name }, { title: f.name }],
      pick("Facility", { name: f.name, title: f.name, description: f.description,
        category: f.kind === "ACTIVITY" ? "Activity" : "Facility", status: "PUBLISHED", isPublished: true }));
  }
  // ---- Achievements ----
  for (const a of achievements) {
    await ensure("Achievement", a.title, [{ title: a.title }],
      pick("Achievement", { title: a.title, description: a.description, status: "PUBLISHED", isPublished: true }));
  }

  // ---- Principal / President blocks (only if absent or never edited) ----
  if (models.SiteContent) {
    for (const [key, val] of [["site.president", president], ["site.principal", principal]] as const) {
      const r = R("SiteContent");
      const cur: any = await prisma.siteContent.findUnique({ where: { key } } as any).catch(() => null);
      const untouched = cur && cur.createdAt && cur.updatedAt && Math.abs(+new Date(cur.updatedAt) - +new Date(cur.createdAt)) < 2000;
      const hasText = cur?.value && typeof cur.value === "object" && String((cur.value as any).message ?? "").trim().length > 40;
      if (cur && (!untouched || hasText)) { r.skipped++; r.problems.push(`${key}: already has content - left as is`); continue; }
      const value = { ...(cur?.value as object ?? {}), name: val.name, designation: val.designation, message: val.message, photoUrl: (cur?.value as any)?.photoUrl ?? "" };
      if (APPLY) await prisma.siteContent.upsert({ where: { key }, update: { value }, create: { key, value } } as any);
      r.created++;
    }
  }

  console.log("\n===== REPORT =====");
  for (const [k, v] of Object.entries(report)) {
    console.log(`${k.padEnd(12)} ${APPLY ? "created" : "would create"}: ${v.created}   already there (skipped): ${v.skipped}`);
    v.problems.slice(0, 6).forEach((p) => console.log("   ! " + p));
    if (v.problems.length > 6) console.log(`   ! ...and ${v.problems.length - 6} more`);
  }
  if (!APPLY) console.log("\nNothing was written. If the report looks right, run again with --apply");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
