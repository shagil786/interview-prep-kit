import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { UserModel } from "../models/user.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireAuth } from "../middleware/requireAuth.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Minimal in-memory per-IP limiter for auth endpoints (single-instance deploy).
const attempts = new Map<string, { n: number; at: number }>();
function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && now - rec.at < 60_000) {
    if (rec.n >= 10) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." } });
      return;
    }
    rec.n += 1;
  } else {
    attempts.set(ip, { n: 1, at: now });
  }
  next();
}

export const authRouter = Router();

authRouter.post("/register", authRateLimit, async (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "A valid email and a password of 8+ characters are required." } });
    return;
  }
  const { email, password } = parsed.data;
  const existing = await UserModel.findOne({ email }).lean();
  if (existing) {
    res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with that email already exists." } });
    return;
  }
  const user = await UserModel.create({ email, passwordHash: await hashPassword(password) });
  req.session.userId = user.id;
  res.status(201).json({ user: { id: user.id, email: user.email } });
});

authRouter.post("/login", authRateLimit, async (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "A valid email and password are required." } });
    return;
  }
  const { email, password } = parsed.data;
  const user = await UserModel.findOne({ email });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: { code: "BAD_CREDENTIALS", message: "Email or password is incorrect." } });
    return;
  }
  req.session.userId = user.id;
  res.json({ user: { id: user.id, email: user.email } });
});

authRouter.post("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.status(204).end();
  });
});

authRouter.get("/me", requireAuth, async (_req: Request, res: Response) => {
  const user = await UserModel.findById(res.locals.userId).lean();
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Session is no longer valid." } });
    return;
  }
  res.json({ user: { id: user._id.toString(), email: user.email } });
});
