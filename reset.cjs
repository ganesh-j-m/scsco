require("dotenv/config");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
    const hash = await bcrypt.hash("admin@12345", 12);
    const r = await prisma.user.updateMany({
        where: { loginId: "ADMIN001" },
        data: { passwordHash: hash, status: "ACTIVE" },
    });
    console.log("updated rows:", r.count);
    await prisma.$disconnect();
})();