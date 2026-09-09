import { Router, type Request, type Response } from "express";
import type { Kit } from "@prep/core";
import { KitModel } from "../models/kit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { computeWeakSpots, type PracticeEntry } from "../creative/weakSpots.js";
import { scoreAnswer, type MockSession } from "../creative/mock.js";
import { pipelineDepsFromEnv } from "../jobs/envDeps.js";

export const practiceRouter = Router();
practiceRouter.use(requireAuth);

async function ownedKit(req: Request, res: Response): Promise<{ doc: InstanceType<typeof KitModel> } | null> {
  const doc = await KitModel.findOne({ _id: req.params.kitId, userId: res.locals.userId });
  if (!doc) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    return null;
  }
  return { doc };
}

practiceRouter.post("/kits/:kitId/practice", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  const doc = owned.doc;
  const { card_id, confidence } = (req.body ?? {}) as { card_id?: string; confidence?: number };
  const cardId = typeof card_id === "string" ? card_id : "";
  if (!doc.kit || !doc.kit.flashcards.some((f) => f.id === cardId)) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Unknown flashcard id." } });
    return;
  }
  if (![1, 2, 3].includes(Number(confidence))) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "confidence must be 1, 2 or 3." } });
    return;
  }
  const practice = doc.practice ?? [];
  practice.push({ card_id: cardId, confidence: Number(confidence) as PracticeEntry["confidence"], at: new Date() });
  // Bound: keep the latest 20 attempts per card.
  const perCard = new Map<string, number>();
  for (const p of practice) perCard.set(p.card_id, (perCard.get(p.card_id) ?? 0) + 1);
  doc.practice = practice.filter((p) => (perCard.get(p.card_id) ?? 0) <= 20);
  await doc.save();
  res.status(201).json({ ok: true });
});

practiceRouter.get("/kits/:kitId/practice", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  const kit = owned.doc.kit;
  if (!kit) {
    res.status(409).json({ error: { code: "NOT_READY", message: "Kit is not ready." } });
    return;
  }
  const practice = (owned.doc.practice ?? []) as unknown as PracticeEntry[];
  res.json({ practice: summarizePractice(kit, practice) });
});

practiceRouter.get("/kits/:kitId/weak-spots", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  if (!owned.doc.kit) {
    res.status(409).json({ error: { code: "NOT_READY", message: "Kit is not ready." } });
    return;
  }
  const practice = (owned.doc.practice ?? []) as unknown as PracticeEntry[];
  res.json(computeWeakSpots(owned.doc.kit as Kit, practice));
});

practiceRouter.post("/kits/:kitId/mock/session", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  if (!owned.doc.kit) {
    res.status(409).json({ error: { code: "NOT_READY", message: "Kit is not ready." } });
    return;
  }
  const { category, count } = (req.body ?? {}) as { category?: string; count?: number };
  const questions = (owned.doc.kit as Kit).questions.filter((q) => !category || q.category === category);
  if (questions.length === 0) {
    res.status(400).json({ error: { code: "NO_QUESTIONS", message: "No questions in that category." } });
    return;
  }
  const take = Math.min(Number(count) || questions.length, questions.length);
  // Deterministic rotation seeded by the kit id so sessions are stable per kit.
  const offset = owned.doc.id.length % questions.length;
  const rotated = [...questions.slice(offset), ...questions.slice(0, offset)];
  const session: MockSession = {
    sessionId: `${owned.doc.id}-${Date.now()}`,
    questions: rotated.slice(0, take).map((q) => ({ questionId: q.id, prompt: q.prompt })),
  };
  res.json(session);
});

practiceRouter.post("/kits/:kitId/mock/answer", async (req: Request, res: Response) => {
  const owned = await ownedKit(req, res);
  if (!owned) return;
  if (!owned.doc.kit) {
    res.status(409).json({ error: { code: "NOT_READY", message: "Kit is not ready." } });
    return;
  }
  const kit = owned.doc.kit as Kit;
  const { questionId, answer } = (req.body ?? {}) as { questionId?: string; answer?: string };
  const question = kit.questions.find((q) => q.id === questionId);
  if (!question || typeof answer !== "string" || answer.trim().length === 0) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "A valid questionId and a non-empty answer are required." } });
    return;
  }
  const services = pipelineDepsFromEnv();
  try {
    const result = await scoreAnswer(
      { question: question.prompt, answerOutline: question.answer_outline, answer },
      services.provider,
    );
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: { code: "SCORING_FAILED", message: (err as Error).message } });
  }
});

function summarizePractice(kit: Kit, practice: PracticeEntry[]) {
  const perCard: Record<string, { history: PracticeEntry[]; lastConfidence: number | null; attempts: number }> = {};
  for (const f of kit.flashcards) perCard[f.id] = { history: [], lastConfidence: null, attempts: 0 };
  for (const p of practice) {
    const entry = perCard[p.card_id];
    if (!entry) continue;
    entry.history.push(p);
    entry.attempts += 1;
    entry.lastConfidence = p.confidence;
  }
  const total = kit.flashcards.length;
  const covered = Object.values(perCard).filter((e) => e.attempts > 0).length;
  return { perCard, covered, total };
}
