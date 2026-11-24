/**
 * run-tests.ts: runs every question in tests/test-questions.json against the local app,
 * checks each answer automatically, prints a results table, and saves it to docs/test-results.md.
 *
 * 1. Start the app:   npm run dev
 * 2. Run the tests:   npm run test:questions
 *
 * Options (environment variables):
 *   APP_URL   where the app is running (default http://localhost:3000)
 *   DELAY_MS  pause between questions that call Gemini, to stay under rate limits (default 5000)
 *   RETRY_WAIT_MS  if Gemini is rate-limited, overloaded, or timed out, wait this long and retry once (default 30000)
 *   ONLY      run just these test numbers, e.g. ONLY=26,27,28 (prints results, doesn't overwrite the results file)
 *   TESTS_FILE    which question set to run (default tests/test-questions.json;
 *                 the "real student" set is tests/student-questions.json)
 *   RESULTS_FILE  where to save the results table (default docs/test-results.md)
 *
 * The "missing API key" test can't use the running app (it has a key), so it calls the real
 * /api/chat route code directly inside this script, where GEMINI_API_KEY is removed first.
 */
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";

// ---- Club names must come from our sources (Entry 36) ----
// Organization names in an answer: capitalized words ending in Association, Society, Club, Council,
// Union, Coalition, Alliance, or Organization ("Vietnamese Student Association", "Pre-Physician
// Assistant Club"). The first word is capitalized; small joining words (of, for, and, the) may appear inside.
const ORG_NAME = /\b([A-Z][\w'’&.\/-]*(?:\s+(?:[A-Z][\w'’&.\/-]*|of|for|and|the|in|de|&)){0,7}\s+(?:Association|Society|Club|Council|Union|Coalition|Alliance|Organization))\b/g;
function namedOrgs(answer: string) {
  const text = answer.replace(/\]\([^)]*\)/g, "]").replace(/[[\]*_]/g, "");
  return [...new Set([...text.matchAll(ORG_NAME)].map((m) => m[1].replace(/^(The|the|of|for|and|in)\s+/, "").trim()))];
}
const squash = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, " ").trim();
let knowledgeByUrl: Map<string, string> | null = null;
/** Our knowledge files, by page URL (read once). */
function knowledgeText(url: string) {
  if (!knowledgeByUrl) {
    knowledgeByUrl = new Map();
    for (const file of readdirSync("knowledge")) {
      const text = readFileSync(`knowledge/${file}`, "utf8");
      const pageUrl = text.match(/^url: (.*)$/m)?.[1];
      if (pageUrl) knowledgeByUrl.set(pageUrl, squash(text));
    }
  }
  return knowledgeByUrl.get(url) ?? "";
}

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DELAY_MS = Number(process.env.DELAY_MS ?? 5000);
const RETRY_WAIT_MS = Number(process.env.RETRY_WAIT_MS ?? 30000);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null;
// Error codes from our API that mean "Gemini is busy right now", not "the app is broken".
const BUSY_ERRORS = ["rate_limited", "ai_unavailable"];
const TESTS_FILE = process.env.TESTS_FILE ?? "tests/test-questions.json";
const RESULTS_FILE = process.env.RESULTS_FILE ?? "docs/test-results.md";

type Expect = {
  response: string | string[]; // "answer" | "clarify" | "fallback" | "error"
  mustInclude?: string[]; // every pattern must match
  mustIncludeAny?: string[]; // at least one pattern must match
  mustNotInclude?: string[]; // no pattern may match
  mustComeBefore?: [string, string]; // [first, later]: if `later` appears in the answer, `first` must appear before it (Entry 21)
  minSources?: number;
  errorCode?: string;
  httpStatus?: number;
  correctedQuestion?: string | null; // pattern the typo-fixed question must match; null = nothing should be fixed
  minExamples?: number; // chat replies: at least this many example-question buttons
  minFollowUps?: number; // normal answers: at least this many follow-up suggestions (Entry 27)
  maxAnswerChars?: number; // the answer must be at most this long (e.g. a referral, not a written essay)
  searchQueriesMustNotInclude?: string[]; // patterns that must never appear in the queries we searched with (e.g. a student ID)
  // If the reply is a fallback: true = it must show a "Who can help" office (a CSULB question);
  // false = it must NOT show one (not about CSULB), and shows example questions instead.
  helpOffice?: boolean;
  helpOfficeName?: string; // if the reply is a fallback with an office, its name must match this pattern (Entry 34)
  beachsyncTerm?: string | null; // Entry 34: pattern the BeachSync club search keyword must match; null = no BeachSync button
  clubsFromSources?: boolean; // Entry 36: every organization the answer names must appear in one of its cited pages
  noClubsNamed?: boolean; // Entry 36: the answer must not name any organization (a club our pages don't list)
};

type Test = {
  id: number;
  question: string;
  questionRepeat?: { text: string; times: number };
  type: string;
  area: string;
  expected_behavior: string;
  expected_fact?: string; // optional (the preset tests describe the fact in expected_behavior)
  runWithoutApiKey?: boolean;
  // Earlier messages in the chat, for follow-up questions like "what about for a year?"
  history?: { role: "user" | "assistant"; content: string }[];
  expect: Expect;
};

type ApiResult = {
  httpStatus: number;
  body: {
    type?: string;
    answer?: string;
    sources?: { id: number; title: string; url: string; excerpt: string }[];
    suggestion?: { title: string; url: string } | null;
    model?: string | null;
    correctedQuestion?: string | null;
    searchQueries?: string[];
    examples?: string[];
    followUps?: string[];
    helpOffice?: { name: string; url: string } | null;
    offTopic?: boolean;
    beachsyncSearch?: { term: string; url: string };
    error?: { code: string; message: string };
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Send one question to the running app's /api/chat. */
async function askApp(question: string, history: Test["history"] = []): Promise<ApiResult> {
  const res = await fetch(`${APP_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
    signal: AbortSignal.timeout(90_000),
  });
  return { httpStatus: res.status, body: await res.json() };
}

/** Call the real route code in this process with the API key removed. */
async function askWithoutApiKey(question: string): Promise<ApiResult> {
  delete process.env.GEMINI_API_KEY;
  const { POST } = await import("../app/api/chat/route");
  const res = await POST(
    new Request("http://test.local/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
  );
  return { httpStatus: res.status, body: await res.json() };
}

/** Check one result against what the test expects. Returns a list of problems (empty = pass). */
function check(test: Test, result: ApiResult): string[] {
  const { expect } = test;
  const { body, httpStatus } = result;
  const problems: string[] = [];
  const actualType = body.error ? "error" : (body.type ?? "unknown");
  const allowed = Array.isArray(expect.response) ? expect.response : [expect.response];

  if (!allowed.includes(actualType)) problems.push(`expected ${allowed.join(" or ")}, got ${actualType}`);
  if (expect.errorCode && body.error?.code !== expect.errorCode) {
    problems.push(`expected error code ${expect.errorCode}, got ${body.error?.code ?? "none"}`);
  }
  if (expect.httpStatus && httpStatus !== expect.httpStatus) {
    problems.push(`expected HTTP ${expect.httpStatus}, got ${httpStatus}`);
  }
  if (expect.correctedQuestion === null && body.correctedQuestion) {
    problems.push(`expected no spelling correction, got "${body.correctedQuestion}"`);
  }
  if (expect.correctedQuestion && !new RegExp(expect.correctedQuestion, "i").test(body.correctedQuestion ?? "")) {
    problems.push(`expected the question to be corrected to /${expect.correctedQuestion}/, got ${body.correctedQuestion ? `"${body.correctedQuestion}"` : "no correction"}`);
  }
  // Follow-ups appear only on normal Gemini answers: never on fallbacks, clarifying questions, small
  // talk, errors, or crisis replies (which have no model). Checked on every test (Entry 27).
  const isNormalAnswer = body.type === "answer" && !!body.model;
  if (!isNormalAnswer && (body.followUps?.length ?? 0) > 0) {
    problems.push(`follow-up suggestions must not appear on a ${body.error ? "error" : body.model ? body.type : `${body.type} without AI (crisis/small talk)`} reply`);
  }
  if (expect.minFollowUps && (body.followUps?.length ?? 0) < expect.minFollowUps) {
    problems.push(`expected at least ${expect.minFollowUps} follow-up suggestion(s), got ${body.followUps?.length ?? 0}`);
  }
  if (expect.minExamples && (body.examples?.length ?? 0) < expect.minExamples) {
    problems.push(`expected at least ${expect.minExamples} example question(s), got ${body.examples?.length ?? 0}`);
  }
  if (expect.maxAnswerChars && (body.answer ?? "").length > expect.maxAnswerChars) {
    problems.push(`answer is ${(body.answer ?? "").length} characters, expected at most ${expect.maxAnswerChars}`);
  }
  if (expect.helpOffice !== undefined && body.type === "fallback") {
    if (expect.helpOffice && !body.helpOffice) problems.push(`expected a "Who can help" office, got none`);
    if (!expect.helpOffice && body.helpOffice) problems.push(`expected no office for a non-CSULB question, got "${body.helpOffice.name}"`);
    if (!expect.helpOffice && (body.examples?.length ?? 0) < 3) problems.push(`expected 3 example questions for a non-CSULB question, got ${body.examples?.length ?? 0}`);
  }
  if (expect.helpOfficeName && body.type === "fallback" && body.helpOffice && !new RegExp(expect.helpOfficeName, "i").test(body.helpOffice.name)) {
    problems.push(`expected "Who can help" to match /${expect.helpOfficeName}/, got "${body.helpOffice.name}"`);
  }
  if (expect.clubsFromSources || expect.noClubsNamed) {
    const cited = (body.sources ?? []).map((s) => knowledgeText(s.url)).join("\n");
    for (const name of namedOrgs(body.answer ?? "")) {
      if (expect.noClubsNamed && !/^(Associated Students|Student Life)/.test(name)) problems.push(`expected no club named, got "${name}"`);
      else if (!cited.includes(squash(name))) problems.push(`names "${name}", which isn't in any cited source`);
    }
  }
  if (expect.beachsyncTerm === null && body.beachsyncSearch) problems.push(`expected no BeachSync button, got "${body.beachsyncSearch.term}"`);
  if (typeof expect.beachsyncTerm === "string" && !new RegExp(expect.beachsyncTerm, "i").test(body.beachsyncSearch?.term ?? "")) {
    problems.push(`expected a BeachSync search matching /${expect.beachsyncTerm}/, got ${body.beachsyncSearch ? `"${body.beachsyncSearch.term}"` : "none"}`);
  }
  for (const pattern of expect.searchQueriesMustNotInclude ?? []) {
    if ((body.searchQueries ?? []).some((q) => new RegExp(pattern, "i").test(q))) problems.push(`search queries should not contain /${pattern}/`);
  }
  if (expect.minSources && (body.sources?.length ?? 0) < expect.minSources) {
    problems.push(`expected at least ${expect.minSources} source(s), got ${body.sources?.length ?? 0}`);
  }

  // What we search: the answer text plus the titles of its sources and suggested page.
  const haystack = [body.answer ?? "", body.suggestion?.title ?? "", body.helpOffice?.name ?? "", ...(body.sources ?? []).map((s) => s.title)].join("\n");
  const matches = (pattern: string) => new RegExp(pattern, "i").test(haystack);

  for (const pattern of expect.mustInclude ?? []) {
    if (!matches(pattern)) problems.push(`missing /${pattern}/`);
  }
  if (expect.mustIncludeAny && !expect.mustIncludeAny.some(matches)) {
    problems.push(`missing all of: ${expect.mustIncludeAny.map((p) => `/${p}/`).join(", ")}`);
  }
  for (const pattern of expect.mustNotInclude ?? []) {
    if (matches(pattern)) problems.push(`should not contain /${pattern}/`);
  }
  if (expect.mustComeBefore) {
    // Checked in the answer text only. "first" must appear, and before the first match of "later".
    const [first, later] = expect.mustComeBefore;
    const answer = body.answer ?? "";
    const firstAt = answer.search(new RegExp(first, "i"));
    const laterAt = answer.search(new RegExp(later, "i"));
    if (laterAt !== -1 && (firstAt === -1 || firstAt > laterAt)) problems.push(`/${first}/ must come before /${later}/`);
  }
  return problems;
}

/** A one-line summary of what actually came back, for the table. */
function summarize(result: ApiResult) {
  const { body, httpStatus } = result;
  if (body.error) return `HTTP ${httpStatus} error ${body.error.code}: "${body.error.message}"`;
  const text = (body.answer ?? "").replace(/\s+/g, " ").trim();
  const sources = body.sources?.length ? ` (${body.sources.length} source${body.sources.length > 1 ? "s" : ""})` : "";
  const searched = body.searchQueries?.length ? body.searchQueries : body.correctedQuestion ? [body.correctedQuestion] : [];
  const corrected = searched.length ? `[searched: ${searched.map((q) => `"${q}"`).join(" + ")}] ` : "";
  const help = body.type === "fallback" ? (body.helpOffice ? ` [Who can help: ${body.helpOffice.name}]` : body.offTopic ? " [not about CSULB: example questions]" : "") : "";
  const followUps = body.followUps?.length ? ` [follow-ups: ${body.followUps.map((q) => `"${q}"`).join(" | ")}]` : "";
  const tryPage = body.type === "fallback" && body.suggestion ? ` [Try: ${body.suggestion.title}]` : "";
  const beachsync = body.beachsyncSearch ? ` [BeachSync: "${body.beachsyncSearch.term}"]` : "";
  return `${corrected}${body.type}: ${text.length > 140 ? `${text.slice(0, 137)}...` : text}${sources}${help}${tryPage}${beachsync}${followUps}`;
}

const cell = (text: string | undefined) => (text ?? "-").replace(/\|/g, "\\|").replace(/\n/g, " ");

async function main() {
  const allTests = (JSON.parse(await readFile(TESTS_FILE, "utf8")) as { tests: Test[] }).tests;
  const tests = ONLY ? allTests.filter((t) => ONLY.includes(t.id)) : allTests;

  // Make sure the app is running before we start.
  try {
    await fetch(APP_URL, { signal: AbortSignal.timeout(10_000) });
  } catch {
    console.error(`Can't reach the app at ${APP_URL}. Start it first with: npm run dev`);
    process.exit(1);
  }

  const rows: { test: Test; question: string; passed: boolean; problems: string[]; summary: string; model: string; answer: string; ms: number }[] = [];
  let calledGemini = false;

  for (const test of tests) {
    const question = test.questionRepeat ? test.questionRepeat.text.repeat(test.questionRepeat.times) : test.question;
    const usesAi = test.type !== "invalid";
    if (usesAi && calledGemini) await sleep(DELAY_MS); // space out AI calls to avoid rate limits

    let ms = 0; // how long the (last) request took, not counting any wait before a retry
    const run = async (): Promise<ApiResult> => {
      const started = Date.now();
      try {
        return test.runWithoutApiKey ? await askWithoutApiKey(question) : await askApp(question, test.history);
      } catch (err) {
        return { httpStatus: 0, body: { error: { code: "request_failed", message: (err as Error).message } } };
      } finally {
        ms = Date.now() - started;
      }
    };
    let result = await run();
    // Gemini busy (rate-limited or overloaded)? Wait and try once more, unless the test expects an error.
    let retried = false;
    if (usesAi && BUSY_ERRORS.includes(result.body.error?.code ?? "") && test.expect.response !== "error") {
      console.log(`        Gemini busy (${result.body.error?.code}); waiting ${RETRY_WAIT_MS / 1000}s and retrying once...`);
      await sleep(RETRY_WAIT_MS);
      result = await run();
      retried = true;
    }
    if (usesAi) calledGemini = true;

    const problems = check(test, result);
    const model = (result.body.error ? "-" : (result.body.model ?? "none (no AI needed)")) + (retried ? " (retried once)" : "");
    const row = {
      test,
      question,
      passed: problems.length === 0,
      problems,
      summary: summarize(result),
      model,
      answer: result.body.answer ?? result.body.error?.message ?? "",
      ms,
    };
    rows.push(row);
    const shortQ = (test.history?.length ? "(follow-up) " : "") + question;
    const shortQShown = shortQ.length > 60 ? `${shortQ.slice(0, 57)}...` : shortQ || "(empty)";
    console.log(`${row.passed ? "PASS" : "FAIL"}  #${String(test.id).padStart(2)}  ${test.type.padEnd(11)} ${shortQShown}`);
    if (!row.passed) {
      console.log(`        -> ${problems.join("; ")}`);
      // Entry 34: the full answer, so a failure can be judged later (the table cuts it at 140 characters).
      if (result.body.answer) console.log(`        answer: ${result.body.answer.replace(/\s+/g, " ")}`);
    }
    if (ONLY) console.log(`        ${row.summary}  [${model}, ${(ms / 1000).toFixed(1)}s]`);
    // Entry 36: for club and community questions, what it named, what it cited, and the BeachSync term.
    if (test.expect.clubsFromSources || test.expect.noClubsNamed) {
      const b = result.body;
      console.log(`        named: ${JSON.stringify(namedOrgs(b.answer ?? ""))} | cited: ${JSON.stringify((b.sources ?? []).map((s) => s.title))} | BeachSync: ${b.beachsyncSearch ? JSON.stringify(b.beachsyncSearch.term) : "none"} | ${b.type}`);
    }
  }

  // Results table for the terminal and for docs/test-results.md.
  const passed = rows.filter((r) => r.passed).length;
  const byType = [...new Set(tests.map((t) => t.type))]
    .map((type) => {
      const ofType = rows.filter((r) => r.test.type === type);
      return `${type} ${ofType.filter((r) => r.passed).length}/${ofType.length}`;
    })
    .join(", ");
  // Response times for questions answered by Gemini (not small talk, crisis, or no-AI fallbacks).
  const aiTimes = rows.filter((r) => r.model.startsWith("gemini")).map((r) => r.ms).sort((a, b) => a - b);
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const timing = aiTimes.length
    ? `Response time with Gemini (${aiTimes.length} questions): average ${seconds(aiTimes.reduce((a, b) => a + b, 0) / aiTimes.length)}, median ${seconds(aiTimes[Math.floor(aiTimes.length / 2)])}, slowest ${seconds(aiTimes[aiTimes.length - 1])}.`
    : "No questions used Gemini.";
  const models = [...new Set(rows.map((r) => r.model.replace(" (retried once)", "")).filter((m) => m.startsWith("gemini")))].join(", ") || "none";

  const lines = [
    `# Test Results: CSULB Services RAG Assistant (${TESTS_FILE})`,
    "",
    `Run on ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} (Pacific) with \`npm run test:questions\`, against ${APP_URL}.`,
    "",
    `**${passed} of ${rows.length} passed** (${byType}). Gemini models that answered: ${models}.`,
    "",
    `${timing} (Times don't include the wait before a retry.)`,
    "",
    `Each test is checked automatically: the response type (answer / clarify / fallback / error), facts that must appear, and text that must not appear. The checks are listed in \`${TESTS_FILE}\`.${tests.some((t) => t.runWithoutApiKey) ? " The missing-API-key test calls the real \`/api/chat\` route code inside the test script with \`GEMINI_API_KEY\` removed, because the running app has a key." : ""} If Gemini is rate-limited or overloaded, the script waits ${RETRY_WAIT_MS / 1000} seconds and retries once; those rows say \"(retried once)\" in the Model column.`,
    "",
    "| # | Question | Type | Expected behavior | Expected fact | Actual | Result | Model | Time |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => {
      const followUp = r.test.history?.length ? `(after: "${r.test.history.filter((m) => m.role === "user").map((m) => m.content).join(" / ")}") ` : "";
      const q = followUp + (r.question.length > 80 ? `${r.question.slice(0, 77)}... (${r.question.length} chars)` : r.question || "(empty)");
      return `| ${r.test.id} | ${cell(q)} | ${r.test.type} | ${cell(r.test.expected_behavior)} | ${cell(r.test.expected_fact)} | ${cell(r.summary)} | ${r.passed ? "PASS" : "**FAIL**"} | ${cell(r.model)} | ${seconds(r.ms)} |`;
    }),
  ];
  const failures = rows.filter((r) => !r.passed);
  if (failures.length) {
    lines.push("", "## Failures", "");
    for (const f of failures) {
      lines.push(`### #${f.test.id}: ${cell(f.question || "(empty)")}`, "", `- Problems: ${f.problems.join("; ")}`, `- Full answer: ${cell(f.answer)}`, "");
    }
  }
  console.log(`\n${passed} of ${rows.length} passed (${byType}). Models: ${models}.`);
  console.log(timing);
  if (ONLY) {
    console.log(`Ran only tests ${ONLY.join(", ")}, so ${RESULTS_FILE} was not changed.`);
  } else {
    await writeFile(RESULTS_FILE, `${lines.join("\n")}\n`);
    console.log(`Saved ${RESULTS_FILE}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
