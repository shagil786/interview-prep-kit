import type { NextFunction, Request, Response } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

/** 401 unless a session user exists; attaches userId to res.locals. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please log in." } });
    return;
  }
  res.locals.userId = userId;
  next();
}
