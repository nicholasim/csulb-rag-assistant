/**
 * gemini.ts: sends the retrieved CSULB sources + the question to Gemini (the "G" in RAG).
 *
 * Only server code imports this file. The API key is read from the GEMINI_API_KEY
 * environment variable at request time and is never logged or sent to the browser.
 */
import { GoogleGenAI } from "@google/genai";

export const FALLBACK_SENTENCE = "I do not have enough information in the provided CSULB sources.";
export const CAMPUS_MAP_URL = "https://www.csulb.edu/maps";
// Main model: the fast, low-cost Flash-Lite. (We switched from gemini-3.8-flash because our
// free-tier project was rate-limited on it for a whole day of testing.) Override with GEMINI_MODEL.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
// If the main model is busy or rate-limited, we try this one once. Override with GEMINI_BACKUP_MODEL.
const DEFAULT_BACKUP_MODEL = "gemini-3.8-flash";

// The rules Gemini must follow. This is the most important part of keeping answers grounded.
const SYSTEM_PROMPT = `You are the CSULB Services Assistant. You help Cal State Long Beach students find information about university services.

GROUNDING RULES
- Answer ONLY from the numbered SOURCES in the message. Never use outside knowledge, even if you think you know the answer.
- Never invent or guess phone numbers, emails, names, dates, prices, hours, or links. Copy them exactly from the sources.
- If the sources only answer part of the question, answer that part and say plainly which part the sources don't cover.

CITATIONS
- Cite with the source numbers given, like [1] or [2, 3].
- Cite ONCE per paragraph or list: put the citation at the end of the paragraph, or at the end of the sentence that introduces a list. Do not put a citation after every bullet.
- Only cite what the source actually says. A citation means "the source states this".
- If you add something the sources don't state (for example, comparing a deadline with today's date to say it has passed), put it in its own short sentence or paragraph with NO citation, and keep it to plain facts. When in doubt, leave it out.

WHEN TO USE EACH RESPONSE TYPE
- "answer": the sources contain the information the student asked for.
- "clarify": the question is too vague to answer because it could mean several different services (for example "How do I apply?" could mean admission, scholarships, graduation, or financial aid). Ask ONE short clarifying question that lists the likely options, like: "Do you mean admission, scholarships, graduation, financial aid, or something else?" Do not answer yet.
- "fallback": the sources do not actually answer the question. This includes:
  * places or things off campus (for example restaurants near campus). A source about something on campus does not answer a question about what is near or off campus;
  * opinions or rankings (for example "best professor"), personal student records, or anything the sources don't cover;
  * sources that are only loosely related (sharing a few words is not enough).
  For "fallback", set answer to exactly: "${FALLBACK_SENTENCE}" and set related_source to the number of the source from the CSULB office or department that would handle this kind of question, or 0 if none of the sources fit.

SPECIAL CASES
- Conflicting sources: for any date, deadline, price, or hours question, first check EVERY source for the same item, including rows that describe it in other words or say they are "the same day as" it. If two sources (or two parts of one source) give different values, show both values with their citations and tell the student to confirm with the office. Example: "The registration table lists Feb. 3, 2027 [1], but the refund table lists Feb. 2, 2027 for the same deadline [2]. Please confirm with Enrollment Services." (This is the one case where citing two sentences in a row is right.)
- Advising contacts: if a source lists an advising center with a "Contact & Location" link instead of a phone number or email, name the advising center and give that link. Do not make up contact details.
- Maps and getting around campus: you may always point students to the official campus maps page, ${CAMPUS_MAP_URL}, in addition to what the sources say.
- Do not give medical, legal, or financial advice. You may describe which CSULB services exist and how to contact them.
- Never ask for personal information (student ID, SSN, birth date, grades, health details). If a student shares some, don't repeat it.

LENGTH AND SHAPE (for "answer")
- 2 to 4 sentences. Start with the direct answer. Then add ONE useful related detail and ONE next step, but only if the sources have them.
  Shape: "[Direct answer, e.g. the price or date asked about]. [One related detail, e.g. a yearly price or another term]. [Next step, e.g. where or how to do it, with its link]. [n]"
  (This is only a shape. Take every fact from the SOURCES, never from this example.)
- Use a short bullet list only when the student asks for several items (like hours for several services, or a list of names). Introduce it with one sentence and cite that sentence.
- Friendly and plain. Include helpful links from the sources as Markdown links.`;

// Gemini must reply in this JSON shape, so our code can tell answers, clarifying
// questions, and fallbacks apart without guessing from the text.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["answer", "clarify", "fallback"],
      description: "answer = sources answer the question; clarify = question is ambiguous; fallback = sources don't answer it.",
    },
    answer: {
      type: "string",
      description: "The reply to the student in Markdown, with [n] citations. For clarify, the clarifying question. For fallback, exactly the fallback sentence.",
    },
    related_source: {
      type: "integer",
      description: "Only for fallback: the number of the most related CSULB department source, or 0 if none. Use 0 for answer and clarify.",
    },
  },
  required: ["type", "answer", "related_source"],
};

export type GeminiReply = {
  type: "answer" | "clarify" | "fallback";
  answer: string;
  related_source: number;
};

/** A problem we can explain to the student in friendly words. */
export class FriendlyError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
  }
}

/** Is the API key set? (Checked before every Gemini call.) */
export function hasApiKey() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Ask Gemini. `input` already contains the sources, conversation, and question.
 * Returns Gemini's reply and the name of the model that wrote it (main or backup).
 */
export async function askGemini(input: string): Promise<{ reply: GeminiReply; model: string }> {
  if (!hasApiKey()) {
    throw new FriendlyError(
      "missing_api_key",
      "The assistant isn't set up yet: the Gemini API key is missing. (For the team: add GEMINI_API_KEY to .env.local, or to the Vercel project settings.)",
      500,
    );
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const mainModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const backupModel = process.env.GEMINI_BACKUP_MODEL?.trim() || DEFAULT_BACKUP_MODEL;

  const callModel = (model: string, maxRetries: number, timeout: number) =>
    client.interactions.create(
      {
        model,
        system_instruction: SYSTEM_PROMPT,
        input,
        response_format: { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA },
        generation_config: { thinking_level: "low", max_output_tokens: 2048 },
        store: false, // privacy: don't keep students' questions on Google's servers
      },
      { maxRetries, timeout },
    );

  let outputText: string | undefined;
  let usedModel = mainModel;
  try {
    let interaction;
    try {
      // No retries on the main model: if it's busy, switching to the backup is faster.
      interaction = await callModel(mainModel, 0, 20_000);
    } catch (err) {
      // Main model overloaded (503), rate-limited (429), erroring (500+), or timed out (no status)?
      // Try the backup model before giving up. Other errors (bad key, bad model name) won't
      // be fixed by switching, so we report those right away.
      const status = statusOf(err);
      const worthSwitching = status === 0 || status === 429 || status >= 500;
      if (!worthSwitching || backupModel === mainModel) throw err;
      console.warn(`[gemini] ${mainModel} failed (status=${status || "timeout/network"}), trying backup model ${backupModel}`);
      usedModel = backupModel;
      // One try, 15 seconds max: worst case a student waits about 35 seconds (20 + 15) before
      // seeing "try again", instead of about 60 with retries.
      interaction = await callModel(backupModel, 0, 15_000);
    }
    outputText = interaction.output_text ?? undefined;
  } catch (err) {
    throw toFriendlyError(err);
  }

  try {
    const reply = JSON.parse(outputText ?? "") as GeminiReply;
    if (!["answer", "clarify", "fallback"].includes(reply.type) || typeof reply.answer !== "string") {
      throw new Error("unexpected shape");
    }
    return { reply, model: usedModel };
  } catch {
    throw new FriendlyError("bad_ai_response", "The AI sent back an answer we couldn't read. Please try asking again.", 502);
  }
}

/** The HTTP status code on a Gemini error (0 if there isn't one, e.g. a network failure). */
function statusOf(err: unknown) {
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" ? status : 0;
}

/** Turn a Gemini/network error into a message a student can understand. */
function toFriendlyError(err: unknown): FriendlyError {
  const status = statusOf(err);
  // Log only the status and error type. Never the question, and never the key.
  console.error(`[gemini] request failed: status=${status || "none"} type=${(err as Error)?.name ?? "unknown"}`);

  if (status === 429) {
    return new FriendlyError("rate_limited", "The assistant is getting too many questions right now. Please wait a minute and try again.", 429);
  }
  if (status === 400 || status === 401 || status === 403) {
    return new FriendlyError("ai_config_error", "The assistant couldn't connect to Gemini (the API key or model setting may be wrong). Please let the team know.", 502);
  }
  if (status === 404) {
    return new FriendlyError("ai_config_error", "The Gemini model name in GEMINI_MODEL wasn't found. Please let the team know.", 502);
  }
  if (status >= 500) {
    return new FriendlyError("ai_unavailable", "Gemini is having trouble right now. Please try again in a moment.", 503);
  }
  return new FriendlyError("ai_error", "Something went wrong while writing the answer. Please try again.", 502);
}
