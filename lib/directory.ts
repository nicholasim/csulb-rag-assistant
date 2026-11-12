/**
 * directory.ts: the CSULB office list, so a fallback can still point the student to the right
 * office ("Try: Student Health Services") even when none of our pages answers the question.
 *
 * lib/data/directory.json holds each office's name, its official page, and one sentence copied
 * word for word from that page (built and checked by `npm run fetch-sources`).
 *
 * How it's used: the numbered office names go into Gemini's instructions (gemini.ts). When Gemini
 * falls back, it picks the number of the office that handles that kind of question, or 0 for none.
 * Gemini can only pick a number from this list, so it can't invent an office or a link: the
 * button always goes to the office's own official page. The list is never a source for answers.
 */
import directory from "./data/directory.json";

export type Office = { name: string; url: string; description: string };

export const OFFICES: Office[] = directory.offices;

/** "1. Admissions\n2. Enrollment Services\n..." for Gemini's instructions. */
export function numberedOfficeList() {
  return OFFICES.map((office, i) => `${i + 1}. ${office.name}`).join("\n");
}

/** The office Gemini picked (1-based number), or null for 0 or a number that isn't on the list. */
export function officeByNumber(n: number): { title: string; url: string } | null {
  const office = Number.isInteger(n) ? OFFICES[n - 1] : undefined;
  return office ? { title: office.name, url: office.url } : null;
}
