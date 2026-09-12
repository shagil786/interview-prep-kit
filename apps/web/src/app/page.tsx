import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { FadeIn } from "@/components/fade-in";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BookOpen01Icon,
  Calendar03Icon,
  ChartBarLineIcon,
  CheckmarkBadge01Icon,
  Edit02Icon,
  Mic01Icon,
  Search01Icon,
  SparklesIcon,
  Target02Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";

const steps = [
  {
    n: "1",
    icon: Edit02Icon,
    title: "Paste",
    body: "Drop in the job description and the company website — no scraping boards, just text.",
  },
  {
    n: "2",
    icon: Search01Icon,
    title: "Research",
    body: "PrepKit crawls the site, ranks links to find how they actually hire, and checks public discussion of their interviews.",
  },
  {
    n: "3",
    icon: SparklesIcon,
    title: "Generate",
    body: "Requirements, a categorised question bank, flashcards and a day-by-day schedule — then reshape every part of it.",
  },
];

const features = [
  {
    icon: Search01Icon,
    title: "Grounded company brief",
    body: "The brief only cites pages actually fetched. Anything unverifiable lands in an honest unknowns list — never invented.",
  },
  {
    icon: Target02Icon,
    title: "Coverage second pass",
    body: "Code compares every must-have requirement against the question bank, fills the gaps, and reports what is still uncovered.",
  },
  {
    icon: Edit02Icon,
    title: "Reshapeable builder",
    body: "Edit inline, reorder, move questions across categories, pin what matters. Regenerations keep your edits — always.",
  },
  {
    icon: Calendar03Icon,
    title: "Day-by-day schedule",
    body: "Exactly the days you asked for, hardest and highest-priority material first, integer minutes throughout.",
  },
  {
    icon: ZapIcon,
    title: "Flashcard practice",
    body: "Work through cards one at a time, record confidence, and get sessions ordered by what needs work.",
  },
  {
    icon: Mic01Icon,
    title: "Mock interviews",
    body: "Answer the kit's own questions in writing and get each one scored against its outline with a model answer.",
  },
];

const pipeline = [
  { icon: Edit02Icon, label: "Extract requirements" },
  { icon: Search01Icon, label: "Crawl + research" },
  { icon: BookOpen01Icon, label: "Questions per category" },
  { icon: CheckmarkBadge01Icon, label: "Coverage loop ×2" },
  { icon: ChartBarLineIcon, label: "Schedule arithmetic" },
];

const stats = [
  { value: "10", label: "pipeline stages, each with a job" },
  { value: "2", label: "targeted coverage repair passes" },
  { value: "1–60", label: "day schedules, exact day count" },
];

function KitMock() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border bg-card text-left shadow-2xl shadow-indigo-500/10"
    >
      <div className="flex items-center gap-1.5 border-b px-4 py-3">
        <span className="size-2.5 rounded-full bg-red-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 hidden rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">
          prepkit / senior-frontend-kit
        </span>
        <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          all musts covered
        </span>
      </div>
      <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
        <div className="hidden border-r p-3 sm:block">
          {["Brief & role", "Questions", "Flashcards", "Schedule", "Practice", "Mock interview"].map(
            (t, i) => (
              <div
                key={t}
                className={
                  i === 1
                    ? "mb-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"
                    : "mb-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground"
                }
              >
                {t}
              </div>
            ),
          )}
        </div>
        <div className="space-y-2.5 p-4">
          {[
            { cat: "technical", q: "Explain how you would migrate a legacy REST API to GraphQL…" },
            { cat: "behavioural", q: "Tell me about a time you mentored a junior engineer…" },
            { cat: "system-design", q: "Design a rate limiter for a free-tier LLM pipeline…" },
          ].map((row) => (
            <div key={row.q} className="rounded-lg border bg-background p-3">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {row.cat}
              </span>
              <p className="mt-1.5 truncate text-[13px] font-medium text-foreground">{row.q}</p>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
            </div>
            <span className="text-[11px] text-muted-foreground">Day 2 of 5 · 90 min</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div>
      {/* Hero — full-bleed dark panel breaking out of the page container */}
      <section className="relative -mx-4 -mt-8 overflow-hidden border-b border-white/10 bg-neutral-950 bg-[linear-gradient(180deg,rgba(99,102,241,0.12),transparent_40%)] px-4 pb-14 pt-14 text-white sm:-mx-6 sm:px-6 sm:pt-20 dark:border-border dark:bg-card dark:bg-none">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.35),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_35%_at_80%_20%,rgba(34,211,238,0.18),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <FadeIn>
            <Badge variant="secondary" className="border-white/10 bg-white/10 text-white hover:bg-white/15">
              <AnimatedGradientText colorFrom="#a5b4fc" colorTo="#22d3ee">
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-cyan-300" />
                Real research, not a single mega-prompt
              </AnimatedGradientText>
            </Badge>
          </FadeIn>
          <FadeIn delay={0.06}>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Turn any job description into a{" "}
              <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
                personalised prep kit
              </span>
              .
            </h1>
          </FadeIn>
          <FadeIn delay={0.12}>
            <p className="mx-auto mt-4 max-w-xl text-base text-neutral-300 sm:text-lg">
              Paste a job description and a company site, pick how many days you have, and PrepKit
              researches the company, extracts the real requirements, and writes questions, flashcards
              and a day-by-day schedule — then lets you reshape every part of it and practise against it.
            </p>
          </FadeIn>
          <FadeIn delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register">
                <ShimmerButton
                  borderRadius="10px"
                  className="px-6 py-3 text-sm font-semibold text-white shadow-lg [--shimmer-color:rgba(255,255,255,0.45)]"
                >
                  Get started — it’s free
                </ShimmerButton>
              </Link>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">Log in</Link>
              </Button>
            </div>
          </FadeIn>
          <FadeIn delay={0.26}>
            <div className="mx-auto mt-12 max-w-2xl">
              <KitMock />
            </div>
          </FadeIn>
          <FadeIn delay={0.32}>
            <dl className="mx-auto mt-10 grid max-w-xl grid-cols-3 gap-4">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col">
                  <dd className="text-2xl font-bold tracking-tight sm:text-3xl">{s.value}</dd>
                  <dt className="mt-1 text-xs text-neutral-400">{s.label}</dt>
                </div>
              ))}
            </dl>
          </FadeIn>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Three inputs. A deliberate pipeline. A kit you can defend in the room.
        </p>
        <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
          {steps.map((s, i) => (
            <FadeIn key={s.n} delay={i * 0.07}>
              <Card className="h-full transition-transform duration-200 hover:-translate-y-0.5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <HugeiconsIcon icon={s.icon} size={18} strokeWidth={2} />
                    </span>
                    <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                      Step {s.n}
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Pipeline strip */}
      <section className="mx-auto mt-16 max-w-4xl">
        <h2 className="text-center text-2xl font-bold tracking-tight">A real pipeline, not a mega-prompt</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Separate steps that respond to what was actually found — the two deterministic ones never touch the model.
        </p>
        <ol className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {pipeline.map((p, i) => (
            <FadeIn key={p.label} delay={i * 0.06} className="flex-1">
              <li className="flex h-full items-center gap-3 rounded-xl border bg-card p-3 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-cyan-400/15 text-primary">
                  <HugeiconsIcon icon={p.icon} size={18} strokeWidth={2} />
                </span>
                <span className="text-[13px] font-medium leading-tight">{p.label}</span>
              </li>
            </FadeIn>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="mx-auto mt-16 max-w-4xl">
        <h2 className="text-center text-2xl font-bold tracking-tight">Everything in the kit</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Not a document — a workspace you read, reshape, and rehearse in.
        </p>
        <div className="mt-8 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.05}>
              <Card className="h-full transition-transform duration-200 hover:-translate-y-0.5">
                <CardContent className="pt-6">
                  <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-cyan-400/15 text-primary">
                    <HugeiconsIcon icon={f.icon} size={18} strokeWidth={2} />
                  </span>
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            </FadeIn>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link href="/register">Build your first kit</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
