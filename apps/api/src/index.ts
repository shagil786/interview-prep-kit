import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;
const sessionSecret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean);

async function start(): Promise<void> {
  if (mongoUri) await connectDb(mongoUri);
  const app = createApp({ mongoUri, sessionSecret, corsOrigin });
  app.listen(port, () => {
    console.log(`prep api listening on http://0.0.0.0:${port}`);
    if (!mongoUri) console.warn("MONGODB_URI not set — running without persistence; sessions are in-memory.");
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
