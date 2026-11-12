/**
 * rag.ts: the whole RAG flow in one place:
 *
 *   question -> 1. check the input; reply to small talk ("hi", "thanks") right away (small-talk.ts);
 *                  fix typos for searching (spelling.ts)
 *            -> 2. retrieve the best-matching CSULB chunks (retrieval.ts)
 *            -> 3. nothing matches well? reply with the fallback, no AI needed
 *            -> 4. otherwise ask Gemini, giving it ONLY those chunks (gemini.ts)
 *            -> 5. return the answer + the sources it cited
 */
import type { Chunk } from "./knowledge";
import { search, tokenize, type SearchResult } from "./retrieval";
import { askGemini, CAMPUS_MAP_URL, FALLBACK_SENTENCE, FriendlyError } from "./gemini";
import { MAX_QUESTION_LENGTH } from "./limits";
import { correctSpelling } from "./spelling";
import { detectSmallTalk, smallTalkReply } from "./small-talk";

export { MAX_QUESTION_LENGTH };

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
  excerpt: string; // a short quote from the page (one or two lines, separated by "\n")
};

export type ChatResponse = {
  type: "answer" | "clarify" | "fallback" | "chat"; // chat = a reply to small talk, no AI and no sources
  answer: string;
  sources: Source[]; // sources cited in the answer
  suggestion: { title: string; url: string } | null; // for fallbacks: where to look instead
  model: string | null; // which Gemini model wrote the reply (null = no AI was needed)
  correctedQuestion: string | null; // the question with typos fixed, if we fixed any ("Showing results for: ...")
  examples?: string[]; // chat replies only: example questions shown as buttons
};

/** Is the student asking for a map or how to get around? */
function isMapQuestion(question: string) {
  return /\b(maps?|directions?|get around|getting around|navigate|find (a |the )?building|where is (the )?\w+ (building|hall))\b/i.test(question);
}

// A citation like [1] or [2, 3] (but not a Markdown link like [text](url)).
const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g;

/** One Markdown line as plain text: [text](url) -> text, no **, #, or leading "- ". */
function plainText(line: string) {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/^\s*-\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const isTableRow = (line: string) => line.trim().startsWith("|");
const isTableDivider = (line: string) => /^\s*\|\s*:?-{3,}/.test(line);
const tableCells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map(plainText);
const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * The lines of a chunk that could be quoted on a source chip, as plain text.
 * Table rows get their column names, so "| Student Semester | $250 | ... | $259 |" becomes
 * "Student Semester, FY23/24: $250; ...; FY26/27: $259". If the answer names a column
 * (like "Spring 2027"), only that column is shown.
 */
function excerptCandidates(chunk: Chunk, citingText: string): { text: string; fromTable: boolean }[] {
  const lines = chunk.text.split("\n");
  const candidates: { text: string; fromTable: boolean }[] = [];
  let header: string[] = [];
  lines.forEach((line, i) => {
    if (!isTableRow(line)) {
      header = [];
      if (/^\s*#/.test(line)) return; // headings aren't quotes
      const text = plainText(line);
      if (text.length > 20) candidates.push({ text, fromTable: false });
      return;
    }
    if (isTableDivider(line)) return;
    if (isTableDivider(lines[i + 1] ?? "")) {
      header = tableCells(line); // the row right above "| --- |" holds the column names
      return;
    }
    const [label, ...values] = tableCells(line);
    let pairs = values
      .map((value, j) => ({ name: header[j + 1] ?? "", value }))
      .filter((p) => p.value);
    const named = pairs.filter((p) => p.name && citingText.toLowerCase().includes(p.name.toLowerCase()));
    if (named.length > 0 && named.length < pairs.length) pairs = named;
    const valuesText = pairs.map((p) => (p.name ? `${p.name}: ${p.value}` : p.value)).join("; ");
    candidates.push({ text: valuesText ? `${shorten(label, 140)}, ${valuesText}` : label, fromTable: true });
  });
  return candidates;
}

/**
 * Pick the excerpt for a source chip: the line(s) that best support the answer text citing this
 * source. Numbers the answer uses (prices, dates, phone numbers) count far more than shared words,
 * because they're what a student wants to double-check. Table rows that contain one of those
 * numbers get a small bonus, since pages list official prices and dates in tables. If a second
 * line backs up a number the first line doesn't (e.g. $259 per semester AND $518 per year),
 * it's shown too, on its own line.
 */
export function bestExcerpt(chunks: Chunk[], question: string, citingText: string) {
  const questionWords = new Set(tokenize(question));
  const answerWords = new Set(tokenize(citingText));
  const isNumber = (word: string) => /^\d+$/.test(word);

  const scored = chunks
    .flatMap((chunk) => excerptCandidates(chunk, citingText))
    .map(({ text: line, fromTable }) => {
      const words = new Set(tokenize(line));
      let score = 0;
      for (const word of words) {
        if (answerWords.has(word)) score += isNumber(word) ? 10 : 1;
        else if (questionWords.has(word)) score += 1;
      }
      const numbers = [...words].filter((w) => isNumber(w) && answerWords.has(w));
      if (fromTable && numbers.length > 0) score += 5;
      return { line, score, numbers };
    })
    .sort((a, b) => b.score - a.score);

  const [first, ...rest] = scored;
  if (!first) return "";
  const second = rest.find((c) => c.numbers.some((n) => !first.numbers.includes(n)) && c.score >= first.score / 2);
  return [first, second]
    .filter(Boolean)
    .map((c) => shorten(c!.line, 240))
    .join("\n");
}

/**
 * The paragraphs of the answer that cite source number n. (A paragraph or list ends with one
 * citation that covers all of it, so we look at the whole paragraph, not just one sentence.)
 */
function textCiting(answer: string, n: number) {
  return answer
    .split(/\n{2,}/)
    .filter((paragraph) =>
      [...paragraph.matchAll(CITATION)].some((m) => m[1].split(",").map(Number).includes(n)),
    )
    .join(" ")
    .replace(CITATION, ""); // drop the [1] markers so "1" doesn't count as a fact
}

/**
 * Cite once per paragraph or list: inside a paragraph, each source number is kept only at its
 * LAST appearance. "A [1]. B [1]. C [1]." becomes "A. B. C. [1]", and "A [1, 2]. B [2]." becomes
 * "A [1]. B [2]." Different sources ("A [1], but B [2]") are all kept.
 */
export function citeOncePerParagraph(text: string) {
  return text
    .split(/(\n{2,})/)
    .map((paragraph) => {
      const groups = [...paragraph.matchAll(CITATION)].map((m) => m[1].split(",").map((s) => s.trim()));
      let index = 0;
      return paragraph
        .replace(CITATION, () => {
          const later = groups.slice(index + 1).flat();
          const keep = groups[index].filter((n) => !later.includes(n)); // numbers cited again later move there
          index++;
          return keep.length ? `[${keep.join(", ")}]` : "";
        })
        .replace(/[ \t]+([.,;:!?])/g, "$1")
        .replace(/[ \t]+$/gm, ""); // no trailing spaces where a citation was removed
    })
    .join("");
}

/**
 * Renumber citations 1, 2, 3... in the order they first appear in the answer, with no gaps.
 * Gemini numbers its sources by search rank (it might cite only [5]), and two chunks can come
 * from the same web page. Here every page gets ONE number, so each page gets one chip.
 */
export function renumberCitations(answer: string, results: SearchResult[]) {
  const numberForPage = new Map<string, number>(); // page url -> new number
  const chunksForNumber = new Map<number, Chunk[]>(); // new number -> the chunks it covers

  const text = answer
    .replace(CITATION, (_, nums: string) => {
      const ids: number[] = [];
      for (const n of nums.split(",").map((s) => Number(s.trim()))) {
        const chunk = results[n - 1]?.chunk;
        if (!chunk) continue; // a number we never gave Gemini: drop it
        if (!numberForPage.has(chunk.url)) numberForPage.set(chunk.url, numberForPage.size + 1);
        const id = numberForPage.get(chunk.url)!;
        const chunks = chunksForNumber.get(id) ?? [];
        if (!chunks.includes(chunk)) chunksForNumber.set(id, [...chunks, chunk]);
        if (!ids.includes(id)) ids.push(id);
      }
      return ids.length ? `[${ids.sort((a, b) => a - b).join(", ")}]` : "";
    })
    .replace(/(\[\d+(?:, \d+)*\])(\s*\1)+/g, "$1") // "[1] [1]" -> "[1]"
    .replace(/[ \t]+([.,;:!?])/g, "$1"); // tidy "word ." left behind by a dropped citation

  return { text, chunksForNumber };
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
      // Each source page's own address counts too (it's in the file header, not the page text).
      .concat(results.map((r) => normalizeUrl(r.chunk.url)))
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

/**
 * Build the message for Gemini: today's date, numbered sources, recent chat, and the question.
 * If we fixed typos, Gemini gets the student's own words AND the fixed version, so it can
 * tell if our fix changed what the student meant.
 */
function buildInput(question: string, correctedQuestion: string | null, results: SearchResult[], history: ChatMessage[]) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const sources = results
    .map(({ chunk }, i) => `[${i + 1}] ${chunk.title} > ${chunk.heading}\nURL: ${chunk.url}\n${chunk.text}`)
    .join("\n\n---\n\n");
  const conversation = history.length
    ? `CONVERSATION SO FAR (for context only, not a source):\n${history
        .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content.slice(0, 600)}`)
        .join("\n")}\n\n`
    : "";
  const spelling = correctedQuestion ? `\n(Spelling-corrected version we searched with: ${correctedQuestion})` : "";
  return `Today's date: ${today}\n\nSOURCES:\n\n${sources}\n\n${conversation}STUDENT QUESTION:\n${question}${spelling}`;
}

/** The fallback reply, plus a link to look at instead when we have one. */
function fallback(suggestion: ChatResponse["suggestion"], model: string | null, correctedQuestion: string | null): ChatResponse {
  const answer = suggestion
    ? `${FALLBACK_SENTENCE} You may find help on this CSULB page: [${suggestion.title}](${suggestion.url})`
    : FALLBACK_SENTENCE;
  return { type: "fallback", answer, sources: [], suggestion, model, correctedQuestion };
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

  // Small talk ("hi", "thanks", "what can you do?") gets a fixed friendly reply: no search, no AI.
  // A greeting plus a real question ("hi, how much is parking?") continues below,
  // searching with just the question part ("how much is parking?").
  const smallTalk = detectSmallTalk(question);
  if (smallTalk.kind) {
    const { answer, examples } = smallTalkReply(smallTalk.kind);
    return { type: "chat", answer, sources: [], suggestion: null, model: null, correctedQuestion: null, examples };
  }

  // Fix typos ("parkng" -> "parking") so the word-matching search can find the right pages.
  // We search with the fixed question; Gemini sees both versions (see buildInput).
  const spelling = correctSpelling(smallTalk.rest);
  const searchText = spelling.corrected;
  const correctedQuestion = spelling.changes.length ? searchText : null;

  // 2. Retrieve. A follow-up like "the second one" matches nothing on its own,
  //    so if the first search is weak we search again together with the previous question.
  let results = search(searchText, TOP_K);
  const lastUserQuestion = [...history].reverse().find((m) => m.role === "user")?.content;
  if ((results[0]?.score ?? 0) < MIN_SCORE && lastUserQuestion) {
    results = search(`${correctSpelling(lastUserQuestion).corrected} ${searchText}`, TOP_K);
  }

  // 3. Nothing matched well enough: fall back without calling the AI.
  if ((results[0]?.score ?? 0) < MIN_SCORE) {
    return fallback(isMapQuestion(searchText) ? MAP_SUGGESTION : null, null, correctedQuestion);
  }

  // 4. Ask Gemini, giving it only the retrieved chunks.
  const { reply, model } = await askGemini(buildInput(question, correctedQuestion, results, history));

  // 5. Shape the response.
  if (reply.type === "fallback") {
    const related = results[reply.related_source - 1]?.chunk;
    const suggestion = isMapQuestion(searchText)
      ? MAP_SUGGESTION
      : related
        ? { title: related.title, url: related.url }
        : null;
    return fallback(suggestion, model, correctedQuestion);
  }

  // Double-check contact details against the sources before showing anything.
  const checked = removeUnverifiedDetails(reply.answer, results);

  // Renumber the citations 1, 2, 3 (one number per web page), then build one chip per page.
  // Then keep one citation per paragraph or list.
  const { text: renumbered, chunksForNumber } = renumberCitations(checked, results);
  const answer = citeOncePerParagraph(renumbered);
  const sources = [...chunksForNumber.entries()].map(([id, chunks]) => ({
    id,
    title: chunks[0].title,
    url: chunks[0].url,
    category: chunks[0].category,
    excerpt: bestExcerpt(chunks, searchText, textCiting(answer, id)),
  }));

  return { type: reply.type, answer, sources, suggestion: null, model, correctedQuestion };
}
