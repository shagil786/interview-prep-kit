# Design: The AI Interview Prep Kit

**Assessment:** Trao FS-AI-INTERVIEW-01 (Full-Stack Engineering Assessment)
**Date:** 2026-09-09
**Status:** Approved in chat; written up for review

---

## 1. Purpose

A web application that turns a pasted job description (JD), a company website URL, and a
"days until interview" number into a personalised interview preparation kit: a company brief, a
role breakdown, a bank of categorised questions, flashcards, and a day-by-day study schedule.
Users can reshape every part of the kit, regenerate single sections without losing edits, and
practise against the content while the app tracks what they have covered.

A mandatory batch entry point (`npm run evaluate`) runs the identical pipeline over unseen
cases, including cases served from local addresses.

## 2. Non-negotiable constraints (from the brief)

1. **Kit structure** — every generated kit conforms to Appendix A exactly: field names and
   nesting as given; stable per-kit ids (`r1`, `q1`, `f1`, …); every question references the
   requirement ids it covers; every requirement marked `must`/`nice`; `minutes` integer;
   `difficulty` 1–3; schedule `question_ids` refer to existing questions.
2. **Batch command** — repo root exposes `npm run evaluate -- --input <cases.json>
   --output <kits.json>` running the *same* pipeline code as the app. Output shape per
   Appendix B. Runs from a clean clone; needs no setup beyond documented install + env vars.
3. **Deterministic algorithms are code, not model** — schedule allocation and coverage
   comparison are arithmetic/decisions in our code.
4. **Honesty** — thin descriptions produce thin kits that say so; companies we find nothing
   about get an honest brief, never a fabricated one. "Failed" is reserved for cases we could
   not produce a kit for at all.
5. **Extensions allowed** — Appendix A may be extended where it genuinely helps, but the
   listed fields stay present and exactly named.

## 3. Stack and repository layout

Chosen stack (preferred stack from the brief): **Next.js (App Router) + Tailwind + TypeScript**,
**Node.js + Express + TypeScript**, **MongoDB**. TypeScript throughout.

Monorepo using **npm workspaces** so the API and the CLI share one pipeline implementation:

```
IntervewPrepLab/
├─ apps/
│  ├─ web/                 Next.js App Router + Tailwind + TS
│  └─ api/                 Express + TS (auth, kits, jobs, persistence, practice)
├─ packages/
│  └─ core/                The pipeline. Pure, DB-free, framework-free.
│     ├─ src/types/        Domain types + zod schemas (Appendix A, inputs, output)
│     ├─ src/validate/     Structure validator built on the zod schemas
│     ├─ src/stages/       extract | research | generate | cover | balance | schedule
│     ├─ src/engine/       stage runner, job model, rate limiter, retry/backoff,
│     │                    provenance/remap helpers, pacer
│     ├─ src/llm/          provider adapter (Gemini), JSON repair, prompt utils
│     ├─ src/retrieval/    fetch client, robots, crawler, page cleaning, search (Brave)
│     ├─ src/cli/          evaluate.ts (batch entry point)
│     └─ src/fixtures/     local fixture company server + sample case files (tests/eval)
├─ docs/superpowers/specs/ design docs
├─ .env.example            documented env vars (root + per-app examples as needed)
├─ package.json            workspaces + "evaluate" script at root
└─ README.md
```

Rationale: the API's kit route and the CLI both call `packages/core` — one pipeline, one
behaviour. Mongo is touched only by `apps/api`; `packages/core` has no DB dependency, so
`npm run evaluate` never needs a database. This is what makes "runs from a clean clone"
realistic.

## 4. Data model (Mongo, owned by the API)

Collections:

- **users** — `{ _id, email (unique, lowercased), password_hash, created_at }`
- **kits** — one per preparation run:
  - Appendix A document: `source`, `company_brief`, `role`, `questions[]`, `flashcards[]`,
    `schedule`, `coverage` — field names exact.
  - Ownership and lifecycle: `user_id`, `status` (`generating | ready | failed`), `error`
    (structured, when failed), `created_at`, `updated_at`, `submitted_at`.
  - **Edit overlay** (internal extension): for every user-mutable item a parallel meta record
    in `overlay.questions[qid]` / `overlay.flashcards[fid]` /
    `overlay.schedule_days[day]` / `overlay.brief`: `{ origin: "generated"|"user",
    edited_by_user: boolean, pinned: boolean }`.
  - **Research trail** (internal extension): `research.pages[]` (url, title, role
    [homepage|about|careers|hiring-process|blog|other], why_selected, fetched_ok,
    excerpt/stats) and `research.hiring_process` (what stages/rounds were found, with source
    urls, or `null` + a recorded `not_found` reason) and `research.discussion[]` (public
    discussion sources found, or recorded skip reason). UI-only, stripped from CLI output.
  - **Job/progress record** `job`: current stage, ordered `steps[]` (stage, label, status,
    detail/finding, started/ended at) so a reopened kit can resume display.
  - **Practice log** `practice[]`: `{ card_id, confidence (1|2|3), at }` — embedded, bounded
    (latest N per card) to avoid unbounded growth.
- **sessions** — managed by `express-session` + Mongo store (`connect-mongodb-session`),
  with an in-memory store fallback for dev/test where no Mongo is running.

Wire format: `GET/PATCH` kit routes return the internal kit (Appendix A + overlay + research
trail + job) so the builder can enforce edit-preservation and show "how this was made".
The CLI writer serialises to **pure Appendix A** plus the single allowed extension
`company_brief.unknowns` (see §5.3). No other internals leak to `kits.json`.

## 5. Pipeline (packages/core)

A stage runner executes ordered stages. Each stage is either a deterministic function or a
single LLM call with its own prompt, input schema, and JSON output contract. Stages report
progress through a shared `Job` object (label, status, finding) — the same object the API
persists and the UI renders, and the CLI prints per-case.

### 5.1 Stage order and responsibilities

1. **Extract requirements** (LLM). From the JD text alone → `role` metadata
   (title/seniority/location when present) and `role.requirements[]` each with `kind`
   (technical|behavioural|domain) and `priority` (must|nice), judged from how the posting
   words it ("required/5+ years" → must; "bonus/plus/nice to have" → nice). Guardrails in the
   prompt: never invent a requirement absent from the text; a two-line stub yields a thin,
   explicitly small list. `source.jd_chars` records input size.
2. **Crawl company site** (deterministic retrieval). BFS from the provided URL. Frontier
   scored by URL + anchor text keywords (careers, jobs, hiring, about, team, culture,
   handbook, blog, engineering, life, values, interview, apply). Respect robots.txt (crawl
   disallow + crawl-delay), per-host politeness delay, fetch timeout, content-type and size
   caps (HTML only, ≤ 2 MB), `User-Agent` identifying the app. Relative links resolved; no
   hard-coded path lists. Deduplicate by normalised URL. Cap total fetches (≈ 40) and
   depth.
3. **Discover hiring/process + about pages** (deterministic ranking over crawl results).
   Classify each fetched page by role; select the best candidates for: what the company does
   (about/homepage), how they hire (careers/hiring-process/handbook), engineering blog if
   present. Each selected page is cleaned (main-content extraction) and its findings recorded
   in the research trail with its URL. A page that cannot be retrieved is recorded and
   skipped, never fatal.
4. **Public-discussion search** (Brave Search API, then retrieval). Queries:
   `"{company} interview process"` and `"{company} interview"`. Top results are fetched and
   cleaned (same retrieval rules). Recorded in `research.discussion`. When the company host
   is a local/private fixture (evaluate mode), this stage is skipped and recorded honestly
   ("skipped: local fixture"), because nothing public exists.
5. **Generate questions per category** (LLM, one call per category). Categories:
   `technical`, `behavioural`, `system-design`, `company-fit`. Which categories run is decided
   by evidence:
   - technical + domain requirements → `technical` (and `domain` questions live under the
     matching JD requirements),
   - senior/architectural role or research that surfaced system design → `system-design`,
   - research that surfaced culture/values/hiring process → `company-fit`,
   - behavioural requirements → `behavioural`.
   A company with no discoverable hiring page still gets a defensible kit from the JD + what
   was found; the two are never produced by the same call with the same instructions.
   Each question: `requirement_ids` (from the requirements it targets), `prompt`,
   `answer_outline`, `difficulty` 1–3.
6. **Generate flashcards** (LLM). From requirements + highest-value questions, one call (or a
   deterministic split if volume demands), each card links its `requirement_ids`.
7. **Coverage check** (deterministic). See §6.1. Gaps → **gap-fill passes** (targeted LLM
   calls for the specific uncovered requirement ids, category chosen by requirement kind) →
   re-check. **Max 2 repair passes**, then stop and ship with
   `coverage.uncovered_requirement_ids` honest. Rationale: with free-tier flakiness an
   unbounded loop is a real failure mode; two targeted passes close the vast majority of
   genuine gaps; anything still uncovered is real signal the model could not address and
   should be reported, not papered over.
8. **Balance pass + duplicate trim** (deterministic + optional targeted LLM). See §5.4.
   Coverage is invariant by construction (§5.4), but it is re-asserted here and the final
   `coverage.uncovered_requirement_ids` is recorded *after* this step, so the shipped value
   always reflects the shipped questions.
9. **Generate schedule** (deterministic). See §6.2.
10. **Validate** the assembled kit against the Appendix A schema (structure validator). On
    failure of a *generated* section, retry that section once; if it still fails, fail the
    case with a structured error. On structural drift from our own deterministic steps (a
    bug), fail loudly — never write an invalid kit.

### 5.2 LLM provider and rate-limit resilience

- Provider: **Gemini (Google AI Studio free tier)**. Model configurable via env
  (`GEMINI_MODEL`); the default is set at implementation time by probing which free-tier
  Flash-class model is available (expected default `gemini-2.5-flash`), pinned in
  `packages/core/src/llm`. All structured outputs request JSON
  (constrained/generative-JSON where supported) with strict schemas.
- **Shared token-bucket rate limiter** across all calls plus **exponential backoff with
  jitter** on 429/5xx/timeouts/empty responses. Retries are counted against the batch
  time budget (see §8).
- **JSON repair**: on invalid/incomplete JSON, one repair call with the offending output +
  error; then fail-soft for that unit (recorded) rather than cascading.
- **Injection posture**: JD text and every fetched page are untrusted data. They are wrapped
  in explicit delimiters, labelled as data, and only ever fed to extraction steps — never
  concatenated into an instruction position. System prompts state the content is untrusted
  input, not instructions. Documented in README.

### 5.3 Research trail and the grounded brief

Every kit's internal `research` trail records, per fetched page: URL, title, role, why it was
selected, whether it fetched OK, and what was found. `research.hiring_process` records the
rounds/stages actually found (e.g. "take-home → system design → behavioural") with source
URLs, or an explicit `not_found`.

**Company brief generation is grounded**: the prompt receives the cleaned excerpts of the
selected pages only; the generator must only assert claims present in those excerpts, and
must return the source URLs it used per claim area. The brief carries the standard
`sources[]`; additionally we allow the single CLI-visible extension
`company_brief.unknowns: string[]` listing what could not be established (e.g. "no public
information found about their interview process") so an honest brief is machine-visible, not
just prose. Internal brief meta (per-paragraph source links) powers a "How this was
researched" panel in the UI (over-delivery #1).

### 5.4 Balance pass + duplicate trim (over-delivery #3)

After coverage is satisfied:

- **Category balance**: for each category the evidence rules in §5.1 step 5 would justify,
  if it ended up with zero questions, generate one representative question per requirement
  kind the category serves (code decides *which* categories may run; the LLM only writes the
  question). Categories with no supporting evidence are never force-fed — a marketing role
  does not get a system-design question because we "balanced" it in.
- **Duplicate trim (deterministic)**: two generated, unedited questions that share the same
  `requirement_ids` set and have near-identical normalised text are collapsed to the one with
  broader coverage / higher difficulty. User-written or user-edited questions are never
  auto-removed; a *reported* overlap is preferred over a silent one, so remaining probable
  duplicates are left in place but not created anew.

### 5.5 Edge-case behaviour (per §10 of the brief)

| Case | Behaviour |
|---|---|
| Invalid URL / 404 / timeout | Recorded on the case/kit as a research note; the run continues. Case fails only if no kit can be produced at all. |
| No discoverable hiring or about page | Honest brief + `company_brief.unknowns`; kit still built from the JD. Not a failure. |
| Two-line JD | Thin requirement list; kit explicitly thin; unknowns state it. |
| No public discussion found | `research.discussion` empty + recorded; `company_brief.unknowns` mentions it. |
| Model returns invalid JSON / incomplete kit | Repair retry → section retry → structured case failure (never an invalid kit written). |
| Rate limit / brief provider failure | Backoff + retry; budgeted; recorded if a section must be skipped. |
| Same description + company submitted twice | API: idempotent — reuses the existing `generating/ready` kit for the same user (match on normalized JD hash + URL + user) instead of duplicate runs. |
| 1-day or 60-day schedule | Schedule allocator handles both (see §6.2). |

## 6. Deterministic algorithms (in code, unit-tested)

### 6.1 Coverage checking

`uncovered(requirements, questions) → requirement ids` referenced by no question's
`requirement_ids`. Pure function. Used after the draft, after every gap-fill pass, and as the
final `coverage.uncovered_requirement_ids`. `coverage.passes` counts draft (1) + repairs.

### 6.2 Schedule allocation

Input: requirements (priority, kind, difficulty proxies), questions (difficulty, category,
requirement_ids), `days` D (1 ≤ D ≤ 60).

Algorithm (arithmetic, no model):
1. Build study units: one per requirement, carrying its questions (a question shared by
   multiple requirements joins each relevant unit once).
2. Rank units: `must` before `nice`; within a tier by a weight = requirement kind weight ×
   mean question difficulty; highest first.
3. Allocate units to days greedily so higher-ranked material lands earlier (day 1 is the
   hardest/most critical, never the night before). Units whose questions were already
   scheduled to an earlier day are not double-booked.
4. Produce exactly D days. For D=1 everything consolidates; for large D material stretches
   across days with review-heavy later days (revisit weakest first from practice data when it
   exists).
5. Each day: `focus` label derived from its dominant unit/category; `question_ids` ⊆ kit
   question ids; `minutes` integer (per-question base × count, clamped, never fractional).
6. Post-condition (asserted + tested): D days, every `must` requirement appears in ≥ 1 day,
   every id in `question_ids` resolves, all minutes integers.

### 6.3 Remap

When regeneration replaces or removes generated items, all references (schedule
`question_ids`, coverage ids, flashcard/question `requirement_ids` for removed question
targets) are recomputed by code. Question ids for *surviving* items never change; new items
get fresh ids (`q<n+1>…` continuing the sequence). This keeps every id stable within a kit and
the kit internally consistent after any regeneration.

## 7. Builder state semantics (edit-preservation)

The kit document holds both the canonical Appendix A content and the per-item overlay
(§4). Rules:

- **Generated, untouched** → replaceable by regeneration.
- **User-written** (`origin: "user"`), **user-edited** (`edited_by_user: true`), or
  **pinned** → never replaced, never auto-deleted. Survive regeneration of their section.
- **Regenerate(company-brief | question-category | schedule | flashcards | role)**: only
  eligible items in that scope are regenerated; everything else is untouched. If new items
  reference requirements that changed (e.g. requirements were themselves re-extracted), remap
  runs (§6.3) and coverage/schedule recompute. Edits elsewhere are never discarded.
- Item provenance is per-item and persisted, so a kit can be reopened mid-flow and the same
  guarantees hold. This is documented in the README as the answer to "how you represent
  generated, edited and pinned state".

## 8. Batch entry point (`npm run evaluate`)

Root `package.json`:

```
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Implementation: `packages/core/src/cli/evaluate.ts` (run via tsx at the workspace root).

- Reads and validates input (Appendix B shape: array of `{id, jd, company_url, days}`).
- For each case, runs the **identical** pipeline functions the API uses, with the case's own
  `days`.
- Per-case try/catch: a case that yields no kit → `{ id, status: "failed", kit: null,
  error: { code, message } }` (codes e.g. `COMPANY_UNREACHABLE`, `GENERATION_FAILED`,
  `INVALID_JD`). Partial research is still `ok` with the gaps recorded honestly.
- Writes a single output file in Appendix B shape, one entry per input case.
- Continues after any case failure; exit code non-zero only if the run itself broke (not on
  case failures).
- **Time budget**: serial execution, retries/backoff counted; validated by a timed smoke run
  against fixture cases targeting < 15 minutes for 5 cases (local fixture company servers so
  no network variance; real-network cases documented). `LLM` calls are paced by the shared
  limiter to respect free-tier RPM/TPM.
- **No assumptions about hosts** — fixture companies run on localhost; the retrieval code
  resolves relative links and never assumes a public host.
- **Credentials** from env (`GEMINI_API_KEY`, `BRAVE_API_KEY`, optional `GEMINI_MODEL`,
  `NODE_ENV`); documented in `.env.example`. No setup beyond `npm install` + env.
- Private/loopback URL guard is relaxed in CLI/evaluate mode deliberately (local fixtures are
  the point), and documented; it stays enforced in the deployed API.

## 9. API design (apps/api)

Middleware: helmet, CORS (allow the web app origin), body-size caps, JSON error envelope.

- **Auth** (minimal): `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
  `GET /auth/me`. bcrypt hashing; `express-session` with httpOnly cookie + Mongo store
  (memory in dev/test). Expired/invalid session → 401 + clear message; the web app redirects
  to `/login`. Every protected route requires a session; every kit query is scoped
  `{ user_id: session.user_id }` server-side.
- **Kits**:
  - `POST /kits` — body: `{ jd, company_url, days }` → creates kit (`status: generating`)
    and starts the pipeline async; returns the kit + job id. Duplicate-submission idempotency
    (§5.5). Multi-role bulk: `POST /kits/bulk` accepts a file (JSON or CSV of
    description/company/days pairs) and fans out one kit per pair, each with its own job,
    serialised to respect rate limits.
  - `GET /kits` (own, list w/ status), `GET /kits/:id` (own, incl. overlay/research/job),
    `PATCH /kits/:id` (section-scoped edits: question/flashcard content, reorder, move
    category, add/delete, pin/unpin), `POST /kits/:id/regenerate`
    `{ scope: brief|role|category|flashcards|schedule, target? }`, `DELETE /kits/:id`.
  - `GET /kits/:id/job` — progress + stage narrative for polling.
- **Practice**: `POST /kits/:id/practice` `{ card_id, confidence }`; `GET /kits/:id/practice`
  returns per-card history + coverage summary (used by weak-spots and next-session order).
- **Weak spots** (creative): computed server-side from coverage + difficulty + practice —
  `GET /kits/:id/weak-spots` → ranked list of requirements to fix first with reasons.
- **Mock interview** (creative): `POST /kits/:id/mock/session` `{ category, count }` → a
  stateless queue of question ids from the kit (code-selected); `POST /kits/:id/mock/answer`
  `{ question_id, answer }` → one LLM call scoring the answer against the question's
  `answer_outline`, returning a grade, gap notes, and a model answer. No LLM question
  generation in practice mode.

Generation is long-running: the job record is persisted; polling (simple, robust) powers the
UI; a regeneration for a kit already generating is refused with a clear message rather than
duplicated. Backend failure mid-run leaves the kit `failed` with a structured `error` and the
stage that broke — the UI offers retry from a failed stage.

## 10. Frontend (apps/web)

Next.js App Router + Tailwind + TS. State: lightweight fetch + SWR-style hooks; optimistic
edits with debounced persistence for text fields so typing never round-trips per keystroke.

- **Pages**: `/` landing · `/login` · `/register` · `/dashboard` (list own kits, new-kit form:
  JD textarea, company URL, days; bulk-upload entry point) · `/kits/[id]` builder.
- **Builder** (`/kits/[id]`): sections/tabs — Company brief · Role & requirements · Questions ·
  Flashcards · Schedule · Weak spots · Practice · Mock interview.
  - Inline edit, add, delete, pin on every item; reorder via drag-and-drop **and** keyboard
    controls (up/down buttons, focus-visible rings); category change via chip selector.
  - Regenerate is per-section with a clear affordance and an "unsaved edits elsewhere will be
    kept" confirmation when eligible items would be replaced.
  - **Progress + stage narrative** (over-delivery #2): while generating, a vertical step list
    shows each stage with status and a human finding ("Found their hiring process: take-home
    → system design"; "No public interview discussion found"). The kit appears section by
    section as stages complete.
  - **"How this was researched"** (over-delivery #1): from `research`, a panel listing pages
    used with roles + source links and any unknowns — the grounding trail in the UI.
  - Explicit loading / empty / error states everywhere; partial failures surface as banners,
    not crashes. A failed kit offers "retry from failed stage".
- **Practice**: one card at a time, reveal answer, confidence 1–3; covered/remaining counts;
  next-session order = unseen first, then least confident (confidence-weighted sort — chosen
  over full spaced repetition because data is sparse and the horizon is days; defended in
  README).
- **Weak spots** view: ranked list with reasons + links straight into the relevant question.
- **Mock interview** view: pick category → question-by-question answering → scored feedback.
- Responsive (laptop + phone), keyboard navigable, semantic markup.
- All fetches go through an API client that redirects to `/login` on 401 and maps structured
  API errors to readable messages.

## 11. Deployment

- Repo on **GitHub** (public), meaningful commit history.
- **Web** → Vercel (Next.js build); env: `API_URL`, `NEXT_PUBLIC_API_URL`.
- **API** → Render free web service; env: `MONGODB_URI`, `SESSION_SECRET`, `GEMINI_API_KEY`,
  `BRAVE_API_KEY`, `GEMINI_MODEL`, `CORS_ORIGIN`, `NODE_ENV=production`.
- **Mongo** → Atlas M0 free cluster.
- Known trade-off documented in README: Render free tier sleeps after inactivity → first
  request after idle takes tens of seconds to cold-start.
- `.env.example` documents every variable; nothing secret committed.

## 12. Testing strategy

Vitest, runnable at the repo root.

- **Core, unit**: schedule allocator (property tests — exact D days, every must covered, all
  ids resolve, integer minutes, hardest material earliest; 1- and 60-day cases); coverage
  checker (full/partial/none, must-vs-nice); structure validator (valid kit passes; each
  Appendix A rule violation fails); remap (regeneration keeps surviving ids stable, all refs
  consistent); duplicate trim + balance rules; rate limiter/backoff behaviour with a fake
  clock and a fake provider.
- **Retrieval, integration**: crawler against a local fixture HTTP server (real HTTP, local
  hosts): robots.txt honouring, relative links, content-type/size caps, 404/timeout
  recording, link-scoring picks the hiring page that isn't at a predictable path.
- **API, integration**: auth guard (401 without session), ownership isolation (user A cannot
  read/delete user B's kit), regeneration preserves user edits (fixture kit + pipeline
  doubles).
- **CLI**: evaluate over fixture cases → output shape, per-case ok/failed semantics,
  continue-on-error, timing smoke test.
- **Frontend**: a small set of component tests for the builder's optimistic-edit + keyboard
  reorder behaviour (vitest + testing-library) — enough to protect the interaction logic the
  brief weights most.

The brief's required test trio — schedule allocation, coverage checking, structure
validation — is covered by the core unit tests above.

## 13. Creative features (over-delivery scope)

1. **Weak-spots report**: `coverage` (uncovered musts) + question difficulty + practice
   confidence → ranked "fix these first" list with reasons and deep links. Problem it solves:
   a candidate with limited days doesn't know where to point effort; this computes it.
2. **Mock interview mode**: the app interviews you with the kit's own questions and scores
   each written answer against the answer outline (one LLM call per submitted answer). Problem
   it solves: solo candidates never practise *producing* an answer under pressure; this
   closes the loop between reading and performing. Token-safe by design (no generative
   question creation in practice mode).

## 14. Documentation and demonstration

README covers: overview + stack justification; setup local + deployed + exact evaluate
commands; LLM provider/model; architecture; retrieval approach and sources used; how research
and generation are sequenced and what each step owns; generated/edited/pinned representation;
schedule allocation; creative features; key decisions + trade-offs + known limitations.

A `docs/walkthrough.md` note list maps each brief-required video beat (end-to-end kit,
research + second pass closing a gap, edit/reorder + edit-preserving regeneration, practice +
schedule, creative feature + one defended decision) to the exact screens/flows to film.

## 15. Milestones / build order

1. Git init, workspaces scaffold, lint/format, `.env.example`, CI-less but scripted checks.
2. Core types + zod schemas + structure validator (+ tests).
3. Deterministic algorithms: schedule allocator, coverage checker, remap (+ tests).
4. Retrieval: fetch client (robots/limits/caps), crawler with scoring, page cleaner, Brave
   search (+ tests on local fixtures).
5. LLM layer: Gemini adapter, JSON repair, prompts, limiter/backoff, stage runner + job model.
6. Stages end-to-end + balance/dedupe + validation gate; fixture companies in `packages/core`.
7. CLI `npm run evaluate` + sample cases + timing smoke test.
8. API: auth, kits CRUD + jobs, practice, weak-spots, mock-interview endpoints; persistence;
   integration tests.
9. Web: pages, builder, progress narrative, research panel, practice, weak-spots, mock.
10. Deploy (Atlas → Render → Vercel), env wiring, README, walkthrough notes.
11. Polish + edge-case sweeps + full test pass + final timing run.

## 16. Key risks and mitigations

- **Free-tier rate limits** (their #1 called-out failure): shared limiter, backoff + jitter,
  serial jobs, budgeted retries, JSON repair — pipeline never hard-crashes on "slow down".
- **Honesty failures** (invented requirements/facts): extraction guardrails, grounded brief
  with `unknowns`, coverage gap loop capped and reported honestly.
- **Edit clobbering** (hardest state problem): per-item provenance + remap + coverage/schedule
  recompute; integration test pins the guarantee.
- **Clean-clone evaluate**: core is DB-free; retrieval tolerates local hosts; documented env.
- **Scope discipline**: exact-match items frozen; deterministic algorithms stay code;
  over-delivery is bounded to the agreed package (§5.3, §5.4, research panel, stage narrative).
