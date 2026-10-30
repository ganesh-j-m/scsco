import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// LIMITED fictional demo content so the public website is not empty.
// Safe to delete from the admin panel later. Demo faculty accounts have NO usable password.
const prisma = new PrismaClient();
const img = (seed: string, w = 800, h = 500) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

async function main() {
  const content: Record<string, unknown> = {
    "site.hero": {
      title: "Shri Chatrapati Shivaji College, Omerga",
      subtitle: "Quality education. Strong values. Bright careers.",
      imageUrl: img("scsco-hero", 1600, 800),
      ctaLabel: "Apply for admission",
    },
    "site.contact": {
      address: "Shri Chatrapati Shivaji College, Omerga, Dharashiv, Maharashtra",
      phone: "02475 252 020",
      email: "scsco2001@yahoo.com",
      hours: "Mon - Sat, 9:00 AM - 5:00 PM",
      mapUrl: "",
    },
    "site.about": {
      summary: "A student-first college focused on academics, skills and character.",
      mission: "To provide accessible, quality higher education to every learner.",
      vision: "A knowledge hub that shapes responsible and skilled citizens.",
      imageUrl: img("scsco-about", 900, 600),
      highlights: ["Experienced faculty", "Digital campus", "Placement support", "Active student clubs"],
    },
    "site.principal": {
      name: "Principal (demo)",
      designation: "Principal",
      photoUrl: img("scsco-principal", 500, 600),
      message: "Our aim is to help every student learn with curiosity and grow with confidence. Replace this demo message from the admin panel.",
    },
    "site.admissions": {
      intro: "Admissions are open for the coming academic year.",
      steps: ["Fill the online application", "Submit documents at the college office", "Verification and merit list", "Confirm admission and pay fees"],
      documents: ["Previous marksheet", "Leaving certificate", "Aadhaar copy", "Passport size photos"],
    },
    "site.campus": {
      intro: "Clubs, sports, cultural events and community work make campus life vibrant.",
      activities: [
        { title: "Cultural Club", imageUrl: img("scsco-culture") },
        { title: "Sports", imageUrl: img("scsco-sports") },
        { title: "NSS", imageUrl: img("scsco-nss") },
      ],
    },
  };
  for (const [key, value] of Object.entries(content)) {
    await prisma.siteContent.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } });
  }

  if ((await prisma.department.count()) === 0) {
    const cs = await prisma.department.create({ data: { name: "Computer Science", code: "CS", description: "Programming, data and software engineering." } });
    const sci = await prisma.department.create({ data: { name: "Commerce", code: "COM", description: "Accounting, finance and business studies." } });
    await prisma.course.createMany({
      data: [
        { name: "B.Sc. Computer Science", code: "BSC-CS", departmentId: cs.id, durationYears: 3, description: "Core computing with practical labs." },
        { name: "BCA", code: "BCA", departmentId: cs.id, durationYears: 3, description: "Application development and databases." },
        { name: "B.Com", code: "BCOM", departmentId: sci.id, durationYears: 3, description: "Commerce fundamentals and accounting." },
      ],
    });
    for (const [i, [name, dept, designation, qualification]] of [
      ["Demo Faculty One", cs.id, "Assistant Professor", "M.Sc., NET"],
      ["Demo Faculty Two", sci.id, "Associate Professor", "M.Com., Ph.D."],
    ].entries()) {
      const user = await prisma.user.create({
        data: {
          loginId: `DEMOFAC${i + 1}`, name: name as string, email: `demofac${i + 1}@example.edu`, role: "FACULTY",
          status: "ACTIVE", passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
        },
      });
      await prisma.faculty.create({
        data: { userId: user.id, employeeId: `DEMO-EMP-${i + 1}`, departmentId: dept as string, designation: designation as string, qualification: qualification as string, photoUrl: img(`scsco-fac${i}`, 400, 400) },
      });
    }
  }

  if ((await prisma.notice.count()) === 0) {
    await prisma.notice.createMany({
      data: [
        { title: "Admissions open for the new academic year", body: "Applications are now open for all undergraduate programmes.", status: "PUBLISHED", publishedAt: new Date() },
        { title: "Internal examination timetable released", body: "Students can view the timetable in the portal.", status: "PUBLISHED", publishedAt: daysFromNow(-3) },
        { title: "Scholarship form last date", body: "Submit scholarship forms before the deadline.", status: "PUBLISHED", publishedAt: daysFromNow(-7) },
      ],
    });
  }
  if ((await prisma.event.count()) === 0) {
    await prisma.event.createMany({
      data: [
        { title: "Annual Day", description: "Cultural programmes and prize distribution.", venue: "College Auditorium", imageUrl: img("scsco-ev1"), date: daysFromNow(21), status: "PUBLISHED" },
        { title: "Career Guidance Workshop", description: "Resume, interviews and career paths.", venue: "Seminar Hall", imageUrl: img("scsco-ev2"), date: daysFromNow(9), status: "PUBLISHED" },
        { title: "Tree Plantation Drive", description: "NSS volunteers plant saplings on campus.", venue: "Campus Grounds", imageUrl: img("scsco-ev3"), date: daysFromNow(-14), status: "PUBLISHED" },
      ],
    });
  }
  if ((await prisma.facility.count()) === 0) {
    await prisma.facility.createMany({
      data: [
        { name: "Library", description: "Books, journals and a quiet reading hall.", imageUrl: img("scsco-lib"), status: "PUBLISHED" },
        { name: "Computer Lab", description: "Modern systems with high-speed internet.", imageUrl: img("scsco-lab"), status: "PUBLISHED" },
        { name: "Sports Ground", description: "Cricket, kabaddi and athletics.", imageUrl: img("scsco-ground"), status: "PUBLISHED" },
        { name: "Seminar Hall", description: "Air-conditioned hall for talks and events.", imageUrl: img("scsco-hall"), status: "PUBLISHED" },
      ],
    });
  }
  if ((await prisma.achievement.count()) === 0) {
    await prisma.achievement.createMany({
      data: [
        { title: "University Rank Holder", description: "A student secured a top university rank.", imageUrl: img("scsco-ach1"), date: daysFromNow(-60), status: "PUBLISHED" },
        { title: "Inter-College Kabaddi Winners", description: "Our team won the district championship.", imageUrl: img("scsco-ach2"), date: daysFromNow(-120), status: "PUBLISHED" },
      ],
    });
  }
  if ((await prisma.galleryItem.count()) === 0) {
    await prisma.galleryItem.createMany({
      data: ["Campus", "Events", "Sports", "Campus", "Events", "Sports"].map((category, i) => ({
        title: `${category} photo ${i + 1}`, imageUrl: img(`scsco-gal${i}`, 900, 650), category, status: "PUBLISHED" as const,
      })),
    });
  }
  if ((await prisma.placement.count()) === 0) {
    await prisma.placement.create({
      data: { company: "Demo Tech Pvt. Ltd.", jobTitle: "Junior Developer", eligibility: "BCA / B.Sc. CS", package: "3 - 4 LPA", location: "Pune", driveDate: daysFromNow(15), deadline: daysFromNow(10), description: "Campus drive for final-year students.", status: "PUBLISHED" },
    });
  }
  console.log("Demo content seeded.");
}

main().finally(() => prisma.$disconnect());
