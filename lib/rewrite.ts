/**
 * rewrite.ts: turns a student's message into 1-3 clean search queries before we search
 * (Step A2, prompt log Entry 15).
 *
 * Our search matches words, so "how much $$ to park for the whole yr" or "requirements to declare
 * a CS major" can miss the right page ("yr" isn't "year", "CS" isn't "Computer Science").
 * One small, fast Gemini call rewrites the message into the words CSULB's pages use:
 *   - expands slang and abbreviations ("yr" -> "year", "CS" -> "Computer Science")
 *   - turns a follow-up ("what about for a year?") into a full question, using the chat so far
 *   - splits a two-part question into two queries
 * It only writes search queries. It never answers, and the answer is still written from the
 * sources by the main Gemini call, which sees the student's own words.
 *
 * If this call fails or is slow, we just search with the (spelling-corrected) question as before,
 * so it can never break the app. Its cost doesn't depend on how many pages we have.
 */
import { GoogleGenAI } from "@google/genai";
import { CATEGORIES } from "./categories";
import { OFFICES } from "./directory";
import { errorKind, logUsage } from "./gemini";
import type { ChatMessage } from "./rag";

const DEFAULT_REWRITE_MODEL = "gemini-3.5-flash-lite";
// After this, give up and search with the question as typed. A rewrite normally takes under 1s.
// 3s (5s originally; 2s in Entry 21 was too tight: a follow-up lost its context in Entry 23).
const TIMEOUT_MS = 3_000;
const MAX_QUERIES = 3;

const REWRITE_PROMPT = `You turn a Cal State Long Beach (CSULB) student's message into search queries for a keyword search over official CSULB web pages.

RULES
- Output 1 to ${MAX_QUERIES} short search queries. Never answer the question and never add facts, names, dates, or numbers that the student didn't give.
- Use the words CSULB's pages would use. Expand slang and abbreviations: "CS" -> "Computer Science", "yr" -> "year", "hrs" -> "hours", "dorms" -> "on-campus housing", "gym" or "rec center" -> "Student Recreation and Wellness Center", "calc" -> "calculus".
- Follow-ups: if the message only makes sense with the conversation (for example "what about for a year?"), write the full question it means, using the conversation.
- Two questions in one message: write one query for each.
- Questions about the student's own record ("my grades", "my holds", "did my FAFSA go through"): write a query about HOW to check it (for example "how to check financial aid status To Do List MyCSULB").
- Schoolwork requests (write, rewrite, edit, outline, or finish an essay, paper, discussion post, homework, code, or exam answers, or solve a problem): never search for the content. Write a query for help instead: "University Writing Center appointment" for writing, or "tutoring The Learning Center" for math and other courses.
- Remove personal details: never include student ID numbers, SSNs, names, email addresses, or phone numbers in a query.
- If the message is not about CSULB at all (for example general knowledge, weather, other universities), return it unchanged as a single query. Do not make it sound like a CSULB question.

CSULB WORDS YOU MAY USE (vocabulary only, not facts)
Service areas: ${CATEGORIES.map((c) => c.name).join(", ")}
Offices: ${OFFICES.map((o) => o.name).join("; ")}`;

const QUERY_SCHEMA = {
  type: "object",
  properties: {
    queries: {
      type: "array",
      items: { type: "string" },
      description: `1 to ${MAX_QUERIES} search queries.`,
    },
  },
  required: ["queries"],
};

// Personal details that must never end up in a search query (or in our test results).
// The rewrite prompt also says this; these patterns are the safety net for whatever it misses.
// (Names can't be reliably spotted by a pattern, so for names we rely on the prompt rule.)
const PERSONAL_DETAILS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // email addresses
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSNs like 123-45-6789
  /\(?\b\d{3}\)?[\s.-]\d{3}[.-]\d{4}\b/g, // phone numbers
  /\b\d{6,}\b/g, // long numbers like a 9-digit student ID (course numbers and years are shorter)
];

/** Remove emails, SSNs, phone numbers, and long ID numbers from a piece of text. */
export function removePersonalDetails(text: string) {
  let clean = text;
  for (const pattern of PERSONAL_DETAILS) clean = clean.replace(pattern, " ");
  return clean.replace(/\s+/g, " ").trim();
}

/**
 * Ask Gemini for search queries. Returns null if anything goes wrong (no key, slow, error,
 * unreadable reply); the caller then searches with the question as typed.
 */
export async function rewriteQuestion(question: string, history: ChatMessage[]): Promise<string[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null; // the answer step reports the missing key
  const conversation = history.length
    ? `CONVERSATION SO FAR:\n${history.map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content.slice(0, 300)}`).join("\n")}\n\n`
    : "";
  try {
    const client = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_REWRITE_MODEL?.trim() || DEFAULT_REWRITE_MODEL;
    const interaction = await client.interactions.create(
      {
        model,
        system_instruction: REWRITE_PROMPT,
        input: `${conversation}STUDENT MESSAGE:\n${question}`,
        response_format: { type: "text", mime_type: "application/json", schema: QUERY_SCHEMA },
        // Thinking counts toward max_output_tokens (Entry 14), so keep it minimal and leave room.
        generation_config: { thinking_level: "minimal", max_output_tokens: 1024 },
        store: false, // privacy: don't keep students' questions on Google's servers
      },
      { maxRetries: 0, timeout: TIMEOUT_MS },
    );
    logUsage("rewrite", model, interaction);
    if (interaction.status === "incomplete") throw new Error("reply cut off");
    const parsed = JSON.parse(interaction.output_text ?? "") as { queries?: unknown };
    const queries = (Array.isArray(parsed.queries) ? parsed.queries : [])
      .filter((q): q is string => typeof q === "string")
      .map(removePersonalDetails)
      .filter((q) => q.length > 1)
      .slice(0, MAX_QUERIES);
    return queries.length ? queries : null;
  } catch (err) {
    // Log only what kind of error it was, never the question.
    console.warn(`[rewrite] skipped (${err instanceof SyntaxError ? "unreadable reply" : errorKind(err)}); searching with the question as typed`);
    return null;
  }
}
