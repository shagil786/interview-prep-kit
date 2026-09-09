import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  ["1", "Paste", "Drop in the job description and the company website."],
  ["2", "Research", "PrepKit crawls the site, finds how they hire, and checks public discussion."],
  ["3", "Generate", "Requirements, questions, flashcards and a day-by-day schedule you can reshape."],
];

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="mt-16 text-4xl font-bold tracking-tight sm:text-5xl">
        Turn any job description into a{" "}
        <span className="text-primary">personalised prep kit</span>.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
        Paste a job description and a company site, pick how many days you have, and PrepKit
        researches the company, extracts the real requirements, and writes questions, flashcards
        and a day-by-day schedule — then lets you reshape every part of it and practise against it.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/register">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
      <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
        {steps.map(([n, title, body]) => (
          <Card key={n}>
            <CardContent className="pt-6">
              <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {n}
              </span>
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
