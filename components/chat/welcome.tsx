"use client";

import { EXAMPLE_QUESTIONS } from "@/lib/categories";

/** The first screen: a short greeting and example questions that send when clicked. */
export function Welcome({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <section aria-labelledby="welcome-title" className="flex flex-col gap-8 py-6 sm:py-12">
      <div className="flex flex-col gap-3">
        <h1 id="welcome-title" className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Get answers about CSULB services, with the source to back them up.
        </h1>
        <p className="max-w-[60ch] text-base leading-7 text-muted-foreground">
          Ask about deadlines, parking, financial aid, advising, and more. Every answer comes from an
          official CSULB page and links to it, so you can double-check.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Try one of these</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {EXAMPLE_QUESTIONS.map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => onAsk(question)}
                className="flex min-h-14 w-full items-center rounded-xl border border-border bg-background px-4 py-3 text-left text-[15px] leading-6 transition-colors hover:border-black hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
