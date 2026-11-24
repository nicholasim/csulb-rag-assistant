/**
 * rag.ts: the whole RAG flow in one place:
 *
 *   question -> 1. check the input; crisis messages get CSULB's crisis contacts right away (crisis.ts);
 *                  reply to small talk ("hi", "thanks") right away (small-talk.ts);
 *                  fix typos for searching (spelling.ts)
 *            -> 2. rewrite the question into 1-3 search queries (rewrite.ts), search with each
 *                  query and the question itself, by keywords (retrieval.ts) and by meaning
 *                  (vector-search.ts), and merge the results (rank-merge.ts)
 *            -> 3. nothing matches well? reply with the fallback, no AI needed
 *            -> 4. otherwise ask Gemini, giving it ONLY those chunks (gemini.ts)
 *            -> 5. return the answer + the sources it cited
 */
import { knowledgePageCount, type Chunk } from "./knowledge";
import { search, tokenize, type SearchResult } from "./retrieval";
import { askGemini, CAMPUS_MAP_URL, FALLBACK_SENTENCE, FriendlyError } from "./gemini";
import { REQUEST_BUDGET_MS } from "./deadline";
import { MAX_QUESTION_LENGTH } from "./limits";
import { correctSpelling } from "./spelling";
import { detectSmallTalk, smallTalkReply } from "./small-talk";
import { crisisReply, isCrisisMessage } from "./crisis";
import { officeAt, OFFICES } from "./directory";
import { CATEGORIES, EXAMPLE_QUESTIONS } from "./categories";
import { MIN_OFFICE_SIMILARITY, OFF_TOPIC_SIMILARITY, pickHelpOffice, rankOfficesByMeaning, type HelpOffice } from "./help-office";
import { removePersonalDetails, rewriteQuestion } from "./rewrite";
import { mergeRankings } from "./rank-merge";
import { vectorSearch } from "./vector-search";

export { MAX_QUESTION_LENGTH };

// How many chunks to give Gemini. 8 (was 5, Entry 21): the GE-units section ranked 6th for
// "what GE classes do i need to take". Costs about 1,000 more tokens per question; no extra requests.
const TOP_K = 8;
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
  searchQueries?: string[]; // what we actually searched with (rewritten queries + the question), personal details removed
  examples?: string[]; // example questions shown as buttons (chat replies, and off-topic fallbacks)
  // Fallbacks only: the office that can help (never a dead end; lib/help-office.ts), or null when
  // the question isn't about CSULB at all (offTopic), which shows example questions instead.
  helpOffice?: HelpOffice | null;
  offTopic?: boolean;
  // Crisis replies (lib/crisis.ts): the page shows a plain support icon instead of the mascot (Entry 30).
  crisis?: boolean;
  // Normal answers only: 0-3 suggested next questions, each checked against our pages (cleanFollowUps).
  followUps?: string[];
};

// Every question the app offers as a button: sidebar starters and welcome/example questions.
const PRESET_QUESTIONS = new Set([...CATEGORIES.map((c) => c.starter), ...EXAMPLE_QUESTIONS]);

// Health and medical questions ("what medicine should I take for a headache?") are always about CSULB:
// the fallback shows Student Health Services, never example questions (team rule, Entry 21). We never
// give medical advice; the card points to the people who can. "cold" and "pain" count only next to
// another health word ("cold medicine", "back pain"), so "the library is cold" or "parking is a pain"
// isn't a health question.
const HEALTH_WORDS = /\b(medicines?|medications?|meds|sick|ill|illness|doctors?|nurses?|headaches?|migraines?|fever|symptoms?|prescriptions?|pharmacy|vaccines?|vaccinations?|flu shots?|immuni[sz]ations?|injur(y|ies|ed)|flu|covid|allerg(y|ies|ic)|health|medical|clinic|infections?|sore throat|cough(ing)?|nausea|vomit(ing)?|rash|std|sti|birth control|contracepti\w+|pregnan\w+|stomach ?ache|toothache|sprain(ed)?|antibiotics?|ibuprofen|tylenol|advil)\b/i;
const WEAK_HEALTH_WORDS = /\b(cold|pain|hurts?|aches?)\b/i;

export function isHealthQuestion(text: string) {
  if (HEALTH_WORDS.test(text)) return true;
  // "back pain", "cold medicine": a weak word right next to a body part or another health word.
  return WEAK_HEALTH_WORDS.test(text) && /\b(back|head|neck|chest|stomach|tooth|ear|throat|knee|joint|muscle|chronic|cold (medicine|symptoms)|common cold|caught a cold|have a cold)\b/i.test(text);
}

function studentHealthOffice() {
  return OFFICES.find((o) => /^Student Health Services/i.test(o.name)) ?? null;
}

const MAX_FOLLOW_UPS = 3;
const MAX_FOLLOW_UP_LENGTH = 70; // asked for under 60; a little slack

/**
 * Check Gemini's suggested follow-up questions before showing them (Entry 27). A suggestion is kept
 * only if it's a short, clean question that our own pages can answer: keyword search on it must
 * reach the same bar as the no-AI gate (MIN_SCORE), and its best match must be one of the pages
 * Gemini was shown for this answer (so it stays on topic). No AI call; anything doubtful is dropped.
 */
export function cleanFollowUps(raw: unknown, question: string, results: SearchResult[]): string[] {
  if (!Array.isArray(raw)) return [];
  const shownPages = new Set(results.map((r) => r.chunk.url));
  const seen = new Set([question.trim().toLowerCase()]);
  const kept: string[] = [];
  for (const item of raw) {
    if (kept.length >= MAX_FOLLOW_UPS) break;
    if (typeof item !== "string") continue;
    const text = item.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").replace(/\s+/g, " ").trim();
    if (!text.endsWith("?") || text.length < 8 || text.length > MAX_FOLLOW_UP_LENGTH) continue;
    if (/https?:\/\/|www\./i.test(text) || removePersonalDetails(text) !== text) continue; // links, emails, phone numbers, IDs
    if (isCrisisMessage(text) || detectSmallTalk(text).kind) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    const best = search(text, 1)[0];
    if (!best || best.score < MIN_SCORE || !shownPages.has(best.chunk.url)) continue; // not answerable from these pages
    seen.add(key);
    kept.push(text);
  }
  return kept;
}

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
export function buildInput(question: string, correctedQuestion: string | null, searchQueries: string[], results: SearchResult[], history: ChatMessage[]) {
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
  const queries = searchQueries.length > 1 ? `\n(Search queries we used to find the sources: ${searchQueries.join(" | ")})` : "";
  return `Today's date: ${today}\n\nSOURCES:\n\n${sources}\n\n${conversation}STUDENT QUESTION:\n${question}${spelling}${queries}`;
}

/** The fallback reply, plus a link to look at instead when we have one. */
/**
 * The fallback reply. It always keeps the exact fallback sentence, and it's never a dead end:
 * - about CSULB: a "Who can help" office (lib/help-office.ts), plus a related page if we have one;
 * - not about CSULB ("capital of France"): no office, but what we can help with and 3 example questions.
 */
function fallback(
  where: { suggestion: ChatResponse["suggestion"]; helpOffice: HelpOffice | null },
  model: string | null,
  correctedQuestion: string | null,
  searchQueries: string[],
): ChatResponse {
  const { suggestion, helpOffice } = where;
  const answer = suggestion
    ? `${FALLBACK_SENTENCE} You may find help on this CSULB page: [${suggestion.title}](${suggestion.url})`
    : FALLBACK_SENTENCE;
  const offTopic = !helpOffice;
  return {
    type: "fallback", answer, sources: [], suggestion, model, correctedQuestion, searchQueries,
    helpOffice, offTopic, examples: offTopic ? EXAMPLE_QUESTIONS.slice(0, 3) : undefined,
  };
}

const SLOW_REQUEST_MS = 10_000; // log step timings for questions slower than this
const RESULTS_PER_QUERY = 10; // how deep each search list goes before merging

// Meaning-based search alone can also let a question through to Gemini, if its best match is at
// least this similar (0 to 1). Picked from our test questions (prompt log Entry 16); Infinity = off,
// so only the keyword score decides.
const MIN_SIMILARITY = Infinity;

/**
 * Search with every query, two ways: by keywords (BM25, retrieval.ts) and by meaning (embeddings,
 * vector-search.ts). Then merge all the lists into the TOP_K chunks for Gemini (rank-merge.ts).
 * bestScore / bestSimilarity are the best match from each kind: our "did anything really match?" check.
 */
async function retrieve(queries: string[], meaning?: Promise<Awaited<ReturnType<typeof vectorSearch>>>, deadlineAt?: number) {
  const keywordLists = queries.map((q) => search(q, RESULTS_PER_QUERY));
  // Meaning search: already started by the caller (see answerQuestion), or run now. Empty if unavailable.
  const { lists: meaningLists, queryVectors } = await (meaning ?? vectorSearch(queries, RESULTS_PER_QUERY, deadlineAt));
  const bestScore = Math.max(0, ...keywordLists.map((list) => list[0]?.score ?? 0));
  const bestSimilarity = Math.max(0, ...meaningLists.map((list) => list[0]?.similarity ?? 0));
  const results = mergeRankings(
    [...keywordLists.map((list) => list.map((r) => r.chunk)), ...meaningLists.map((list) => list.map((r) => r.chunk))],
    TOP_K,
  );
  return { results, matched: bestScore >= MIN_SCORE || bestSimilarity >= MIN_SIMILARITY, queryVectors, bestSimilarity };
}

const MAP_SUGGESTION = { title: "CSULB Campus Maps", url: CAMPUS_MAP_URL };

/** Answer one student question. Throws FriendlyError for problems we can explain. */
/**
 * A progress step, sent to the page while a question is being answered (Entry 29). Only steps that
 * really happen, in order: "searching" when the search starts, "reading" when the retrieved sections
 * go to Gemini. Crisis replies, small talk and input errors send none; a fallback that never reaches
 * Gemini only sends "searching".
 */
export type Stage = { stage: "searching"; pages: number } | { stage: "reading"; sections: number };

export async function answerQuestion(rawQuestion: unknown, rawHistory: unknown = [], onStage: (stage: Stage) => void = () => {}): Promise<ChatResponse> {
  // 1. Check the input.
  if (typeof rawQuestion !== "string" || rawQuestion.trim() === "") {
    throw new FriendlyError("empty_question", "Please type a question first.", 400);
  }
  const question = rawQuestion.trim();
  // The whole question has REQUEST_BUDGET_MS (28s) from here: every Gemini step gets the smaller of
  // its own limit and the time left, so a student never waits longer than that (Entry 28).
  const startedAt = Date.now();
  const deadlineAt = startedAt + REQUEST_BUDGET_MS;
  const timing = { rewrite: 0, embed: 0, answer: 0 };
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

  // Safety first: a message about a crisis, self-harm, suicide, or feeling unsafe always gets
  // CSULB's crisis contacts (lib/crisis.ts), never the fallback. No search, no AI.
  if (isCrisisMessage(question)) {
    const { answer, chunks } = crisisReply();
    const sources = chunks.length
      ? [{ id: 1, title: chunks[0].title, url: chunks[0].url, category: chunks[0].category, excerpt: bestExcerpt(chunks, question, answer) }]
      : [];
    return { type: "answer", answer, sources, suggestion: null, model: null, correctedQuestion: null, crisis: true };
  }

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
  onStage({ stage: "searching", pages: knowledgePageCount() });
  const spelling = correctSpelling(smallTalk.rest);
  const searchText = spelling.corrected;
  const correctedQuestion = spelling.changes.length ? searchText : null;

  // 2. Rewrite the question into search queries ("CS major" -> "Computer Science major"; a follow-up
  //    becomes a full question). We always search with the question itself too, so a bad rewrite
  //    can't hide an obvious match. Personal details (IDs, emails, phone numbers) are removed first.
  //    Preset questions (sidebar starters, welcome examples) skip the rewrite: they're already
  //    clear, they find the right page as written (tests/preset-questions.json), and skipping
  //    saves one Gemini request per click and one thing that can fail (Entry 20).
  //    Speed (Entry 21): the meaning search for the question as typed starts right away, at the same
  //    time as the rewrite, instead of waiting for it (saves about 0.4s). Keyword search still uses
  //    every rewritten query.
  const typedQuery = removePersonalDetails(searchText);
  const embedStart = Date.now();
  const meaning = vectorSearch([typedQuery], RESULTS_PER_QUERY, deadlineAt).finally(() => (timing.embed = Date.now() - embedStart));
  const rewriteStart = Date.now();
  const rewritten = PRESET_QUESTIONS.has(question.trim()) ? null : await rewriteQuestion(smallTalk.rest, history, deadlineAt);
  timing.rewrite = Date.now() - rewriteStart;
  const searchQueries = [...new Set([typedQuery, ...(rewritten ?? []).map(removePersonalDetails)].filter(Boolean))];
  let { results, matched, queryVectors, bestSimilarity } = await retrieve(searchQueries, meaning);

  // If the rewrite failed, a follow-up like "the second one" matches nothing on its own,
  // so if the search is weak we search again together with the previous question (the old way).
  const lastUserQuestion = [...history].reverse().find((m) => m.role === "user")?.content;
  if (!rewritten && !matched && lastUserQuestion) {
    const retryQuery = removePersonalDetails(`${correctSpelling(lastUserQuestion).corrected} ${searchText}`);
    ({ results, matched, queryVectors, bestSimilarity } = await retrieve([retryQuery], undefined, deadlineAt));
    searchQueries.push(retryQuery);
  }

  // 3. Nothing matched well enough: fall back without calling the AI. If even the closest chunk
  //    is far from the question's meaning, it isn't about CSULB ("capital of France"): no office.
  //    Otherwise point to the office closest in meaning, or Dean of Students.
  const health = isHealthQuestion(searchText);
  if (!matched) {
    // (A strong office match wins first: "harassment" alone matches few page words but clearly
    //  belongs to the Title IX office. A health question always gets Student Health Services.)
    const strongOffice = (rankOfficesByMeaning(queryVectors, 1)[0]?.similarity ?? 0) >= MIN_OFFICE_SIMILARITY;
    const offTopic = !health && queryVectors.length > 0 && !strongOffice && bestSimilarity < OFF_TOPIC_SIMILARITY;
    return fallback(
      {
        suggestion: !offTopic && isMapQuestion(searchText) ? MAP_SUGGESTION : null,
        helpOffice: offTopic ? null : pickHelpOffice(health ? studentHealthOffice() : null, queryVectors),
      },
      null,
      correctedQuestion,
      searchQueries,
    );
  }

  // 4. Ask Gemini, giving it only the retrieved chunks.
  onStage({ stage: "reading", sections: results.length });
  const answerStart = Date.now();
  let reply: Awaited<ReturnType<typeof askGemini>>["reply"];
  let model: string;
  try {
    ({ reply, model } = await askGemini(buildInput(question, correctedQuestion, searchQueries, results, history), deadlineAt));
  } finally {
    timing.answer = Date.now() - answerStart;
    // Slow questions get one line of timings (numbers only), so a slow request can be explained.
    const total = Date.now() - startedAt;
    if (total > SLOW_REQUEST_MS) console.warn(`[timing] rewrite=${timing.rewrite}ms embed=${timing.embed}ms answer=${timing.answer}ms total=${total}ms`);
  }

  // 5. Shape the response.
  if (reply.type === "fallback") {
    // Not about CSULB at all (Gemini's about_csulb): no office, show what we can help with.
    // Health and medical questions always count as CSULB (Student Health Services), whatever Gemini says.
    if (reply.about_csulb === false && !health) {
      return fallback({ suggestion: null, helpOffice: null }, model, correctedQuestion, searchQueries);
    }
    // About CSULB: a related page if we have one (the campus maps page for map questions), and
    // always a "Who can help" office: Gemini's pick, else the closest by meaning, else the default.
    const related = results[reply.related_source - 1]?.chunk;
    const suggestion = isMapQuestion(searchText) ? MAP_SUGGESTION : related ? { title: related.title, url: related.url } : null;
    const helpOffice = pickHelpOffice(health ? studentHealthOffice() : officeAt(reply.related_office), queryVectors);
    return fallback({ suggestion, helpOffice }, model, correctedQuestion, searchQueries);
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

  // Follow-up suggestions: only on normal answers, and only ones our pages can answer (Entry 27).
  const followUps = reply.type === "answer" ? cleanFollowUps(reply.follow_ups, question, results) : [];
  if (reply.type === "answer") {
    console.info(`[follow-ups] suggested=${Array.isArray(reply.follow_ups) ? reply.follow_ups.length : 0} kept=${followUps.length}`);
    // Testing only (off by default): show what Gemini suggested and what the filter kept.
    if (process.env.DEBUG_FOLLOW_UPS === "1") console.info(`[follow-ups] raw=${JSON.stringify(reply.follow_ups)} kept=${JSON.stringify(followUps)}`);
  }

  return { type: reply.type, answer, sources, suggestion: null, model, correctedQuestion, searchQueries, ...(followUps.length ? { followUps } : {}) };
}
