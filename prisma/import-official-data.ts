import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const officialCourses = [
  "B.A.",
  "B.Sc.",
  "B.Com.",
  "B.C.S.",
  "M.A.",
  "M.Com.",
  "M.Sc. Chemistry",
  "M.Sc. Physics",
];

const officialTeachers = [
  {
    id: "official-teacher-kare-chandrasen",
    username: "kare.chandrasen",
    name: "Kare",
    surname: "Chandrasen",
  },
  {
    id: "official-teacher-dilip-ghule",
    username: "dilip.w.ghule",
    name: "Dilip W.",
    surname: "Ghule",
  },
];

async function main() {
  for (const name of officialCourses) {
    await prisma.subject.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const teacher of officialTeachers) {
    await prisma.teacher.upsert({
      where: { id: teacher.id },
      update: {
        name: teacher.name,
        surname: teacher.surname,
      },
      create: {
        ...teacher,
        address: "Shri Chhatrapati Shivaji College, Omerga",
        bloodType: "Unknown",
        sex: "MALE",
        birthday: new Date("1970-01-01"),
      },
    });
  }

  console.log(
    `Imported ${officialCourses.length} courses and ${officialTeachers.length} official teachers.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
