import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";

// npm -w @prep/api runs with cwd = apps/api; load the repo-root .env (explicit
// process env always wins — dotenv never overrides already-set variables).
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;
const sessionSecret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean);

async function start(): Promise<void> {
  if (mongoUri) await connectDb(mongoUri);
  const app = createApp({ mongoUri, sessionSecret, corsOrigin, secureCookies: (process.env.NODE_ENV ?? "").toLowerCase() === "production" });
  app.listen(port, () => {
    console.log(`prep api listening on http://0.0.0.0:${port}`);
    if (!mongoUri) console.warn("MONGODB_URI not set — running without persistence; sessions are in-memory.");
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
