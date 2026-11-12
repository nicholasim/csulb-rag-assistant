"use client";

import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Renders an answer's Markdown (bold, lists, links) and turns citations like [1] or [2, 3]
 * into small gold buttons. Clicking one opens the matching source chip below the answer.
 * Raw HTML in the answer is never rendered (react-markdown ignores it by default).
 */
export function AnswerText({
  text,
  citableIds,
  onCite,
}: {
  text: string;
  citableIds: number[]; // source numbers that have a chip
  onCite: (id: number) => void;
}) {
  // "[2, 3]" -> "[2](#cite-2)[3](#cite-3)" so each number becomes its own link we can intercept.
  const withCitationLinks = text.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_, nums: string) =>
    nums
      .split(",")
      .map((n) => `[${n.trim()}](#cite-${n.trim()})`)
      .join(""),
  );

  const components: Components = {
    a({ href = "", children }) {
      const cite = href.match(/^#cite-(\d+)$/);
      if (cite) {
        const id = Number(cite[1]);
        if (!citableIds.includes(id)) return null; // a number with no matching source: hide it
        return (
          <button
            type="button"
            onClick={() => onCite(id)}
            className="mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-sm bg-gold px-1 align-middle text-xs font-bold text-gold-foreground hover:bg-black hover:text-gold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label={`Show source ${id}`}
          >
            {id}
          </button>
        );
      }
      const external = /^https?:\/\//.test(href);
      return (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="font-medium text-gold-ink underline decoration-gold decoration-2 underline-offset-2 hover:text-black"
        >
          {children}
          {external && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
      );
    },
    p: ({ children }) => <p className="leading-7">{children}</p>,
    ul: ({ children }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-gold-ink">{children}</ul>,
    ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-gold-ink">{children}</ol>,
    li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    // Answers shouldn't contain these, but keep them readable if they do.
    h1: ({ children }) => <p className="font-semibold">{children}</p>,
    h2: ({ children }) => <p className="font-semibold">{children}</p>,
    h3: ({ children }) => <p className="font-semibold">{children}</p>,
    table: ({ children }) => <div className="overflow-x-auto"><table className="text-sm">{children}</table></div>,
  };

  return (
    <div className="flex flex-col gap-3 text-[15px] text-foreground sm:text-base">
      <ReactMarkdown components={components}>{withCitationLinks}</ReactMarkdown>
    </div>
  );
}
