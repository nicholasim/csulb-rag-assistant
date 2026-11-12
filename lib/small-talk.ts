/**
 * small-talk.ts: replies to simple social messages ("hi", "thanks", "bye", "what can you do?")
 * WITHOUT searching or calling Gemini. Just pattern matching, so it's instant and free.
 *
 * How it decides:
 *   1. Peel greetings, thanks, and goodbyes off the start and end of the message.
 *      "Hi, how much is parking?" -> "how much is parking?"
 *   2. Nothing left? It was pure small talk ("hi!", "thanks, bye") -> a canned "chat" reply.
 *   3. What's left is exactly "what can you do?" / "how are you?" (or similar)? -> a canned reply.
 *   4. Anything else is a real question. It goes through the normal search -> Gemini flow
 *      WITHOUT the greeting, so "hi" never affects the search. Off-topic questions like
 *      "what's the capital of France?" are not small talk, so they still get the normal fallback.
 */
import { CATEGORIES, EXAMPLE_QUESTIONS } from "./categories";

// Each pattern is a list of ways to say it, including common typos ("helo", "thx").
// A space in a pattern matches any spaces or commas between words ("good, morning" works too).
const GREETING = [
  "h+i+", "hai", "hiya", "he+y+", "heya", "he+l+o+w?", "hallo", "hullo", "howdy", "yo", "greetings",
  "wh?at'?s+ ?up", "wassup", "sup",
  "(good|gud|goo+d) ?(morning|mornin|afternoon|evening)", "morning", "gm",
];
const THANKS = [
  "(thank(s|x)?|thnx|thnks|thanx|thx|tnx)( (you|u|so|very|much|a|lot|bunch|again))*",
  "tysm", "tyvm", "ty", "appreciate it", "much appreciated", "cheers",
];
const BYE = [
  "(good ?)?by+e+( ?by+e+)?", "bai", "cya", "see (ya|you)( later)?", "take care", "good ?night", "gn",
  "have a (good|great|nice) (day|night|one|weekend)",
];
// Little words that often ride along ("hi there", "ok thanks"). Removed, but never a reply on their own.
const FILLER = ["there", "everyone", "all", "assistant", "bot", "ok(ay)?", "cool", "great", "awesome", "perfect", "got it"];

// These must match the WHOLE message (after peeling off greetings), so "help me with parking"
// is still a real question but "help" or "hi, what can you do?" is not.
const ABOUT_ME = [
  "what (can|do) (you|u) do", "what (can|should) i ask( you)?", "what (do|can) you help( me)? with",
  "how (do|can) you help( me)?", "(can you )?help( me)?", "i need help", "who (are|r) (you|u)", "what are you",
  "who (made|built|created|designed) (you|u|this)", "what is this", "how does this work",
];
const HOW_ARE_YOU = [
  "how (are|r) (you|u|ya)( doing)?( today)?", "how'?s it going", "how is it going", "how'?s your day",
  "how are things", "how (have|ve) you been", "how you doing", "you good", "are you ok(ay)?",
];

/** Turn a list of patterns into one regex. `whole` = the entire text must be one of them. */
function toRegex(patterns: string[], whole = false) {
  // " ?" = an optional space ("goodbye" or "good bye"); " " = at least one space or comma.
  const body = patterns.map((p) => p.replace(/ \?/g, "[\\s,]*").replace(/ /g, "[\\s,]+")).join("|");
  return new RegExp(whole ? `^(?:${body})(?:[\\s,]+please)?$` : `(?:${body})`, "i");
}

const SOCIAL = { greeting: GREETING, thanks: THANKS, bye: BYE, filler: FILLER } as const;
const PUNCTUATION = "[\\s,.!?;:~)(-]*"; // what can sit between social phrases

export type SmallTalkKind = "greeting" | "thanks" | "bye" | "about" | "how_are_you";

/**
 * Is this one word a greeting/thanks/goodbye ("helo", "thx", "byee")?
 * The spelling fixer uses this so it never "corrects" them into other words.
 */
export function isSocialWord(word: string) {
  return toRegex([...GREETING, ...THANKS, ...BYE], true).test(word);
}

/**
 * Check a message for small talk.
 * Returns the kind of small talk (or null for a real question) and the message with
 * greetings/thanks/goodbyes peeled off (what we should search with).
 */
export function detectSmallTalk(message: string): { kind: SmallTalkKind | null; rest: string } {
  let rest = message.replace(/[‘’]/g, "'").trim();
  const found = new Set<keyof typeof SOCIAL>();

  // Peel social phrases off the start and the end, one at a time, until none are left.
  let changed = true;
  while (changed && rest) {
    changed = false;
    for (const [kind, patterns] of Object.entries(SOCIAL) as [keyof typeof SOCIAL, string[]][]) {
      const body = toRegex(patterns).source;
      const atStart = new RegExp(`^${PUNCTUATION}(?:${body})(?![a-z'])${PUNCTUATION}`, "i");
      const atEnd = new RegExp(`(?<![a-z'])(?:${body})${PUNCTUATION}$`, "i");
      // Only thanks and goodbyes come off the END ("how much is parking? thanks").
      // Greetings and filler don't: "open in the morning" must keep "morning".
      const places = kind === "thanks" || kind === "bye" ? [atStart, atEnd] : [atStart];
      for (const regex of places) {
        const next = rest.replace(regex, "").trim();
        if (next !== rest) {
          rest = next;
          found.add(kind);
          changed = true;
        }
      }
    }
  }
  const clean = rest.replace(/[.!?]+$/, "").trim();

  if (!clean) {
    // Pure small talk. If they said more than one thing ("thanks, bye"), reply to the last word
    // that matters most: goodbye beats thanks, thanks beats hello.
    if (found.has("bye")) return { kind: "bye", rest: "" };
    if (found.has("thanks")) return { kind: "thanks", rest: "" };
    if (found.has("greeting")) return { kind: "greeting", rest: "" };
    return { kind: null, rest: message }; // only filler like "ok": treat it as a normal message
  }
  if (toRegex(ABOUT_ME, true).test(clean)) return { kind: "about", rest: "" };
  if (toRegex(HOW_ARE_YOU, true).test(clean)) return { kind: "how_are_you", rest: "" };
  return { kind: null, rest };
}

const AREAS = CATEGORIES.map((c) => c.name).join(", ");
const EXAMPLES = EXAMPLE_QUESTIONS.slice(0, 3); // three verified questions, shown as buttons

/** The fixed reply for each kind of small talk. `examples` become clickable question buttons. */
export function smallTalkReply(kind: SmallTalkKind): { answer: string; examples: string[] } {
  switch (kind) {
    case "greeting":
      return {
        answer: "Hi there! I can answer questions about CSULB student services, like parking, financial aid, advising, and registration, using official CSULB web pages. Here are a few things you can ask:",
        examples: EXAMPLES,
      };
    case "thanks":
      return { answer: "You're welcome! Anything else about CSULB services?", examples: [] };
    case "bye":
      return { answer: "Goodbye, and good luck this semester! Come back anytime you have a question about CSULB services.", examples: [] };
    case "about":
      return {
        answer: `I answer questions about CSULB student services using only official CSULB web pages, and every answer links to the page it came from. I can help with: ${AREAS}.\n\nI was built by our IS 300 student team at CSULB. Try one of these:`,
        examples: EXAMPLES,
      };
    case "how_are_you":
      return { answer: "I'm doing well, thanks for asking! I'm here to help with CSULB services. What would you like to know?", examples: [] };
  }
}
