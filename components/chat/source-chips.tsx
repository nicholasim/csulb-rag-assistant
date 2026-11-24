"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Source } from "@/lib/rag";
import { cn } from "@/lib/utils";
import { CHIPS_START_MS, ENTER_STEP_MS, enterDelay } from "@/lib/enter";

/**
 * The numbered source chips under an answer. Chip [1] matches citation [1] in the text.
 * Clicking a chip opens a panel with the supporting quote and a link to the real page.
 */
export function SourceChips({
  sources,
  openId,
  onToggle,
  messageId,
}: {
  sources: Source[];
  openId: number | null;
  onToggle: (id: number) => void;
  messageId: string;
}) {
  if (sources.length === 0) return null;
  const open = sources.find((s) => s.id === openId);
  const panelId = `${messageId}-source-panel`;

  return (
    <div className="flex flex-col gap-2">
      <p className="enter text-xs font-medium text-muted-foreground" style={enterDelay(CHIPS_START_MS)}>
        Sources
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Sources for this answer">
        {sources.map((source, i) => {
          const isOpen = source.id === openId;
          return (
            <li key={source.id} className="enter" style={enterDelay(CHIPS_START_MS + i * ENTER_STEP_MS)}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggle(source.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={cn("h-8 max-w-72 gap-2 pl-1", isOpen && "border-black bg-accent")}
              >
                <span
                  aria-hidden
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-gold text-xs font-bold text-gold-foreground"
                >
                  {source.id}
                </span>
                <span className="truncate">{source.title}</span>
                <span className="sr-only">, source {source.id}. {isOpen ? "Hide" : "Show"} details</span>
              </Button>
            </li>
          );
        })}
      </ul>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={`Source ${open.id}: ${open.title}`}
          className="flex flex-col gap-3 rounded-lg border border-l-4 border-border border-l-gold bg-card p-4"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">{open.title}</p>
            <p className="text-xs text-muted-foreground">{open.category}</p>
            {/* When we last fetched this page and checked it (Entry 32, lib/data/page-checks.json). */}
            <p className="text-xs text-muted-foreground/80">
              {new URL(open.url).hostname.replace(/^www\./, "")}
              {open.checked && <> · checked {shortDate(open.checked)}</>}
            </p>
          </div>
          <blockquote className="flex flex-col gap-1.5 text-sm leading-6 text-foreground/90">
            {open.excerpt.split("\n").map((line) => (
              <p key={line}>“{line}”</p>
            ))}
          </blockquote>
          <div>
            <Button
              size="sm"
              nativeButton={false}
              render={<a href={open.url} target="_blank" rel="noreferrer" />}
            >
              View on {new URL(open.url).hostname.replace(/^www\./, "")}
              <ExternalLinkIcon data-icon="inline-end" />
              <span className="sr-only"> (opens in a new tab)</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "2026-11-23" -> "Nov 23" (read at noon, so no time zone can move it to another day). */
function shortDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
