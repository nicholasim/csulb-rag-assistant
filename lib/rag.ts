/**
 * rag.ts: the whole RAG flow in one place:
 *
 *   question -> 1. check the input
 *            -> 2. retrieve the best-matching CSULB chunks (retrieval.ts)
 *            -> 3. nothing matches well? reply with the fallback, no AI needed
 *            -> 4. otherwise ask Gemini, giving it ONLY those chunks (gemini.ts)
 *            -> 5. return the answer + the sources it cited
 */
import type { Chunk } from "./knowledge";
import { search, tokenize, type SearchResult } from "./retrieval";
import { askGemini, CAMPUS_MAP_URL, FALLBACK_SENTENCE, FriendlyError } from "./gemini";

export const MAX_QUESTION_LENGTH = 500;
const TOP_K = 5; // how many chunks to give Gemini
// If the best chunk scores below this, the question matched almost nothing in our sources
// (usually just one common word), so we skip the AI and reply with the fallback.
// We picked 3.0 by testing real questions: answerable ones scored 4 to 21.
const MIN_SCORE = 3.0;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Source = {
  id: number; // the [n] number used in the answer
  title: string;
  url: string;
  category: string;
  excerpt: string; // a short quote from the chunk
};

export type ChatResponse = {
  type: "answer" | "clarify" | "fallback";
  answer: string;
  sources: Source[]; // sources cited in the answer
  suggestion: { title: string; url: string } | null; // for fallbacks: where to look instead
};

/** Is the student asking for a map or how to get around? */
function isMapQuestion(question: string) {
  return /\b(maps?|directions?|get around|getting around|navigate|find (a |the )?building|where is (the )?\w+ (building|hall))\b/i.test(question);
}

/**
 * Make a short, readable excerpt for a source chip: the line of the chunk that best supports
 * the answer. We compare each line with the answer sentences that cite this source.
 * Shared numbers (prices, dates, phone numbers) count the most, then shared words.
 */
function makeExcerpt(chunk: Chunk, question: string, citingText: string) {
  const questionWords = new Set(tokenize(question));
  const answerWords = new Set(tokenize(citingText));
  const lines = chunk.text
    .split("\n")
    .map((line) =>
      line
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
        .replace(/[*_#>]|^\s*-\s+|\|\s*-{3,}\s*/g, "") // Markdown symbols
        .replace(/\s*\|\s*/g, " | ")
        .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 20);
  let best = lines[0] ?? "";
  let bestScore = -1;
  for (const line of lines) {
    let score = 0;
    for (const word of new Set(tokenize(line))) {
      if (answerWords.has(word)) score += /^\d+$/.test(word) ? 3 : 1;
      else if (questionWords.has(word)) score += 1;
    }
    if (score > bestScore) [best, bestScore] = [line, score];
  }
  if (best.length <= 280) return best;
  // A long table row: shorten the first (description) cell so the dates/prices at the end still show.
  const cells = best.split(" | ");
  if (cells.length > 1) {
    const rest = cells.slice(1).join(" | ");
    const room = Math.max(60, 280 - rest.length - 6);
    return `${cells[0].slice(0, room)}... | ${rest}`.slice(0, 400);
  }
  return `${best.slice(0, 277)}...`;
}

/** The sentences of the answer that cite source number n, e.g. "...is $259 [5]." */
function sentencesCiting(answer: string, n: number) {
  return answer
    .split(/(?<=[.!?])\s+|\n/)
    .filter((sentence) =>
      [...sentence.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].some((m) => m[1].split(",").map(Number).includes(n)),
    )
    .join(" ")
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ""); // drop the [1] markers so "1" doesn't count as a fact
}

// Patterns for the contact details we double-check.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\(?\b\d{3}\)?[\s.-]\d{3}[.-]\d{4}\b/g;
const digitsOf = (phone: string) => phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const normalizeUrl = (url: string) => url.replace(/[.,;:]+$/, "").replace(/\/$/, "");

/**
 * Safety check: every email, phone number, and link in the AI's answer must appear in the
 * retrieved CSULB sources. Anything that doesn't is removed, so a student never sees contact
 * details the AI made up (we caught a smaller model changing one letter of an email address).
 */
export function removeUnverifiedDetails(answer: string, results: SearchResult[]) {
  const sourceText = results.map((r) => r.chunk.text).join("\n");
  const knownEmails = new Set((sourceText.match(EMAIL) ?? []).map((e) => e.toLowerCase()));
  const knownPhones = new Set((sourceText.match(PHONE) ?? []).map(digitsOf));
  const knownUrls = new Set(
    [...sourceText.matchAll(/\]\(([^)\s]+)/g), ...sourceText.matchAll(/(https?:\/\/[^\s)\]]+)/g)]
      .map((m) => normalizeUrl(m[1]))
      .concat(normalizeUrl(CAMPUS_MAP_URL)),
  );

  const isVerified = (detail: string): boolean => {
    if (detail.startsWith("mailto:")) return isVerified(detail.slice(7));
    if (detail.startsWith("tel:")) return knownPhones.has(digitsOf(detail));
    if (detail.includes("@") && !detail.startsWith("http")) return knownEmails.has(detail.toLowerCase());
    if (/^https?:\/\//.test(detail)) return knownUrls.has(normalizeUrl(detail));
    return knownPhones.has(digitsOf(detail));
  };
  const removed: string[] = [];
  const REPLACEMENT = "(see the source page for contact details)";
  // Check a piece of plain text for bare emails and phone numbers.
  const cleanText = (text: string) =>
    text.replace(new RegExp(`${EMAIL.source}|${PHONE.source}`, "g"), (detail) => {
      if (isVerified(detail)) return detail;
      removed.push(detail);
      return REPLACEMENT;
    });

  // Markdown links [text](address), then bare links, then everything else.
  const cleaned = answer.replace(/\[([^\]]*)\]\(([^)\s]+)\)|(https?:\/\/[^\s)\]]+)/g, (match, text, href, bareUrl) => {
    const address = href ?? bareUrl;
    if (isVerified(address)) return href ? `[${cleanText(text)}](${href})` : match;
    removed.push(address);
    return href ? cleanText(text) : "(link removed)"; // keep the link's words, drop the bad address
  });
  // Bare emails/phones outside links. (Link addresses are skipped so they aren't checked twice.)
  const final = cleaned
    .split(/(\]\([^)]*\))/)
    .map((part) => (part.startsWith("](") ? part : cleanText(part)))
    .join("");

  if (removed.length) {
    console.warn(`[rag] removed ${removed.length} contact detail(s) not found in the sources`);
    return `${final}\n\n_Some contact details were removed because they didn't match the CSULB sources. Please check the source page._`;
  }
  return final;
}

/** Build the message for Gemini: today's date, numbered sources, recent chat, and the question. */
function buildInput(question: string, results: SearchResult[], history: ChatMessage[]) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const sources = results
    .map(({ chunk }, i) => `[${i + 1}] ${chunk.title} > ${chunk.heading}\nURL: ${chunk.url}\n${chunk.text}`)
    .join("\n\n---\n\n");
  const conversation = history.length
    ? `CONVERSATION SO FAR (for context only, not a source):\n${history
        .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content.slice(0, 600)}`)
        .join("\n")}\n\n`
    : "";
  return `Today's date: ${today}\n\nSOURCES:\n\n${sources}\n\n${conversation}STUDENT QUESTION:\n${question}`;
}

/** The fallback reply, plus a link to look at instead when we have one. */
function fallback(suggestion: ChatResponse["suggestion"]): ChatResponse {
  const answer = suggestion
    ? `${FALLBACK_SENTENCE} You may find help on this CSULB page: [${suggestion.title}](${suggestion.url})`
    : FALLBACK_SENTENCE;
  return { type: "fallback", answer, sources: [], suggestion };
}

const MAP_SUGGESTION = { title: "CSULB Campus Maps", url: CAMPUS_MAP_URL };

/** Answer one student question. Throws FriendlyError for problems we can explain. */
export async function answerQuestion(rawQuestion: unknown, rawHistory: unknown = []): Promise<ChatResponse> {
  // 1. Check the input.
  if (typeof rawQuestion !== "string" || rawQuestion.trim() === "") {
    throw new FriendlyError("empty_question", "Please type a question first.", 400);
  }
  const question = rawQuestion.trim();
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new FriendlyError(
      "question_too_long",
      `Your question is ${question.length} characters long. Please shorten it to ${MAX_QUESTION_LENGTH} characters or less.`,
      400,
    );
  }
  // Keep only the last 6 well-formed messages of chat history.
  const history: ChatMessage[] = (Array.isArray(rawHistory) ? rawHistory : [])
    .filter((m): m is ChatMessage => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .slice(-6);

  // 2. Retrieve. A follow-up like "the second one" matches nothing on its own,
  //    so if the first search is weak we search again together with the previous question.
  let results = search(question, TOP_K);
  const lastUserQuestion = [...history].reverse().find((m) => m.role === "user")?.content;
  if ((results[0]?.score ?? 0) < MIN_SCORE && lastUserQuestion) {
    results = search(`${lastUserQuestion} ${question}`, TOP_K);
  }

  // 3. Nothing matched well enough: fall back without calling the AI.
  if ((results[0]?.score ?? 0) < MIN_SCORE) {
    return fallback(isMapQuestion(question) ? MAP_SUGGESTION : null);
  }

  // 4. Ask Gemini, giving it only the retrieved chunks.
  const reply = await askGemini(buildInput(question, results, history));

  // 5. Shape the response.
  if (reply.type === "fallback") {
    const related = results[reply.related_source - 1]?.chunk;
    const suggestion = isMapQuestion(question)
      ? MAP_SUGGESTION
      : related
        ? { title: related.title, url: related.url }
        : null;
    return fallback(suggestion);
  }

  // Double-check contact details against the sources before showing anything.
  const answer = removeUnverifiedDetails(reply.answer, results);

  // Which sources did the answer actually cite? "[1]", "[2, 3]" and "[1][2]" all count.
  const citedNumbers = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of match[1].split(",")) citedNumbers.add(Number(n.trim()));
  }
  const sources = [...citedNumbers]
    .filter((n) => n >= 1 && n <= results.length)
    .sort((a, b) => a - b)
    .map((n) => {
      const { chunk } = results[n - 1];
      const excerpt = makeExcerpt(chunk, question, sentencesCiting(answer, n));
      return { id: n, title: chunk.title, url: chunk.url, category: chunk.category, excerpt };
    });

  return { type: reply.type, answer, sources, suggestion: null };
}
