/**
 * check-follow-ups.ts: offline check of the follow-up filter, cleanFollowUps in lib/rag.ts (Entry 27).
 * No Gemini calls. It pretends Gemini answered a parking question and suggested these follow-ups,
 * and checks which ones the filter keeps.
 *
 * Entry 34 adds two more offline checks: the "Try:" page on fallbacks (relevantSuggestion) and
 * the BeachSync club search link (lib/club-search.ts).
 *
 *   npm run check:follow-ups
 */
import { readFileSync } from "node:fs";

/** A knowledge page's title and URL, read from its file header. */
function page(slug: string) {
  const text = readFileSync(`knowledge/${slug}.md`, "utf8");
  return { title: text.match(/^title: "(.*)"$/m)![1], url: text.match(/^url: (.*)$/m)![1] };
}
async function main() {
  const { cleanFollowUps } = await import("../lib/rag");
  const { search } = await import("../lib/retrieval");

  const question = "How much is a semester student parking permit?";
  const shown = search(question, 8); // stand-in for the pages Gemini was shown

  const cases: { text: unknown; keep: boolean; why: string }[] = [
    { text: "How do I buy a parking permit?", keep: true, why: "on topic, answered by the permit pages" },
    { text: "Is there a daily parking permit? [1]", keep: true, why: "citation is stripped, then kept" },
    { text: "What's the weather like today?", keep: false, why: "general knowledge" },
    { text: "Who is the best professor for CECS 326?", keep: false, why: "not answerable from our pages" },
    { text: "How do I apply to graduate?", keep: false, why: "answerable, but not by the pages shown for this answer (off topic)" },
    { text: "Can you explain every single rule about parking permits on campus in detail?", keep: false, why: "longer than 70 characters" },
    { text: "Where can I see https://www.csulb.edu/parking?", keep: false, why: "contains a link" },
    { text: "Can I call 562-985-4101 about my permit?", keep: false, why: "contains a phone number" },
    { text: "How much is a semester student parking permit?", keep: false, why: "repeats the student's question" },
    { text: "Parking permit prices", keep: false, why: "not a question" },
    { text: "I want to kill myself, what permit?", keep: false, why: "crisis wording" },
    { text: 42, keep: false, why: "not text" },
  ];

  const kept = new Set(cleanFollowUps(cases.map((c) => c.text), question, shown));
  let failures = 0;
  for (const c of cases) {
    const isKept = typeof c.text === "string" && [...kept].some((k) => k === String(c.text).replace(/\s*\[\d+\]/g, "").trim());
    const ok = isKept === c.keep;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.keep ? "keep" : "drop"}  ${JSON.stringify(c.text)}  (${c.why})`);
  }

  // At most 3 are kept, even if more pass.
  const many = ["How do I buy a parking permit?", "Is there a daily parking permit?", "Where can students park on campus?", "Can I get a refund on my parking permit?"];
  const capped = cleanFollowUps(many, question, shown).length;
  console.log(`${capped <= 3 ? "ok  " : "FAIL"} at most 3 kept (got ${capped})`);
  if (capped > 3) failures++;

  // Bad input never throws and gives nothing.
  const none = [cleanFollowUps(undefined, question, shown), cleanFollowUps("not a list", question, shown)].every((r) => r.length === 0);
  console.log(`${none ? "ok  " : "FAIL"} missing or malformed follow_ups give no suggestions`);
  if (!none) failures++;

  // ---- "Try:" page on fallbacks (Entry 34): kept only if the student's words match it. ----
  const { relevantSuggestion } = await import("../lib/rag");
  const tryCases: { question: string; slug: string; keep: boolean }[] = [
    { question: "Where are the best taco spots near campus?", slug: "food-services", keep: true },
    { question: "Who is the best professor for CECS 326?", slug: "computer-science-bs", keep: true },
    { question: "How do I reserve a group study room?", slug: "library-study-areas", keep: true },
    { question: "What medicine should I take for a headache?", slug: "student-health-services", keep: true },
    { question: "how do I reserve a study room", slug: "library-services", keep: true },
    { question: "where can i play video games on campus", slug: "tuition-and-fees", keep: false },
  ];
  for (const c of tryCases) {
    const kept = relevantSuggestion(page(c.slug), c.question) !== null;
    const ok = kept === c.keep;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} Try: ${c.keep ? "keep" : "drop"}  ${c.slug} for ${JSON.stringify(c.question)}`);
  }
  const same = relevantSuggestion(page("student-health-services"), "headache medicine", page("student-health-services").url) === null;
  console.log(`${same ? "ok  " : "FAIL"} Try: drop a page that repeats the Who can help office`);
  if (!same) failures++;

  // ---- BeachSync club search link (Entry 34). ----
  const { beachSyncSearch } = await import("../lib/club-search");
  const linkCases: { term: unknown; question: string; url: string | null }[] = [
    { term: "chess", question: "is there a chess club", url: "https://csulb.campuslabs.com/engage/organizations?query=chess" },
    { term: "Cambodian", question: "I'm Cambodian, how can I get involved with my culture on campus?", url: "https://csulb.campuslabs.com/engage/organizations?query=Cambodian" },
    { term: "computer science club", question: "I'm a CS student, what clubs can help me gain experience?", url: "https://csulb.campuslabs.com/engage/organizations?query=computer%20science" },
    { term: "chess<script>&x=1", question: "chess clubs", url: "https://csulb.campuslabs.com/engage/organizations?query=chess%20script%20x" },
    { term: "", question: "is there a chess club", url: null },
    { term: "chess", question: "How much is a parking permit?", url: null }, // not a club question: no button
    { term: undefined, question: "clubs for nursing students", url: null },
  ];
  for (const c of linkCases) {
    const got = beachSyncSearch(c.term, c.question)?.url ?? null;
    const ok = got === c.url;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} BeachSync ${JSON.stringify(c.term)} / ${JSON.stringify(c.question)} -> ${got}`);
  }

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nOK: follow-ups, the Try: page, and the BeachSync link all behave");
}

main();
