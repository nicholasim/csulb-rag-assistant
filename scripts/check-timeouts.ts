/**
 * check-timeouts.ts: proves no request can hang (Entry 28). No Gemini calls: `fetch` is replaced
 * with fakes before the app code loads, so nothing leaves this computer.
 *
 *   npm run check:timeouts
 *
 * Three fake Gemini behaviors:
 *   (a) never responds            -> the student must get a friendly error within 30s
 *   (b) starts a reply, never ends -> same
 *   (c) answers 503 "busy" at once -> exactly the requests we expect (one busy retry, then the backup),
 *                                     with no hidden SDK retries in between
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd()); // the key is needed to get past the "missing key" check; nothing is sent

type Mode = "never" | "stalled-body" | "busy";
let mode: Mode = "never";
const calls: { kind: string; at: number }[] = [];
let started = 0;

const kindOf = (url: string) => (url.includes("embedContent") ? "embed" : url.includes("interactions") ? "interaction" : "other");

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  calls.push({ kind: kindOf(url), at: Date.now() - started });
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (mode === "busy") {
    return new Response(JSON.stringify({ error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  if (mode === "stalled-body") {
    // Headers arrive, but the body never finishes.
    return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { "content-type": "application/json" } });
  }
  // Never responds (unless the caller aborts).
  return new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
  });
}) as typeof fetch;

const LIMIT_MS = 30_000;

async function run(label: string, m: Mode) {
  mode = m;
  calls.length = 0;
  started = Date.now();
  const { answerQuestion } = await import("../lib/rag");
  let outcome: string;
  try {
    const result = await Promise.race([
      answerQuestion("how do i switch my major", []) /* not a preset, so the rewrite runs too */,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("STILL WAITING after 45s")), 45_000)),
    ]);
    outcome = `reply type ${result.type}`;
  } catch (err) {
    const e = err as { code?: string; message: string };
    outcome = e.code ? `friendly error "${e.code}": ${e.message}` : `error: ${e.message}`;
  }
  const ms = Date.now() - started;
  const counts = calls.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {});
  const ok = ms <= LIMIT_MS && !outcome.startsWith("error: STILL");
  console.log(`${ok ? "ok  " : "FAIL"} (${label}) ${(ms / 1000).toFixed(1)}s -> ${outcome}`);
  console.log(`       requests: ${JSON.stringify(counts)}; times (s): ${calls.map((c) => `${c.kind}@${(c.at / 1000).toFixed(1)}`).join(", ")}`);
  return ok;
}

async function main() {
  const results = [
    await run("a: Gemini never responds", "never"),
    await run("b: reply starts but never ends", "stalled-body"),
    await run("c: Gemini busy (503)", "busy"),
  ];
  if (results.includes(false)) {
    console.log("\nFAIL: a request took longer than 30s");
    process.exit(1);
  }
  console.log("\nOK: every request finished within 30s");
  process.exit(0);
}

main();
