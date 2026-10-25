import { config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./utils/prisma.js";
import { finalizeDueSessions } from "./services/attendanceService.js";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`SCSCO API listening on http://localhost:${config.port}`);
});

// Records ABSENT for students who did not scan once a QR session has ended.
const finalizer = setInterval(() => {
  finalizeDueSessions().catch((e) => console.error("finalize sessions failed", (e as Error).message));
}, 60_000);
finalizer.unref();

const shutdown = async () => {
  clearInterval(finalizer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
