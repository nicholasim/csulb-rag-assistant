/**
 * crisis.ts: a safety rule that runs BEFORE everything else (small talk, search, Gemini).
 *
 * If a message mentions a crisis, self-harm, suicide, or feeling unsafe, the student must never
 * get the normal "I do not have enough information" fallback. They always get a kind sentence
 * and CSULB's crisis contacts, copied from the CAPS Crisis Intervention page
 * (knowledge/caps-crisis-intervention.md), plus 911 and the 988 Lifeline.
 *
 * It's plain keyword matching on purpose: instant, free, and it can't be talked out of it.
 * The list is deliberately broad. A false alarm (like "financial crisis") just shows the
 * crisis contacts, which is the safe direction. Indirect wording can still be missed;
 * that's listed as a limitation in docs/requirements-checklist.md.
 */
import { loadChunks, type Chunk } from "./knowledge";

// Each pattern is checked against the whole message, ignoring upper/lower case.
const CRISIS_PATTERNS = [
  /\bsuicid/, // suicide, suicidal
  /\bkill(ing)?\s+my\s*self\b/,
  /\bend(ing)?\s+(my\s+life|it\s+all)\b/,
  /\b(want(ed)?|wanna|going)\s+(to\s+)?die\b/,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive|be\s+here)\b/,
  /\bself[\s-]?harm/,
  /\b(hurt|hurting|harm|harming|cut|cutting)\s+my\s*self\b/,
  /\bcrisis\b/,
  /\b(i|i'?m|im|i\s+am|feel|feeling|felt)\s+(\w+\s+)?(unsafe|not\s+safe)\b/, // "I feel unsafe", "I'm not safe"
  /\b(don'?t|do\s+not|never)\s+feel\s+safe\b/,
];

/** Does this message mention a crisis, self-harm, suicide, or feeling unsafe? */
export function isCrisisMessage(message: string) {
  const text = message.toLowerCase().replace(/[‘’]/g, "'");
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

const CRISIS_PAGE_URL = "https://www.csulb.edu/student-affairs/counseling-and-psychological-services/crisis-intervention";

// The 988 Suicide & Crisis Lifeline is NOT on the CAPS page. It is our one deliberate exception
// to the "only official CSULB sources" rule, added by the team for safety (prompt log Entry 13).
// It's a national number, so it gets its own sentence with no [1] citation.
const LIFELINE_988 = "You can also call or text **988** (the 988 Suicide & Crisis Lifeline) at any time.";

/**
 * The fixed crisis reply. Every CSULB fact here is copied from the CAPS Crisis Intervention page,
 * and [1] cites that page. checkCrisisPage() below makes sure the page still says these things.
 */
const CRISIS_ANSWER = [
  "I'm really sorry you're dealing with this. You don't have to go through it alone, and talking to someone right now can help.",
  "**If you are experiencing a life-threatening emergency, please call 911.** CSULB's Counseling and Psychological Services (CAPS) offers crisis support: [1]",
  [
    "- **Weekdays (Monday through Friday, 8AM to 5PM):** call CAPS at [562-985-4001](tel:+15629854001), or go to the CAPS main office in Brotman Hall 226.",
    "- **After hours, weekends, and holidays:** call [562-985-4001](tel:+15629854001) and follow the instructions in the recorded message to be transferred to a live mental health professional.",
    "- **Text BEACH to 74-17-41** for free 24/7 mental health crisis support.",
  ].join("\n"),
  LIFELINE_988,
].join("\n\n");

// What the CAPS page must still say for the reply above to be accurate.
const REQUIRED_PAGE_FACTS = ["911", "562-985-4001", "Brotman Hall 226", "Monday through Friday, 8AM to 5PM", "74-17-41"];

let checked = false;

/**
 * The CAPS Crisis Intervention chunks, and a one-time check that the page still contains every
 * fact we quote. If the page changed (after `npm run fetch-sources`), the server log says which
 * fact is missing so the team can update CRISIS_ANSWER. The reply is still shown either way,
 * because a crisis message must never get the fallback.
 */
function crisisPageChunks(): Chunk[] {
  const chunks = loadChunks().filter((c) => c.url === CRISIS_PAGE_URL);
  if (!checked) {
    checked = true;
    const pageText = chunks.map((c) => c.text).join("\n");
    const missing = REQUIRED_PAGE_FACTS.filter((fact) => !pageText.includes(fact));
    if (chunks.length === 0) console.error("[crisis] the CAPS Crisis Intervention page is missing from knowledge/");
    else if (missing.length) console.error(`[crisis] the CAPS crisis page no longer contains: ${missing.join(", ")}. Update lib/crisis.ts.`);
  }
  return chunks;
}

/** The crisis reply text and the CAPS page chunks it cites as source [1]. */
export function crisisReply(): { answer: string; chunks: Chunk[] } {
  return { answer: CRISIS_ANSWER, chunks: crisisPageChunks() };
}

/** For tests: the facts the reply depends on, and whether the page still has them. */
export function checkCrisisPage() {
  const pageText = loadChunks()
    .filter((c) => c.url === CRISIS_PAGE_URL)
    .map((c) => c.text)
    .join("\n");
  return REQUIRED_PAGE_FACTS.map((fact) => ({ fact, found: pageText.includes(fact) }));
}
