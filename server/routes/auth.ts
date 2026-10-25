import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, badRequest, unauthorized } from "../utils/errors.js";
import { audit } from "../utils/audit.js";
import { authenticate, cookieOptions, signToken } from "../middleware/auth.js";
import { changePasswordSchema, loginSchema } from "../validators/auth.js";
import { hashPassword, homeRouteFor, toSafeUser, verifyLogin } from "../services/authService.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // only failed attempts count toward the limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { loginId, password } = loginSchema.parse(req.body);
    let user;
    try {
      user = await verifyLogin(loginId, password);
    } catch (e) {
      await audit(req, "LOGIN_FAILED", "User", undefined, { loginId });
      throw e;
    }
    res.cookie(config.cookieName, signToken(user.id), cookieOptions);
    await audit(req, "LOGIN", "User", user.id, undefined, user.id);
    res.json({ user: toSafeUser(user), home: homeRouteFor(user.role) });
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    res.clearCookie(config.cookieName, { ...cookieOptions, maxAge: undefined });
    res.json({ ok: true });
  }),
);

// Session restore on refresh: role always comes from the database.
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw unauthorized();
    res.json({ user: toSafeUser(user), home: homeRouteFor(user.role) });
  }),
);

router.post(
  "/change-password",
  authenticate,
  passwordLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest("Current password is incorrect");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    await audit(req, "PASSWORD_CHANGED", "User", user.id);
    res.json({ ok: true });
  }),
);

export default router;
