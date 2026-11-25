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

  // ---- Citations only on pages that support them (Entry 35). ----
  const { keepSupportedCitations, removeUnverifiedDetails } = await import("../lib/rag");
  const { loadChunks } = await import("../lib/knowledge");
  const byId = new Map(loadChunks().map((c) => [c.id, c]));
  const asResults = (ids: string[]) => ids.map((id) => ({ chunk: byId.get(id)!, score: 1 }));
  // The 8 sections Gemini was shown in a real Cambodian-question run (Entry 35 reproduction).
  const cambodian = asResults(["cultural-resource-centers#1", "american-indian-student-organizations#1", "cultural-resource-centers#2", "liberal-arts-clubs#2", "student-life-development#1", "engineering-student-clubs#13", "commencement-ceremony-schedules#5", "chhs-student-organizations#1"]);
  const citeCases: { label: string; answer: string; results: typeof cambodian; expected: string }[] = [
    {
      label: "a sentence cited with all 8 sources keeps only the page that supports it",
      answer: "You can get involved with your culture on campus by visiting the Asian, Pacific Islander, and Desi Resource Center, which is located in FO4-276 [1, 2, 3, 4, 5, 6, 7, 8].",
      results: cambodian,
      expected: "You can get involved with your culture on campus by visiting the Asian, Pacific Islander, and Desi Resource Center, which is located in FO4-276 [1, 3].",
    },
    {
      label: "the 300-organizations sentence keeps Student Life & Development, drops Engineering and Liberal Arts",
      answer: "CSULB has more than 300 recognized student organizations across 12 diverse categories [4, 5, 6].",
      results: cambodian,
      expected: "CSULB has more than 300 recognized student organizations across 12 diverse categories [5].",
    },
    {
      label: "a single citation is left alone",
      answer: "You can buy it online through the Parking Portal [6].",
      results: cambodian,
      expected: "You can buy it online through the Parking Portal [6].",
    },
  ];
  // Entry 39: a list sentence combining clubs from three pages keeps all three (each page names one).
  citeCases.push({
    label: "a list sentence with clubs from three pages keeps every page that names one",
    answer: "CSULB features several Latino student organizations, including the Latinx Student Union, the Association of Latino Professionals for America (ALPFA), the Hispanic Students Business Association (HSBA), and the National Association of Hispanic Journalists (NAHJ) [1, 2, 3].",
    results: asResults(["business-student-organizations#1", "liberal-arts-clubs#2", "nuestra-graduacion#1"]),
    expected: "CSULB features several Latino student organizations, including the Latinx Student Union, the Association of Latino Professionals for America (ALPFA), the Hispanic Students Business Association (HSBA), and the National Association of Hispanic Journalists (NAHJ) [1, 2, 3].",
  });
  // Two parking pages that both support a sentence keep both.
  const parking = search("How much is a semester student parking permit and where do I buy it?", 8);
  const parkingPages = [...new Set(parking.map((r) => r.chunk.url))];
  const two = [parking.findIndex((r) => r.chunk.url === parkingPages[0]) + 1, parking.findIndex((r) => r.chunk.url === parkingPages[1]) + 1];
  citeCases.push({
    label: "two parking pages that both support the sentence keep both",
    answer: `A student semester parking permit is sold online, and daily permits are available through the ParkMobile app [${two.join(", ")}].`,
    results: parking,
    expected: `A student semester parking permit is sold online, and daily permits are available through the ParkMobile app [${two.join(", ")}].`,
  });
  for (const c of citeCases) {
    const got = keepSupportedCitations(c.answer, c.results);
    const ok = got === c.expected;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} cite: ${c.label}${ok ? "" : `\n       got:      ${got}\n       expected: ${c.expected}`}`);
  }

  // ---- The safety check removes made-up links quietly (Entry 35). ----
  const quiet = removeUnverifiedDetails("Search [BeachSync](https://csulb.campuslabs.com/engage/organizations?query=Cambodian) for more clubs [1].", cambodian);
  const quietOk = quiet === "Search BeachSync for more clubs [1]." && !/removed/i.test(quiet);
  console.log(`${quietOk ? "ok  " : "FAIL"} safety check: a made-up link keeps its words, with no note (got ${JSON.stringify(quiet)})`);
  if (!quietOk) failures++;
  const phone = removeUnverifiedDetails("Call 562-555-0199 for help [1].", cambodian);
  const phoneOk = phone.includes("(see the source page for contact details)");
  console.log(`${phoneOk ? "ok  " : "FAIL"} safety check: a made-up phone number is replaced with a pointer to the source page`);
  if (!phoneOk) failures++;

  // ---- Entry 41: phone numbers compared by digits, emails exactly (ignoring case). ----
  const uwc = asResults(["writing-center#5"]); // its source says "(562) 985 5162" and "UWC@csulb.edu"
  const POINTER = "(see the source page for contact details)";
  const contactCases: { label: string; answer: string; kept: boolean }[] = [
    { label: "source '(562) 985 5162', answer '(562) 985-5162' is kept", answer: "Call (562) 985-5162 [1].", kept: true },
    { label: "answer '562.985.5162' is kept", answer: "Call 562.985.5162 [1].", kept: true },
    { label: "answer '+1 562 985 5162' is kept", answer: "Call +1 562 985 5162 [1].", kept: true },
    { label: "a made-up '(562) 985-9999' is replaced", answer: "Call (562) 985-9999 [1].", kept: false },
    { label: "'uwc@csulb.edu' matches 'UWC@csulb.edu' (case ignored)", answer: "Email uwc@csulb.edu [1].", kept: true },
    { label: "a one-letter-off email is removed", answer: "Email uwx@csulb.edu [1].", kept: false },
  ];
  for (const c of contactCases) {
    const out = removeUnverifiedDetails(c.answer, uwc);
    const ok = (out === c.answer) === c.kept && (c.kept || out.includes(POINTER));
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} contact: ${c.label}${ok ? "" : ` (got ${JSON.stringify(out)})`}`);
  }

  // ---- Entry 38: the general BeachSync sentence, stray citations, gaming search. ----
  const { dropGeneralBeachSyncSentence, citeOncePerParagraph } = await import("../lib/rag");
  const e38: { label: string; got: string; want: string }[] = [
    {
      label: "button shown: the general BeachSync sentence and its citation go",
      got: dropGeneralBeachSyncSentence("Computer science students can join the AI Research Club [1]. You can find all student organizations at CSULB on [BeachSync](http://beachsync.com/) [2]."),
      want: "Computer science students can join the AI Research Club [1].",
    },
    {
      label: "button shown: 'Beach Sync on your Single Sign-On dashboard' version goes too",
      got: dropGeneralBeachSyncSentence("Join the Cambodian Student Society [1]. To explore all student organizations, check Beach Sync via your Single Sign-On dashboard [2]."),
      want: "Join the Cambodian Student Society [1].",
    },
    {
      label: "a sentence linking one club's BeachSync page is kept",
      got: dropGeneralBeachSyncSentence("See the [Society of Physics Students](https://csulb.campuslabs.com/engage/organization/society-of-physics-students-sps) on BeachSync, among other clubs [1]."),
      want: "See the [Society of Physics Students](https://csulb.campuslabs.com/engage/organization/society-of-physics-students-sps) on BeachSync, among other clubs [1].",
    },
    {
      label: "an answer that is only that sentence is left as it is",
      got: dropGeneralBeachSyncSentence("All student organizations at CSULB can be found on BeachSync [1]."),
      want: "All student organizations at CSULB can be found on BeachSync [1].",
    },
    {
      label: "a stray citation after the last sentence joins the one before it",
      got: citeOncePerParagraph("You are welcome at the center [2]. [1]"),
      want: "You are welcome at the center [1, 2].",
    },
    {
      label: "a double space left by a moved citation is tidied",
      got: citeOncePerParagraph("Hiking through Club Sports [1]  and ASI Outdoor Adventures [2]. Call the office [1]."),
      want: "Hiking through Club Sports and ASI Outdoor Adventures [2]. Call the office [1].",
    },
  ];
  for (const c of e38) {
    const ok = c.got === c.want;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.label}${ok ? "" : `\n       got:  ${c.got}\n       want: ${c.want}`}`);
  }
  const gaming = search("are there gaming clubs", 8).some((r) => r.chunk.id === "engineering-student-clubs#8" || /Video Game Development/.test(r.chunk.text));
  console.log(`${gaming ? "ok  " : "FAIL"} search: "are there gaming clubs" reaches the Video Game Development Association section`);
  if (!gaming) failures++;

  // ---- Bad club keywords fall back to the student's words (Entry 37). ----
  const { beachSyncSearch: bs } = await import("../lib/club-search");
  const officeNames = ["Student Life & Development (clubs and organizations)", "LGBTQ+ Resource Center", "Black Resource Center"];
  const keywordCases: { term: string; question: string; want: string | null; why: string }[] = [
    { term: "life and development", question: "I'm queer, where can I find community?", want: "queer", why: "generic words -> student's word" },
    { term: "Student Life & Development", question: "I'm queer, where can I find community?", want: "queer", why: "an office name -> student's word" },
    { term: "LGBTQ", question: "I'm queer, where can I find community?", want: "LGBTQ", why: "a real topic inside an office name is kept" },
    { term: "Black Resource Center", question: "how can Black students find community here?", want: "black", why: "a piece of an office name -> student's word" },
    { term: "", question: "how can Black students find community here?", want: "black", why: "no club word: what's left after filler" },
    { term: "student resources", question: "Latino student organizations?", want: "latino", why: "generic words -> student's word" },
    { term: "", question: "how do I join a club", want: null, why: "no topic: no button (the answer mentions BeachSync instead)" },
  ];
  for (const c of keywordCases) {
    const got = bs(c.term, c.question, officeNames)?.term ?? null;
    const ok = got === c.want;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} keyword ${JSON.stringify(c.term)} / ${JSON.stringify(c.question)} -> ${JSON.stringify(got)} (${c.why})`);
  }

  // ---- BeachSync club search link (Entry 34). ----
  const { beachSyncSearch } = await import("../lib/club-search");
  const linkCases: { term: unknown; question: string; url: string | null }[] = [
    { term: "chess", question: "is there a chess club", url: "https://csulb.campuslabs.com/engage/organizations?query=chess" },
    { term: "Cambodian", question: "I'm Cambodian, how can I get involved with my culture on campus?", url: "https://csulb.campuslabs.com/engage/organizations?query=Cambodian" },
    { term: "computer science club", question: "I'm a CS student, what clubs can help me gain experience?", url: "https://csulb.campuslabs.com/engage/organizations?query=computer%20science" },
    { term: "chess<script>&x=1", question: "chess clubs", url: "https://csulb.campuslabs.com/engage/organizations?query=chess%20script%20x" },
    { term: "chess", question: "How much is a parking permit?", url: null }, // not a club question: no button
    // Entry 36: an empty keyword falls back to the student's own words for the topic.
    { term: "", question: "is there a chess club", url: "https://csulb.campuslabs.com/engage/organizations?query=chess" },
    { term: undefined, question: "clubs for nursing students", url: "https://csulb.campuslabs.com/engage/organizations?query=nursing" },
    { term: "", question: "is there an underwater basket weaving club", url: "https://csulb.campuslabs.com/engage/organizations?query=underwater%20basket%20weaving" },
    { term: "", question: "I'm Vietnamese, are there groups for me?", url: "https://csulb.campuslabs.com/engage/organizations?query=vietnamese" },
    { term: "", question: "how do I join a club", url: null }, // no topic: no button
    { term: "", question: "How much is a parking permit?", url: null },
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
