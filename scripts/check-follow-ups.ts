/**
 * check-follow-ups.ts: offline check of the follow-up filter, cleanFollowUps in lib/rag.ts (Entry 27).
 * No Gemini calls. It pretends Gemini answered a parking question and suggested these follow-ups,
 * and checks which ones the filter keeps.
 *
 *   npm run check:follow-ups
 */
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

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nOK: the follow-up filter keeps only short, clean, on-topic questions our pages answer");
}

main();
