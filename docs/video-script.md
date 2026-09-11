# Video script + cue sheet (target 3:30)

How to record on macOS: **⌘⇧5 → "Record Selected Portion" → select the ego-browser window → Record.**
Before recording, run `docs/video-warmup.sh` (wakes Render + opens the app), set the browser to a clean zoom (⌘0), and close other tabs.
Read the VOICE lines calmly; pause ~0.5s at each `…` . Total ≈ 3:25–3:45.

---

## Beat 0 — Title (0:00–0:05)
Show the landing page.
> "This is PrepKit — a job description in, a personalised interview prep kit out."

## Beat 1 — Register + create kit (0:05–0:40)
Action: click **Sign up** → email + password (paste block A) → **dashboard** → paste JD **block B**, URL `https://about.gitlab.com/`, days `4` → **Create kit**.
> "Sign up, paste a job description, the company site, and how many days you have. Then PrepKit does the research itself."

## Beat 2 — Live research + generation (0:40–1:25) ← money shot
Action: watch the stage narrative; lean into "found hiring process at …".
> "Each step is a deliberate stage: extract requirements from the JD — crawl the site with a scored frontier, respecting robots-dot-txt — search public discussion, filtered to this company. A hiring-process page changes what questions make sense. Questions are generated per category, then coverage is checked in code: any must-have requirement without a question triggers a targeted repair pass — a second pass, not one mega-prompt."

## Beat 3 — Brief, sources, unknowns (1:25–1:50)
Action: open **Brief & role**; scroll to "How this was researched"; point at an unknown.
> "The brief is grounded — only pages we actually fetched, listed here. And honesty rules: what couldn't be established goes into unknowns instead of being invented."

## Beat 4 — Builder: edit, pin, regenerate (1:50–2:35)
Action: **Questions** → type a short edit in one question's prompt (paste block C mid-sentence) → **Pin** it → drag/reorder with ↑↓ → **Regenerate category** → dialog → confirm → point out: your edited/pinned question survived, new ones arrived, "all musts covered" stayed green.
> "Every part is reshapeable — inline edits, pinning, reordering. Regenerating a section only replaces untouched generated items; your edited and pinned questions survive, and the schedule and coverage recompute to stay consistent."

## Beat 5 — Practice + schedule (2:35–3:00)
Action: **Schedule** (day 1 focus, minutes) → **Practice** → Start → Reveal → rate a card → show covered counter.
> "The schedule distributes material across exactly the days you chose — hardest first, integer minutes, all code, no model. Practice steps through cards and orders sessions by your weakest confidence."

## Beat 6 — Weak spots + mock (3:00–3:25)
Action: **Weak spots** → then **Mock interview** → All categories → Start → paste block D answer → Submit → grade + model answer.
> "Weak spots rank what to fix before the interview. Mock mode makes you answer out loud — scored against the outline, one call per answer."

## Beat 7 — Close (3:25–3:35)
Action: show the batch CLI terminal line OR just the app.
> "Repo and pipeline are public — including a batch entry point that runs the same code over unseen descriptions. Thanks for watching."

---

### Paste blocks (keep in a text editor, right of the screen)
A — email/password: `demo@prepkit.app` / `demo-password-1`
B — JD:
Senior Backend Engineer. You must have 5+ years of experience running Kubernetes in production and deep PostgreSQL skills at scale. Strong GraphQL API design is required. Bonus points for mentoring junior engineers and fintech domain knowledge.
C — question edit: `…with zero downtime during cluster upgrades?`
D — mock answer:
In my last role we ran services on EKS. For zero-downtime upgrades we used surge deployments: new node groups join, workloads drain gradually with PodDisruptionBudgets, and we gated rollouts on SLO dashboards. One upgrade took down a stateful set because we missed a PDB — after that I added a pre-upgrade checklist and chaos drills before any major version bump.
