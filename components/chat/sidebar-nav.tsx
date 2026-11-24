"use client";

import { CATEGORIES, CATEGORY_GROUPS } from "@/lib/categories";
import { cn } from "@/lib/utils";

/** Wordmark shown at the top of the sidebar (and in the mobile header). */
export function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden className="flex size-9 items-center justify-center rounded-md bg-gold text-base font-bold text-gold-foreground">
        C
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">CSULB Services</span>
        <span className="text-sm text-sidebar-foreground/70">Student assistant</span>
      </div>
    </div>
  );
}

/**
 * The list of service categories, grouped into a few sidebar sections (Entry 29). Clicking one puts a
 * starter question in the input box (it doesn't send it, so the student can edit it first).
 */
export function CategoryList({ onPick }: { onPick: (starter: string) => void }) {
  return (
    <nav aria-label="Service categories" className="flex flex-col gap-3">
      <p className="px-3 text-xs font-medium text-sidebar-foreground/70">Browse by service</p>
      {CATEGORY_GROUPS.map((group, g) => {
        const headingId = `category-group-${g}`;
        return (
          <section key={group} className={cn("flex flex-col gap-1", g > 0 && "border-t border-sidebar-border pt-3")}>
            <h2 id={headingId} className="px-3 pb-0.5 text-xs font-medium text-sidebar-foreground/60">
              {group}
            </h2>
            <ul className="flex flex-col gap-0.5" aria-labelledby={headingId}>
              {CATEGORIES.filter((c) => c.group === group).map(({ name, icon: Icon, starter }) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onPick(starter)}
                    className="group flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-gold" />
                    <span>{name}</span>
                    <span className="sr-only">: fill in a starter question</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
