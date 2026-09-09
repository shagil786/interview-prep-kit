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
  // Listen immediately even if Atlas is unreachable (e.g. the local IP left
  // the whitelist) so the browser gets a structured 503 instead of "Failed to
  // fetch", then keep retrying the connection in the background.
  const app = createApp({ mongoUri, sessionSecret, corsOrigin, secureCookies: (process.env.NODE_ENV ?? "").toLowerCase() === "production" });
  app.listen(port, () => {
    console.log(`prep api listening on http://0.0.0.0:${port}`);
    if (!mongoUri) console.warn("MONGODB_URI not set — running without persistence; sessions are in-memory.");
  });

  if (!mongoUri) return;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await connectDb(mongoUri);
      console.log("mongo connected");
      return;
    } catch (err) {
      const wait = Math.min(30_000, 2_000 * attempt);
      console.error(`mongo connection attempt ${attempt} failed (${(err as Error).message.split("\n")[0]}); retrying in ${wait / 1000}s`);
      console.error("if this is Atlas, check Network Access → IP Access List includes your current IP");
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
