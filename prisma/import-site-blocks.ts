/**
 * Fills EMPTY fields of site.about / site.contact / site.admissions / site.campus.
 * Anything already written (by you in admin) is never touched.
 *   npx tsx prisma/import-site-blocks.ts           -> dry run
 *   npx tsx prisma/import-site-blocks.ts --apply   -> write
 */
import { PrismaClient } from "@prisma/client";
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const data: Record<string, Record<string, unknown>> = {
  "site.about": {
    summary:
      "Shri Chhatrapati Shivaji College, Omerga (Dist. Dharashiv), run by Bharat Shikshan Sanstha, Omerga, was established in June 1959 with just 50 students. Today more than 6,000 students study here, from Junior College (XI-XII Science, Commerce, Arts, MCVC) to Under-Graduate, Post-Graduate and Ph.D. research in Arts, Commerce and Science. Located on the Maharashtra-Karnataka border on a 30-acre campus, the college is affiliated to Dr. Babasaheb Ambedkar Marathwada University, Chhatrapati Sambhajinagar, and is NAAC re-accredited with 'A' grade (CGPA 3.14). It also holds an 'A' grade in the university's Academic & Administrative Audit (263/300).",
    mission: "Spread of education in rural region and inculcation of values and overall personality development.",
    vision: "Comprehensive Development through Education.",
    highlights: [
      "NAAC 'A' Grade, CGPA 3.14 (valid up to 29 June 2027)",
      "AAA Audit Grade 'A' - 263/300 (Dr. B.A.M. University)",
      "Three recognised Ph.D. research centres: Chemistry, Commerce and Physics",
      "71 Ph.D. and 30 M.Phil. degrees earned; 550+ research papers published",
      "Wi-Fi campus, 31 laboratories, library with 1,17,000+ books",
      "Career Katta Center of Excellence, competitive exam guidance and police/army pre-training academy",
      "Boys' and girls' hostels, sports grounds, gymnasium, shooting training centre",
      "RAC Lab (Refrigeration & AC) and SCSC Incubation Centre for Entrepreneurs",
    ],
  },
  "site.contact": {
    address: "Shri Chhatrapati Shivaji College, Tq. Omerga, Dist. Dharashiv - 413606, Maharashtra",
    phone: "02475-252020",
  },
  "site.admissions": {
    intro:
      "Admissions are given on merit as per seat availability, with reservation as per Government rules. Fees once paid are not refunded, and original documents submitted to the office are returned only after the related work is complete - keep extra photocopies. For help contact the Enquiry / Admission Committee office on 02475-252020.",
    steps: [
      "Collect the admission form from the Enquiry / Admission Committee office.",
      "Fill in the form and attach the original documents with attested copies (see the list below).",
      "Admission is confirmed on merit as per seat availability and reservation rules.",
      "Pay the course fees as per the 2026-27 fee structure.",
      "Submit migration, passing and other pending certificates before the due date, otherwise admission may be cancelled.",
    ],
    documents: [
      "School / College Leaving Certificate (TC / LC)",
      "Marks memo",
      "Passport size photo",
      "Caste certificate (backward class students)",
      "Eligibility certificate (students from other states)",
      "Migration certificate (students from other states)",
      "Progeny certificate",
      "Income certificate and EBC application form",
      "Aadhaar card copy (updated, without errors)",
      "Academic Bank of Credit (ABC) account number",
      "E-mail ID",
    ],
  },
  "site.campus": {
    intro:
      "Beyond the classroom, the college offers a wide range of student centres, clubs and programmes that build leadership, social awareness and skills.",
    activities: [
      "National Service Scheme (NSS)", "National Cadet Corps (NCC)", "Student Council", "Sports & Physical Education",
      "Health & Yoga Centre", "Rotaract Club", "Red Ribbon Club", "Fine Arts & Cultural Department",
      "Career Katta", "Entrepreneurship, EQ and Financial Literacy Clubs", "Career Guidance & Placement Cell",
      "Competitive Exam Guidance Centre", "Shooting Training Centre", "Shikshanmaharshi Tatyarao More Inter-College Debate",
      "Karmayogi Shridharrao More Lecture Series", "Commerce, Science, Social Science & Language Associations",
    ].map((title) => ({ title, imageUrl: "" })),
  },
};

const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

async function main() {
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN (nothing written)");
  for (const [key, incoming] of Object.entries(data)) {
    const row = await prisma.siteContent.findUnique({ where: { key } });
    const cur = (row?.value && typeof row.value === "object" && !Array.isArray(row.value) ? row.value : {}) as Record<string, unknown>;
    const next = { ...cur };
    const filled: string[] = [], kept: string[] = [];
    for (const [f, v] of Object.entries(incoming)) {
      if (empty(cur[f])) { next[f] = v; filled.push(f); } else kept.push(f);
    }
    console.log(`${key}: fills [${filled.join(", ") || "-"}]  keeps existing [${kept.join(", ") || "-"}]`);
    if (APPLY && filled.length)
      await prisma.siteContent.upsert({ where: { key }, update: { value: next as any }, create: { key, value: next as any } });
  }
  if (!APPLY) console.log("\nLooks right? run again with --apply");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
