import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="mt-16 text-4xl font-bold tracking-tight">
        Turn any job description into a personalised prep kit.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-slate-600">
        Paste a job description and a company site, pick how many days you have, and PrepKit
        researches the company, extracts the real requirements, writes questions, flashcards and a
        day-by-day schedule — then lets you reshape every part of it and practise against it.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/register" className="rounded-md bg-slate-900 px-5 py-2.5 text-white">
          Get started
        </Link>
        <Link href="/login" className="rounded-md border border-slate-300 px-5 py-2.5 text-slate-700">
          Log in
        </Link>
      </div>
    </div>
  );
}
