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
 *
 * The "missing API key" test can't use the running app (it has a key), so it calls the real
 * /api/chat route code directly inside this script, where GEMINI_API_KEY is removed first.
 */
import { readFile, writeFile } from "node:fs/promises";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DELAY_MS = Number(process.env.DELAY_MS ?? 5000);
const TESTS_FILE = "tests/test-questions.json";
const RESULTS_FILE = "docs/test-results.md";

type Expect = {
  response: string | string[]; // "answer" | "clarify" | "fallback" | "error"
  mustInclude?: string[]; // every pattern must match
  mustIncludeAny?: string[]; // at least one pattern must match
  mustNotInclude?: string[]; // no pattern may match
  minSources?: number;
  errorCode?: string;
  httpStatus?: number;
};

type Test = {
  id: number;
  question: string;
  questionRepeat?: { text: string; times: number };
  type: string;
  area: string;
  expected_behavior: string;
  expected_fact: string;
  runWithoutApiKey?: boolean;
  expect: Expect;
};

type ApiResult = {
  httpStatus: number;
  body: {
    type?: string;
    answer?: string;
    sources?: { id: number; title: string; excerpt: string }[];
    suggestion?: { title: string; url: string } | null;
    model?: string | null;
    error?: { code: string; message: string };
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Send one question to the running app's /api/chat. */
async function askApp(question: string): Promise<ApiResult> {
  const res = await fetch(`${APP_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
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
  if (expect.minSources && (body.sources?.length ?? 0) < expect.minSources) {
    problems.push(`expected at least ${expect.minSources} source(s), got ${body.sources?.length ?? 0}`);
  }

  // What we search: the answer text plus the titles of its sources and suggested page.
  const haystack = [body.answer ?? "", body.suggestion?.title ?? "", ...(body.sources ?? []).map((s) => s.title)].join("\n");
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
  return problems;
}

/** A one-line summary of what actually came back, for the table. */
function summarize(result: ApiResult) {
  const { body, httpStatus } = result;
  if (body.error) return `HTTP ${httpStatus} error ${body.error.code}: "${body.error.message}"`;
  const text = (body.answer ?? "").replace(/\s+/g, " ").trim();
  const sources = body.sources?.length ? ` (${body.sources.length} source${body.sources.length > 1 ? "s" : ""})` : "";
  return `${body.type}: ${text.length > 140 ? `${text.slice(0, 137)}...` : text}${sources}`;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

async function main() {
  const { tests } = JSON.parse(await readFile(TESTS_FILE, "utf8")) as { tests: Test[] };

  // Make sure the app is running before we start.
  try {
    await fetch(APP_URL, { signal: AbortSignal.timeout(10_000) });
  } catch {
    console.error(`Can't reach the app at ${APP_URL}. Start it first with: npm run dev`);
    process.exit(1);
  }

  const rows: { test: Test; question: string; passed: boolean; problems: string[]; summary: string; model: string; answer: string }[] = [];
  let calledGemini = false;

  for (const test of tests) {
    const question = test.questionRepeat ? test.questionRepeat.text.repeat(test.questionRepeat.times) : test.question;
    const usesAi = test.type !== "invalid";
    if (usesAi && calledGemini) await sleep(DELAY_MS); // space out AI calls to avoid rate limits

    let result: ApiResult;
    try {
      result = test.runWithoutApiKey ? await askWithoutApiKey(question) : await askApp(question);
    } catch (err) {
      result = { httpStatus: 0, body: { error: { code: "request_failed", message: (err as Error).message } } };
    }
    if (usesAi) calledGemini = true;

    const problems = check(test, result);
    const model = result.body.error ? "-" : (result.body.model ?? "none (no AI needed)");
    const row = {
      test,
      question,
      passed: problems.length === 0,
      problems,
      summary: summarize(result),
      model,
      answer: result.body.answer ?? result.body.error?.message ?? "",
    };
    rows.push(row);
    const shortQ = question.length > 60 ? `${question.slice(0, 57)}...` : question || "(empty)";
    console.log(`${row.passed ? "PASS" : "FAIL"}  #${String(test.id).padStart(2)}  ${test.type.padEnd(11)} ${shortQ}`);
    if (!row.passed) console.log(`        -> ${problems.join("; ")}`);
  }

  // Results table for the terminal and for docs/test-results.md.
  const passed = rows.filter((r) => r.passed).length;
  const byType = [...new Set(tests.map((t) => t.type))]
    .map((type) => {
      const ofType = rows.filter((r) => r.test.type === type);
      return `${type} ${ofType.filter((r) => r.passed).length}/${ofType.length}`;
    })
    .join(", ");
  const models = [...new Set(rows.map((r) => r.model).filter((m) => m.startsWith("gemini")))].join(", ") || "none";

  const lines = [
    "# Test Results: CSULB Services RAG Assistant",
    "",
    `Run on ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} (Pacific) with \`npm run test:questions\`, against ${APP_URL}.`,
    "",
    `**${passed} of ${rows.length} passed** (${byType}). Gemini models that answered: ${models}.`,
    "",
    "Each test is checked automatically: the response type (answer / clarify / fallback / error), facts that must appear, and text that must not appear. The checks are listed in `tests/test-questions.json`. Test #25 calls the real `/api/chat` route code inside the test script with `GEMINI_API_KEY` removed, because the running app has a key.",
    "",
    "| # | Question | Type | Expected behavior | Expected fact | Actual | Result | Model |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => {
      const q = r.question.length > 80 ? `${r.question.slice(0, 77)}... (${r.question.length} chars)` : r.question || "(empty)";
      return `| ${r.test.id} | ${cell(q)} | ${r.test.type} | ${cell(r.test.expected_behavior)} | ${cell(r.test.expected_fact)} | ${cell(r.summary)} | ${r.passed ? "PASS" : "**FAIL**"} | ${cell(r.model)} |`;
    }),
  ];
  const failures = rows.filter((r) => !r.passed);
  if (failures.length) {
    lines.push("", "## Failures", "");
    for (const f of failures) {
      lines.push(`### #${f.test.id}: ${cell(f.question || "(empty)")}`, "", `- Problems: ${f.problems.join("; ")}`, `- Full answer: ${cell(f.answer)}`, "");
    }
  }
  await writeFile(RESULTS_FILE, `${lines.join("\n")}\n`);

  console.log(`\n${passed} of ${rows.length} passed (${byType}). Models: ${models}.`);
  console.log(`Saved ${RESULTS_FILE}`);
  process.exit(failures.length ? 1 : 0);
}

main();
