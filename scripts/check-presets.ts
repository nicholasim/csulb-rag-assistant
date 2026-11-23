/**
 * check-presets.ts: makes sure every preset question the app shows as a button has a permanent
 * live test in tests/preset-questions.json (Entry 20). No API calls; run it before committing:
 *
 *   npm run check:presets
 *
 * Fails (exit 1) if a sidebar starter or welcome example isn't in the test file, so a new preset
 * can't ship without a test. Then run the live tests to prove each one is answered:
 *   TESTS_FILE=tests/preset-questions.json RESULTS_FILE=docs/test-results-presets.md npm run test:questions
 */
import { readFileSync } from "node:fs";
import { CATEGORIES, EXAMPLE_QUESTIONS } from "../lib/categories";

const tests: { question: string }[] = JSON.parse(readFileSync("tests/preset-questions.json", "utf8")).tests;
const tested = new Set(tests.map((t) => t.question));
const presets = [...new Set([...CATEGORIES.map((c) => c.starter), ...EXAMPLE_QUESTIONS])];
const missing = presets.filter((q) => !tested.has(q));
const stale = [...tested].filter((q) => !presets.includes(q));

console.log(`${presets.length} preset questions, ${tests.length} preset tests`);
for (const q of missing) console.log(`  MISSING TEST: "${q}"`);
for (const q of stale) console.log(`  NOT A PRESET ANYMORE (remove or update the test): "${q}"`);
if (missing.length || stale.length) process.exit(1);
console.log("OK: every preset question has a live test");
