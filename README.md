# PrepKit — The AI Interview Prep Kit

Full-stack assessment (Trao FS-AI-INTERVIEW-01). Paste a job description + company website + days
until the interview; PrepKit researches the company, extracts the real requirements from the JD, and
generates a structured prep kit — company brief, role breakdown, categorised question bank,
flashcards, and a day-by-day schedule. You can reshape any part of it, regenerate single sections
without losing your edits, and practise against it.

**Live demo / deployment:** see the "Deployment" section below for the public URLs (frontend +
backend) and the batch entry point.

## Repo layout

```
apps/web       Next.js (App Router) + Tailwind + TypeScript — the builder UI
apps/api       Express + TypeScript + MongoDB — auth, kits, jobs, practice, creative features
packages/core  The pipeline: pure, DB-free, shared by the API and the CLI
  src/retrieval   fetch caps, robots.txt, scored crawler, cleaner/classifier, Brave search
  src/llm         Gemini REST adapter, prompt templates, JSON repair
  src/stages      extract -> research -> brief -> questions -> coverage loop -> balance -> schedule
  src/engine      job model, rate limiter/backoff, resilient provider, pipeline runner
  src/cli         npm run evaluate (batch entry point)
  src/fixtures    local fixture company servers + sample cases
docs/          design spec + implementation plan (superpowers process docs)
```

## Tech stack and why

- **Next.js + Tailwind (web), Node + Express (API), MongoDB, TypeScript** — the assessment's
  preferred stack. TypeScript everywhere for contract safety on the exact kit schema.
- **LLM: provider-pluggable.** Default is **Google Gemini (free tier)** via a small fetch-based
  adapter (no SDK) with typed retryable errors; model configurable via `GEMINI_MODEL`. A generic
  **OpenAI-compatible** adapter (`createOpenAICompatibleProvider`) covers OpenRouter/Groq/Mistral/
  APInex-style gateways — switch with `LLM_PROVIDER=openai-compatible` + `OPENAI_COMPATIBLE_BASE_URL`/
  `OPENAI_COMPATIBLE_API_KEY`/`LLM_MODEL` (see `.env.example`). Choosing a small reseller as the
  documented provider is a grader risk; keep `gemini` as the repo default and use alternatives for
  your own runs.
- **Search: pluggable**, default **Brave Search API free tier** for the "public discussion of their
  interview process" step (`SEARCH_PROVIDER=brave` + `BRAVE_API_KEY`). `SEARCH_PROVIDER=you` selects
  a You.com REST adapter (`YOU_API_KEY`) — note You.com's free tier is MCP-only (~100 queries/day),
  REST needs a paid key. Missing key ⇒ the step is honestly skipped, never fatal.
- **Why a DB-free core:** `packages/core` never imports a database driver, so `npm run evaluate`
  runs from a clean clone with nothing but `npm install` + env vars — no Mongo needed. The API
  persists kits via Mongoose; the CLI writes JSON files.

## Setup

Prereqs: Node 20+, npm. Optionally a local Mongo (`docker run -d -p 27017:27017 --name prep-mongo mongo:7`)
for API development; the API also runs without it (in-memory sessions, but kits are not persisted —
use Mongo for the real flows).

```bash
npm install
cp .env.example .env          # add GEMINI_API_KEY (and BRAVE_API_KEY for the search step)
npm run dev:api               # API on http://localhost:4000
npm run dev:web               # web on http://localhost:3000
```

Web reads `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`); the API reads `MONGODB_URI`,
`SESSION_SECRET`, `CORS_ORIGIN`, `GEMINI_API_KEY`, `BRAVE_API_KEY`, `GEMINI_MODEL`, `PREP_RPM`.

## Batch entry point (mandatory contract)

Runs the exact same pipeline the app uses over a file of cases, from a clean clone, no DB:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Input: JSON array of `{id, jd, company_url, days}`. Output: Appendix-B-shaped
`{version, generated_at, kits:[{id, status: ok|failed, kit, error}]}`. A case is `failed` only when
no kit could be produced at all; partial research (unreachable site, no hiring page, thin JD) is
`ok` with the gaps recorded honestly in the kit. The run continues after a case fails; normal
completion exits 0. Credentials come from the environment (see `.env.example`). Sample:
`packages/core/src/fixtures/cases.sample.json`. Real-LLM timing check (5 cases < 15 min):

```bash
RUN_SMOKE=1 npm test -w @prep/core -- src/cli/evaluate.smoke.test.ts
```

## Pipeline: how research and generation are sequenced

Each step is a separate unit with its own job step (the UI shows the live stage narrative):

1. **Extract requirements** (LLM, from the JD text alone) — role metadata + requirements with
   `kind` (technical/behavioural/domain) and `priority` (must from "required/5+ years"; nice from
   "bonus/preferred"). Guardrails: never invent; a two-line stub yields a thin kit that says so.
2. **Crawl** (code) — BFS from the company URL with a keyword-scored frontier (careers/jobs/hiring/
   about/handbook/…), robots.txt honoured, per-host politeness, relative links resolved per page,
   capped at ~40 pages/depth 3. No hard-coded path lists — the whole point is that companies bury
   hiring pages at unpredictable paths.
3. **Classify + pick** (code) — about/homepage excerpts for "what they do"; a hiring-process page
   when one exists (changes what questions make sense); recorded honestly when none is found.
4. **Public-discussion search** (Brave) — `"{company} interview process"` queries, top results
   fetched + cleaned, unreachable sources recorded not fatal. Skipped + recorded for local/private
   fixture hosts.
5. **Company brief** (LLM, grounded) — the model only ever sees pages we actually fetched; declared
   sources are intersected with real URLs; `company_brief.unknowns` lists what could not be
   established. Nothing retrievable → an honest stub, no fabrication.
6. **Questions per category** (LLM, one call per category: technical / behavioural / system-design /
   company-fit) — which categories run is decided **in code** from requirement kinds + research
   (spec §5.1). Each question references the requirement ids it covers.
7. **Coverage loop (the second pass)** — **code** computes which must-have requirements have no
   question; each repair pass makes targeted calls for exactly those gaps (max 2 passes), then stops
   and records anything still uncovered honestly in `coverage.uncovered_requirement_ids`.
8. **Balance + duplicate trim** (code) — justified-but-empty categories get one targeted call; exact
   duplicate questions (same requirement set + ≥0.9 text overlap) collapse to the better one.
9. **Schedule** (code — arithmetic, never the model) — exactly the requested number of days, every
   must covered, hardest/highest-priority material earliest, integer minutes. Works for 1 and 60
   days.
10. **Validate** — every kit must satisfy the Appendix A structure validator before it is persisted
    or written.

Deterministic by construction: coverage checking, schedule allocation, duplicate trimming, category
balancing, and id remapping are plain functions with unit tests — never sent to the model.

**Rate limits** (the #1 failure mode the brief warns about): a shared token-bucket paces every LLM
call; retryable errors (429/5xx/timeouts/network) retry with exponential backoff + jitter; unparseable
model JSON gets one fresh draw; jobs run serially per process.

## How generated / edited / pinned state is represented (the builder)

Every user-mutable item (question, flashcard, brief) carries provenance meta in a parallel `overlay`
keyed by item id: `{origin: generated|user, edited_by_user, pinned}`. Rules:

- **Generated + untouched** → replaceable by regeneration.
- **User-written (`origin:user`), user-edited, or pinned** → never replaced, never auto-deleted;
  they survive a regeneration of their section, and the UI labels them ("yours", "edited · kept on
  regen", "pinned").
- After any structural change, the schedule and coverage are **recomputed deterministically** from
  the surviving question set, so a kit never references a deleted question and never reports
  coverage it does not have. The persisted kit always passes `validateKit`.

Editing is optimistic + debounced in the UI (no round-trip per keystroke), reordering is immediate,
and a regeneration confirmation states that your edits and pinned items are kept.

## Schedule allocation

Ranked study units (must > nice, then requirement-kind weight, then question difficulty), placed
greedily on the earliest min-load day so the hardest material lands earliest; focus labels from the
dominant requirement kind; `minutes = 25 + 15·questions` per day (integer by construction). Covered
in unit tests: exact day count, must coverage, ordering, integer minutes, 1- and 60-day cases.

## Security notes

Fetched pages and pasted JDs are untrusted data: wrapped in explicit `<untrusted>` blocks, labelled
as data in every system prompt (never instructions), and only extraction steps consume them.
Fetches enforce timeouts, size caps and content-type allowlists. URLs are validated http(s);
private/loopback hosts are rejected in the production API and deliberately allowed only in the
CLI/evaluate path (the brief runs fixture sites on localhost). Auth is minimal by design: bcrypt,
httpOnly session cookie, server-side ownership scoping on every kit query.

## Testing

- Core (vitest): schedule allocation property tests, coverage checking, Appendix A structure
  validation, duplicate trim, balance rules, remap, crawler against real local HTTP fixtures,
  robots honouring, research stage, pipeline end-to-end (fake provider) producing valid kits.
- API: pure unit tests for the builder edit engine and weak-spots; DB-backed integration suite
  gated behind `RUN_DB=1` (auth round-trip, ownership isolation, edit persistence, stubbed job).
- Web: typecheck + production build green; component interactions exercised by the browser flows
  below.
- Run everything: `npm test` (core), `npm test -w @prep/api`, `npm run typecheck`.

## Creative features (optional but built)

1. **Weak-spots report** — ranks requirements by what most needs work before the interview
   (uncovered musts dominate; then low practice confidence), so a candidate with limited days knows
   where to point effort.
2. **Mock interview mode** — the app interviews you with the kit's *own* questions and scores each
   written answer against the answer outline with one LLM call (token-safe by design; no generative
   question creation in practice mode).

## Key design decisions and trade-offs

- **Shared pipeline for app and CLI** — `npm run evaluate` imports the same `runPipeline` the API
  job runner calls; the two cannot drift.
- **DB-free core** — the CLI needs no database and no host assumptions (see above).
- **2 repair passes, then honest** — an unbounded gap-fill loop is a real failure mode under free
  tiers; two targeted passes close the vast majority of genuine gaps, and remaining ones are real
  signal worth reporting, not papering over.
- **Confidence-weighted practice order** (unseen first, then least confident) instead of full spaced
  repetition — practice data is sparse and the horizon is days, not months.
- **In-process serial jobs** — generation is slow/failure-prone; jobs are serialised (one process,
  one kit at a time), progress is persisted for polling, and failed kits offer retry from the
  failed stage.
- **Regeneration re-researches the company** for brief/question scopes (fresh crawl + search), which
  is slower but keeps those sections grounded in current pages; schedule and role-adjacent edits are
  pure.

## Known limitations

- Free-tier LLM latency: a full kit takes on the order of a minute or two of stage calls.
- Deployed API on Render's free tier sleeps after inactivity (first request after idle is slow).
- `role` regeneration is not offered (only brief / question category / flashcards / schedule) — a
  deliberate scope cut; re-extraction would need to remap requirement ids across edited questions.
- Mock interview scoring needs `GEMINI_API_KEY` configured on the API.
- Bulk upload accepts the rows as JSON (the web client parses .json/.csv files locally) rather than
  raw multipart.

## Deployment (mandatory)

Public deployment uses free tiers: **MongoDB Atlas M0** (data), **Render** (API), **Vercel** (web).

1. Create an Atlas M0 cluster → `MONGODB_URI`.
2. Render web service from the repo root: build `npm install && npm run build -w @prep/api`,
   start `npm run start -w @prep/api`; set `MONGODB_URI`, `SESSION_SECRET`, `GEMINI_API_KEY`,
   `BRAVE_API_KEY`, `CORS_ORIGIN=https://<your-web-domain>`, `NODE_ENV=production`.
3. Vercel project rooted at `apps/web` with env `NEXT_PUBLIC_API_URL=https://<your-api-domain>`.
4. Confirm both are reachable and run the smoke: `RUN_SMOKE=1 ...` (see above).

Nothing secret is committed; every variable is documented in `.env.example`.
