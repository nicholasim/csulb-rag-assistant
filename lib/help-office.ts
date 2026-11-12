/**
 * help-office.ts: picks the "Who can help" office for a fallback, so a student never hits a dead
 * end (team rule, prompt log Entry 17). Every fallback about CSULB shows a real office: its name,
 * its one-line description, its official page, and any phone/email we verified on its page.
 *
 * How the office is picked, best first:
 *   1. the office Gemini picked from the office list (related_office), if Gemini was asked;
 *   2. otherwise the office closest in MEANING to the question: we compare the question's
 *      embedding (already made for search) with each office's name + description
 *      (data/office-embeddings.*, made by `npm run embeddings`), if it's similar enough;
 *   3. otherwise Dean of Students: its own page says "When you don't know where to go with a
 *      question, start with the Dean of Students team".
 *
 * Exception: questions that aren't about CSULB at all ("capital of France", "best pizza near
 * campus") get no office; the fallback says what the assistant can help with and shows examples.
 */
import { OFFICES, type Office } from "./directory";
import { DIMENSIONS, EMBEDDING_MODEL, officeText, readStore, textHash } from "./embeddings-store";
import { dot } from "./vector-search";

// The office a question's meaning must reach before we suggest it (cosine similarity, 0 to 1).
// Picked from our test questions (prompt log Entry 17): right offices scored 0.51-0.72 and wrong
// ones 0.58-0.66, so we only trust strong matches. A weaker match gets Dean of Students instead,
// because a wrong office is worse than the general "start here" office.
export const MIN_OFFICE_SIMILARITY = 0.63;

// For fallbacks that never reached Gemini: if even the closest knowledge chunk is less similar than
// this, the question isn't about CSULB ("what's the capital of France?" 0.51, "asdfgh qwerty" 0.59).
// Real CSULB questions in our tests scored 0.60 or more (prompt log Entry 17). Fallbacks that reach
// Gemini use Gemini's own about_csulb answer instead.
export const OFF_TOPIC_SIMILARITY = 0.6;

const DEFAULT_OFFICE_URL = "https://www.csulb.edu/student-affairs/dean-of-students";

export type HelpOffice = Office & { reason: "gemini" | "meaning" | "default" };

type OfficeVectors = { offices: Office[]; vectors: Float32Array } | null;
let officeVectors: OfficeVectors | undefined;

/** Load the saved office vectors once (only offices whose name/description haven't changed). */
function loadOfficeVectors(): OfficeVectors {
  if (officeVectors !== undefined) return officeVectors;
  officeVectors = null;
  try {
    const store = readStore("offices");
    if (!store || store.index.model !== EMBEDDING_MODEL || store.index.dimensions !== DIMENSIONS) return officeVectors;
    const byUrl = new Map(OFFICES.map((o) => [o.url, o]));
    const offices: Office[] = [];
    const rows: number[] = [];
    store.index.chunks.forEach(({ id, hash }, row) => {
      const office = byUrl.get(id);
      if (office && textHash(officeText(office)) === hash) {
        offices.push(office);
        rows.push(row);
      }
    });
    const vectors = new Float32Array(offices.length * DIMENSIONS);
    rows.forEach((row, i) => vectors.set(store.vectors.subarray(row * DIMENSIONS, (row + 1) * DIMENSIONS), i * DIMENSIONS));
    officeVectors = { offices, vectors };
  } catch (err) {
    console.warn(`[help-office] couldn't read office embeddings (${(err as Error).message})`);
  }
  return officeVectors;
}

/** The offices closest in meaning to any of the question's query vectors, best first. */
export function rankOfficesByMeaning(queryVectors: Float32Array[], limit = 3): { office: Office; similarity: number }[] {
  const data = loadOfficeVectors();
  if (!data || queryVectors.length === 0) return [];
  return data.offices
    .map((office, i) => ({ office, similarity: Math.max(...queryVectors.map((q) => dot(q, data.vectors, i))) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Pick the office for a fallback about CSULB (never null: there's always the default office). */
export function pickHelpOffice(geminiPick: Office | null, queryVectors: Float32Array[]): HelpOffice {
  if (geminiPick) return { ...geminiPick, reason: "gemini" };
  const [closest] = rankOfficesByMeaning(queryVectors, 1);
  if (closest && closest.similarity >= MIN_OFFICE_SIMILARITY) return { ...closest.office, reason: "meaning" };
  const fallbackOffice = OFFICES.find((o) => o.url === DEFAULT_OFFICE_URL) ?? OFFICES[0];
  return { ...fallbackOffice, reason: "default" };
}
