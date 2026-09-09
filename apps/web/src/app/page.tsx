import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { FadeIn } from "@/components/fade-in";

const steps = [
  {
    n: "1",
    title: "Paste",
    body: "Drop in the job description and the company website — no scraping boards, just text.",
  },
  {
    n: "2",
    title: "Research",
    body: "PrepKit crawls the site, ranks links to find how they actually hire, and checks public discussion of their interviews.",
  },
  {
    n: "3",
    title: "Generate",
    body: "Requirements, a categorised question bank, flashcards and a day-by-day schedule — then reshape every part of it.",
  },
];

export default function Home() {
  return (
    <div className="relative mx-auto max-w-3xl text-center">
      <FadeIn>
        <Badge variant="secondary" className="mt-10">
          <AnimatedGradientText colorFrom="#818cf8" colorTo="#22d3ee">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary" />
            Real research, not a single mega-prompt
          </AnimatedGradientText>
        </Badge>
      </FadeIn>
      <FadeIn delay={0.06}>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Turn any job description into a{" "}
          <span className="text-primary">personalised prep kit</span>.
        </h1>
      </FadeIn>
      <FadeIn delay={0.12}>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
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
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </FadeIn>

      <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
        {steps.map((s, i) => (
          <FadeIn key={s.n} delay={0.22 + i * 0.07}>
            <Card className="h-full transition-transform duration-200 hover:-translate-y-0.5">
              <CardContent className="pt-6">
                <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {s.n}
                </span>
                <h2 className="mt-3 font-semibold">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </CardContent>
            </Card>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}
