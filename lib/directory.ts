/**
 * directory.ts: the CSULB office list, so a fallback can still point the student to the right
 * office ("Try: Student Health Services") even when none of our pages answers the question.
 *
 * lib/data/directory.json holds each office's name, its official page, one sentence copied word for
 * word from that page, and (for 25 of 42 offices) a phone and/or email found on that page or in
 * our knowledge files (all built and checked by `npm run fetch-sources`).
 *
 * How it's used: the numbered office names go into Gemini's instructions (gemini.ts). When Gemini
 * falls back, it picks the number of the office that handles that kind of question, or 0 for none.
 * Gemini can only pick a number from this list, so it can't invent an office or a link: the
 * "Who can help" card (lib/help-office.ts) always shows the office's own official page and only
 * the phone/email we verified on it. The list is never a source for answers.
 */
import directory from "./data/directory.json";

// keywords: our own search hints for offices whose page has no matchable description. Used only to
// match a question to an office (embeddings and Gemini's office list); never shown as facts.
export type Office = { name: string; url: string; description: string; phone?: string; email?: string; keywords?: string[] };

export const OFFICES: Office[] = directory.offices;

/** "1. Admissions\n2. Enrollment Services\n..." for Gemini's instructions. */
export function numberedOfficeList() {
  return OFFICES.map((office, i) => `${i + 1}. ${office.name}${office.keywords?.length ? ` (handles: ${office.keywords.join(", ")})` : ""}`).join("\n");
}

/** The full office entry for Gemini's pick (1-based number), or null for 0 or an unknown number. */
export function officeAt(n: number): Office | null {
  return (Number.isInteger(n) && OFFICES[n - 1]) || null;
}
