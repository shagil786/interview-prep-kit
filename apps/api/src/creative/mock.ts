import { PROMPTS, type LlmProvider } from "@prep/core";

export interface MockSession {
  sessionId: string;
  questions: { questionId: string; prompt: string }[];
}

export interface MockScore {
  grade: number;
  feedback: string;
  modelAnswer: string;
}

/** Score one mock-interview answer against the kit's answer outline (one call). */
export async function scoreAnswer(
  args: { question: string; answerOutline: string; answer: string },
  provider: LlmProvider,
): Promise<MockScore> {
  const { system, prompt } = PROMPTS.mockScore(args);
  const raw = await provider.generateJson<{ grade?: unknown; feedback?: unknown; modelAnswer?: unknown }>({ system, prompt });
  const grade = Number(raw.grade);
  return {
    grade: Number.isInteger(grade) && grade >= 1 && grade <= 5 ? grade : 3,
    feedback: typeof raw.feedback === "string" ? raw.feedback : "",
    modelAnswer: typeof raw.modelAnswer === "string" ? raw.modelAnswer : "",
  };
}
