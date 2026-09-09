import mongoose from "mongoose";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import helmet from "helmet";
import { MongooseSessionStore } from "./auth/sessionStore.js";
import { authRouter } from "./routes/auth.js";
import { kitsRouter } from "./routes/kits.js";
import { practiceRouter } from "./routes/practice.js";

export interface AppConfig {
  mongoUri?: string;
  sessionSecret: string;
  corsOrigin?: string[];
  secureCookies?: boolean;
}

export function createApp(config: AppConfig): Express {
  const app = express();
  if (config.secureCookies) app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin && config.corsOrigin.length > 0 ? config.corsOrigin : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  // Structured 503 while the database is unreachable, instead of buffering
  // for 10s or erroring inside a handler. /health stays open for monitoring.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path !== "/health" && mongoose.connection.readyState !== 1) {
      res.status(503).json({
        error: { code: "DB_UNAVAILABLE", message: "The server cannot reach its database right now. If this is your Atlas cluster, add your current IP to its Network Access list." },
      });
      return;
    }
    next();
  });

  // Session store: backed by the app's own mongoose connection (see
  // auth/sessionStore.ts) so a dropped DB never wedges requests — while the
  // DB is down the session route gate below answers a clean 503.
  const store: session.Store = config.mongoUri ? new MongooseSessionStore() : new session.MemoryStore();

  app.use(
    session({
      name: "sid",
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.secureCookies ?? false,
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });

  app.use("/auth", authRouter);
  app.use("/kits", kitsRouter);
  app.use(practiceRouter); // mounts /kits/:kitId/... practice subpaths

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "No such route." } });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const type = err.type ?? "";
    if (type.startsWith("entity.parse.failed")) {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } });
      return;
    }
    if (type.startsWith("entity.too.large")) {
      res.status(413).json({ error: { code: "TOO_LARGE", message: "Request body is too large." } });
      return;
    }
    res.status(err.status ?? 500).json({ error: { code: "INTERNAL", message: err.message ?? "Unexpected error." } });
  });

  return app;
}
