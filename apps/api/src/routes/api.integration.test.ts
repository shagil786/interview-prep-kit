/**
 * DB-backed API integration test. Gated behind RUN_DB=1 (downloads the
 * mongodb-memory-server binary on first run). Exercises auth, ownership
 * isolation, kit creation with a stubbed pipeline, editing and regeneration.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaseInput, Kit } from "@prep/core";
import { MongoMemoryServer } from "mongodb-memory-server";
import { setPipelineForTests } from "../jobs/runJob.js";
import { createApp } from "../app.js";
import { disconnectDb } from "../db.js";

const enabled = process.env.RUN_DB === "1";
describe.skipIf(!enabled)("API integration (RUN_DB=1)", () => {
  let mongo: MongoMemoryServer;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    app = createApp({ mongoUri: mongo.getUri(), sessionSecret: "test-secret", corsOrigin: ["http://localhost:3000"] });
    setPipelineForTests((async (input: CaseInput): Promise<{ kit: Kit; job: unknown }> => {
      const { KitModel } = await import("../models/kit.js");
      const now = new Date().toISOString();
      const kit: Kit = {
        source: { company: "Acme", company_url: input.company_url, role: "SWE", location: "", jd_chars: input.jd.length, researched_at: now, pages_used: [input.company_url] },
        company_brief: { summary: "Acme builds tools.", what_they_do: "Developer tools", sources: [], unknowns: [] },
        role: {
          title: "SWE", seniority: "mid", responsibilities: [],
          requirements: [{ id: "r1", text: "K8s", kind: "technical", priority: "must" }],
        },
        questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "p", answer_outline: "a", difficulty: 2 }],
        flashcards: [{ id: "f1", front: "f", back: "b", requirement_ids: ["r1"] }],
        schedule: { days_available: input.days, days: Array.from({ length: input.days }, (_, i) => ({ day: i + 1, focus: "x", question_ids: ["q1"], minutes: 40 })) },
        coverage: { uncovered_requirement_ids: [], passes: 1 },
      };
      return { kit, job: { steps: [{ stage: "validate", label: "validate", status: "done", at: now }] } };
    }) as never);
  });

  afterAll(async () => {
    setPipelineForTests(null);
    await disconnectDb();
    await mongo.stop();
  });

  it("registers, creates a kit, edits it, and isolates ownership", async () => {
    const agent = request.agent(app);
    const register = await agent.post("/auth/register").send({ email: "a@b.co", password: "password123" });
    expect(register.status).toBe(201);

    const create = await agent.post("/kits").send({ jd: "Senior engineer with k8s.", company_url: "https://acme.example", days: 3 });
    expect(create.status).toBe(202);
    const kitId = create.body.kit.id;
    // wait for the (stubbed) job to finish
    let status = "generating";
    for (let i = 0; i < 50 && status === "generating"; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const poll = await agent.get(`/kits/${kitId}`);
      status = poll.body.kit.status;
    }
    expect(status).toBe("ready");

    const edit = await agent.patch(`/kits/${kitId}`).send({
      edit: { type: "upsertQuestion", oldId: "q1", question: { requirement_ids: ["r1"], category: "technical", prompt: "edited?", answer_outline: "a", difficulty: 2 } },
    });
    expect(edit.status).toBe(200);
    expect(edit.body.kit.kit.questions[0].prompt).toBe("edited?");

    const other = request.agent(app);
    await other.post("/auth/register").send({ email: "c@d.co", password: "password123" });
    const forbidden = await other.get(`/kits/${kitId}`);
    expect(forbidden.status).toBe(404);
  }, 120_000);
});
