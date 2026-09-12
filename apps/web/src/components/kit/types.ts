export interface Req {
  id: string;
  text: string;
  kind: string;
  priority: "must" | "nice";
}
export interface Question {
  id: string;
  requirement_ids: string[];
  category: string;
  prompt: string;
  answer_outline: string;
  difficulty: number;
}
export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}
export interface Day {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}
export interface Kit {
  source: { company: string; company_url: string; pages_used: string[]; jd_chars: number };
  company_brief: { summary: string; what_they_do: string; sources: string[]; unknowns?: string[] };
  role: { title: string; seniority: string; requirements: Req[]; responsibilities: string[] };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: { days_available: number; days: Day[] };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
}
export interface Step {
  stage: string;
  label: string;
  status: string;
  detail?: string;
}
export interface KitPayload {
  id: string;
  status: "generating" | "ready" | "failed";
  error?: { code: string; message: string } | null;
  kit: Kit | null;
  job?: { steps?: Step[] };
  overlay?: {
    brief?: { origin: string; edited_by_user: boolean; pinned: boolean };
    questions?: Record<string, { origin: string; edited_by_user: boolean; pinned: boolean }>;
    flashcards?: Record<string, { origin: string; edited_by_user: boolean; pinned: boolean }>;
  };
}
export type ItemMeta = { origin: string; edited_by_user: boolean; pinned: boolean };

export const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"] as const;
export type Tab = "brief" | "questions" | "flashcards" | "schedule" | "practice" | "weak" | "mock";

export const TABS: [Tab, string][] = [
  ["brief", "Brief & role"],
  ["questions", "Questions"],
  ["flashcards", "Flashcards"],
  ["schedule", "Schedule"],
  ["practice", "Practice"],
  ["weak", "Weak spots"],
  ["mock", "Mock interview"],
];
