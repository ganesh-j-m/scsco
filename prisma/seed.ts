import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe@123";
  const passwordHash = await bcrypt.hash(password, 12);

  // Only the Super Admin is seeded. Create everything else through the admin panel.
  await prisma.user.upsert({
    where: { loginId: "ADMIN001" },
    update: {},
    create: {
      loginId: "ADMIN001",
      name: "Super Admin",
      email: "admin@scsco.local",
      role: "SUPER_ADMIN",
      passwordHash,
    },
  });

  const defaults: Record<string, unknown> = {
    "site.contact": { address: "Sharadabai Pawar College, Omerga", phone: "", email: "" },
    "site.hero": { title: "Sharadabai Pawar College, Omerga", subtitle: "Learn. Grow. Lead.", imageUrl: "" },
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.siteContent.upsert({ where: { key }, update: {}, create: { key, value: value as object } });
  }
  console.log("Seeded: ADMIN001 (Super Admin) and default site content.");
}

main().finally(() => prisma.$disconnect());
