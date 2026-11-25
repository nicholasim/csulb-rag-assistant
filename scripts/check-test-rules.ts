/**
 * check-test-rules.ts: offline check of test #29's rules (Entry 41). No Gemini calls.
 * Fake API replies go through the real check() from run-tests.ts, to confirm the test passes a
 * fallback or an honest partial answer, and fails an answer that claims a study room can be reserved.
 *
 *   npm run check:test-rules
 */
import { readFileSync } from "node:fs";
import { check, type ApiResult, type Test } from "./run-tests";

const tests = (JSON.parse(readFileSync("tests/test-questions.json", "utf8")) as { tests: Test[] }).tests;
const test29 = tests.find((t) => t.id === 29)!;

const source = { id: 1, title: "Library Study Areas", url: "https://www.csulb.edu/university-library/study-areas", excerpt: "" };
const base = { model: "gemini-3.5-flash-lite", correctedQuestion: "how do i reserve a study room", sources: [source] };
const answer = (text: string, withSource = true): ApiResult => ({ httpStatus: 200, body: { ...base, type: "answer", answer: text, sources: withSource ? [source] : [] } });

const cases: { label: string; result: ApiResult; pass: boolean }[] = [
  {
    label: "the fallback passes",
    result: { httpStatus: 200, body: { ...base, type: "fallback", sources: [], answer: "I do not have enough information in the provided CSULB sources.", helpOffice: { name: "University Library", url: "https://www.csulb.edu/university-library" } } },
    pass: true,
  },
  {
    label: "honest partial answer (group study areas, seen live) passes",
    result: answer("The sources do not state how to reserve a study room. However, the library offers group study areas on several floors [1]. You can check [Campus Maps](https://www.csulb.edu/maps) to find your way around campus."),
    pass: true,
  },
  {
    label: "honest partial answer (iSpace, seen live) passes",
    result: answer("Our sources do not list how to reserve a general study room, but the [iSpace](https://www.csulb.edu/academic-technology-services/ispace) in the Library offers Podcast Studios available for reservation [1]."),
    pass: true,
  },
  {
    label: "an answer claiming a study room can be reserved fails",
    result: answer("You can reserve a group study room through the library's booking site [1]."),
    pass: false,
  },
  {
    label: "'study rooms can be booked online' fails",
    result: answer("The sources do not explain how to reserve a study room, but study rooms can be booked online [1]."),
    pass: false,
  },
  {
    label: "a partial answer with no citation fails",
    result: answer("The sources do not state how to reserve a study room. The library has group study areas.", false),
    pass: false,
  },
  {
    label: "an answer that never says the sources don't cover it fails",
    result: answer("The library offers group study areas on several floors [1]."),
    pass: false,
  },
  {
    label: "a fallback without the fallback sentence fails",
    result: { httpStatus: 200, body: { ...base, type: "fallback", sources: [], answer: "Sorry, I can't help with that.", helpOffice: { name: "University Library", url: "https://www.csulb.edu/university-library" } } },
    pass: false,
  },
];

let failures = 0;
for (const c of cases) {
  const problems = check(test29, c.result);
  const ok = (problems.length === 0) === c.pass;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${c.label}${problems.length ? `  [${problems.join("; ")}]` : ""}`);
}
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: test #29 passes a fallback or an honest partial answer, and fails a claim that a study room can be reserved");
