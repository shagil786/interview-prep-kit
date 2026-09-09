import { z } from "zod";
export const requirementSchema = z.object({
  id: z.string().regex(/^r\d+$/),
  text: z.string().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"]),
});
export const questionSchema = z.object({
  id: z.string().regex(/^q\d+$/),
  requirement_ids: z.array(z.string().regex(/^r\d+$/)).min(1),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  prompt: z.string().min(1), answer_outline: z.string().min(1),
  difficulty: z.number().int().min(1).max(3),
});
export const flashcardSchema = z.object({
  id: z.string().regex(/^f\d+$/), front: z.string().min(1), back: z.string().min(1),
  requirement_ids: z.array(z.string().regex(/^r\d+$/)).min(1),
});
export const scheduleDaySchema = z.object({
  day: z.number().int().min(1), focus: z.string().min(1),
  question_ids: z.array(z.string().regex(/^q\d+$/)), minutes: z.number().int().min(1),
});
export const scheduleSchema = z.object({
  days_available: z.number().int().min(1).max(60),
  days: z.array(scheduleDaySchema),
});
export const coverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string().regex(/^r\d+$/)),
  passes: z.number().int().min(1),
});
export const companyBriefSchema = z.object({
  summary: z.string().min(1),
  // what_they_do may legitimately be empty: an honest brief for a company we
  // could not retrieve anything about says so in summary/unknowns instead.
  what_they_do: z.string(),
  sources: z.array(z.string().url()),
  unknowns: z.array(z.string()).optional(), // allowed extension (spec §5.3)
});
export const roleSchema = z.object({
  title: z.string().min(1), seniority: z.string().min(1),
  responsibilities: z.array(z.string()), requirements: z.array(requirementSchema).min(1),
});
export const kitSchema = z.object({
  source: z.object({
    company: z.string().min(1), company_url: z.string(),
    role: z.string(), location: z.string(), jd_chars: z.number().int().min(0),
    researched_at: z.string(), pages_used: z.array(z.string()),
  }),
  company_brief: companyBriefSchema,
  role: roleSchema,
  questions: z.array(questionSchema).min(1),
  flashcards: z.array(flashcardSchema).min(1),
  schedule: scheduleSchema,
  coverage: coverageSchema,
});
export type Kit = z.infer<typeof kitSchema>;
