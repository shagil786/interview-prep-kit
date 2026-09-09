import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { caseSchema, validateKit, type Kit } from "@prep/core";
import { KitModel, kitToClient } from "../models/kit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { applyEdit, type KitEdit } from "../edit/applyEdit.js";
import { regenerate, type RegenerateScope } from "../regenerate/regenerate.js";
import { runJob } from "../jobs/runJob.js";

const newKitSchema = z.object({
  jd: z.string().min(1).max(60_000),
  company_url: z.string().min(1).max(2000),
  days: z.number().int().min(1).max(60),
});

const editSchema = z.object({ edit: z.unknown() });
const regenSchema = z.object({
  scope: z.enum(["brief", "questions-category", "flashcards", "schedule"]),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]).optional(),
});

function jdHash(jd: string, url: string): string {
  return createHash("sha1").update(`${jd.trim()}|${url}`).digest("hex");
}

async function ownedKit(req: Request, res: Response): Promise<{ doc: InstanceType<typeof KitModel> } | null> {
  const doc = await KitModel.findOne({ _id: req.params.kitId, userId: res.locals.userId });
  if (!doc) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    return null;
  }
  return { doc };
}

export const kitsRouter = Router();
kitsRouter.use(requireAuth);

kitsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = newKitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "jd, company_url and days (1-60) are required." } });
    return;
  }
  const input = parsed.data;
  const hash = jdHash(input.jd, input.company_url);
  const existing = await KitModel.findOne({ userId: res.locals.userId, jdHash: hash, status: { $in: ["generating", "ready"] } });
  if (existing) {
    res.status(200).json({ kit: kitToClient(existing) });
    return;
  }
  const doc = await KitModel.create({
    userId: res.locals.userId,
    status: "generating",
    jdHash: hash,
    caseInput: input,
    kit: null,
    overlay: { questions: {}, flashcards: {} },
    job: { steps: [] },
  });
  void runJob(doc.id);
  res.status(202).json({ kit: kitToClient(doc) });
});

kitsRouter.post("/bulk", async (req: Request, res: Response) => {
  // Body is a JSON array of rows (the web client parses .json/.csv files
  // into this shape). Each row is validated independently so one bad row
  // never aborts the rest of the batch.
  const rows = Array.isArray(req.body) ? req.body : null;
  if (!rows) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Expected an array of {jd, company_url, days}." } });
    return;
  }
  const results: { index: number; jd: string; company_url: string; status: string; id?: string; error?: string }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const parsedRow = newKitSchema.safeParse(rows[index]);
    if (!parsedRow.success) {
      results.push({ index, jd: "", company_url: "", status: "invalid", error: parsedRow.error.issues.map((x) => x.message).join("; ") });
      continue;
    }
    const input = parsedRow.data;
    const hash = jdHash(input.jd, input.company_url);
    const existing = await KitModel.findOne({ userId: res.locals.userId, jdHash: hash, status: { $in: ["generating", "ready"] } });
    if (existing) {
      results.push({ index, jd: input.jd.slice(0, 40), company_url: input.company_url, status: "duplicate", id: existing.id });
      continue;
    }
    const doc = await KitModel.create({
      userId: res.locals.userId,
      status: "generating",
      jdHash: hash,
      caseInput: input,
      kit: null,
      overlay: { questions: {}, flashcards: {} },
      job: { steps: [] },
    });
    void runJob(doc.id);
    results.push({ index, jd: input.jd.slice(0, 40), company_url: input.company_url, status: "started", id: doc.id });
  }
  res.status(202).json({ results });
});

kitsRouter.get("/", async (req: Request, res: Response) => {
  const docs = await KitModel.find({ userId: res.locals.userId }).sort({ createdAt: -1 }).limit(200);
  res.json({
    kits: docs.map((d) => ({
      id: d.id,
      status: d.status,
      company_url: d.caseInput.company_url,
      days: d.caseInput.days,
      createdAt: d.createdAt,
      error: d.error,
    })),
  });
});

kitsRouter.get("/:kitId", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  res.json({ kit: kitToClient(owned.doc) });
});

kitsRouter.get("/:kitId/job", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  res.json({ job: owned.doc.job, status: owned.doc.status, error: owned.doc.error });
});

kitsRouter.patch("/:kitId", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  const doc = owned.doc;
  if (doc.status !== "ready" || !doc.kit) {
    res.status(409).json({ error: { code: "NOT_READY", message: "This kit is still generating or failed." } });
    return;
  }
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Expected {edit: {...}}." } });
    return;
  }
  const overlay = (doc.overlay ?? { questions: {}, flashcards: {} }) as { questions: Record<string, unknown>; flashcards: Record<string, unknown> };
  const cloned = structuredClone(doc.kit) as Kit;
  const result = applyEdit(cloned, overlay as Parameters<typeof applyEdit>[1], parsed.data.edit as KitEdit);
  const violations = validateKit(result.kit);
  if (violations.length > 0) {
    res.status(400).json({ error: { code: "INVALID_KIT", message: violations.join("; ") } });
    return;
  }
  doc.kit = result.kit;
  doc.overlay = result.overlay;
  await doc.save();
  res.json({ kit: kitToClient(doc) });
});

kitsRouter.post("/:kitId/regenerate", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  const doc = owned.doc;
  if (doc.status !== "ready" || !doc.kit) {
    res.status(409).json({ error: { code: "NOT_READY", message: "Only a ready kit can regenerate a section." } });
    return;
  }
  const parsed = regenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "scope (and category for questions-category) required." } });
    return;
  }
  const overlay = (doc.overlay ?? { questions: {}, flashcards: {} }) as Parameters<typeof regenerate>[1];
  try {
    const result = await regenerate(
      structuredClone(doc.kit) as Kit,
      overlay,
      doc.caseInput,
      parsed.data.scope as RegenerateScope,
      parsed.data.category,
    );
    doc.kit = result.kit;
    doc.overlay = result.overlay;
    await doc.save();
    res.json({ kit: kitToClient(doc) });
  } catch (err) {
    const code = (err as { code?: string }).code ?? "GENERATION_FAILED";
    res.status(502).json({ error: { code, message: (err as Error).message } });
  }
});

kitsRouter.post("/:kitId/retry", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  const doc = owned.doc;
  if (doc.status !== "failed") {
    res.status(409).json({ error: { code: "NOT_FAILED", message: "Only a failed kit can be retried." } });
    return;
  }
  doc.status = "generating";
  doc.error = null;
  doc.job = { steps: [] };
  await doc.save();
  void runJob(doc.id);
  res.json({ kit: kitToClient(doc) });
});

kitsRouter.delete("/:kitId", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  await owned.doc.deleteOne();
  res.status(204).end();
});
