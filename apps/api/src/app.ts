import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import helmet from "helmet";
import MongoStoreFactory from "connect-mongodb-session";
import { authRouter } from "./routes/auth.js";
import { kitsRouter } from "./routes/kits.js";
import { practiceRouter } from "./routes/practice.js";

export interface AppConfig {
  mongoUri?: string;
  sessionSecret: string;
  corsOrigin?: string[];
}

export function createApp(config: AppConfig): Express {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin && config.corsOrigin.length > 0 ? config.corsOrigin : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  const MongoStore = MongoStoreFactory(session);
  const store =
    config.mongoUri != null
      ? new MongoStore({ uri: config.mongoUri, collection: "sessions" })
      : new session.MemoryStore();

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
        secure: false, // set true behind a TLS-terminating proxy in production
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRouter);
  app.use("/kits", kitsRouter);
  app.use(practiceRouter); // mounts /kits/:kitId/... practice subpaths

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "No such route." } });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL", message: err.message ?? "Unexpected error." } });
  });

  return app;
}
