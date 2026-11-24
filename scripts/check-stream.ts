/**
 * check-stream.ts: offline check of the progress-step stream (Entry 29). No Gemini calls: `fetch`
 * is replaced so every Gemini request gets a quick 503 "busy" reply. That's enough to see which
 * steps each kind of question sends, in which order, and how the stream ends.
 *
 *   npm run check:stream
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd()); // the key only gets us past the "missing key" check; nothing is sent

globalThis.fetch = (async () =>
  new Response(JSON.stringify({ error: { code: 503, message: "busy", status: "UNAVAILABLE" } }), {
    status: 503,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

type Event = { event: string; stage?: string; pages?: number; sections?: number; data?: { type?: string }; error?: { code: string } };

async function main() {
  const { POST } = await import("../app/api/chat/route");
  const { knowledgePageCount } = await import("../lib/knowledge");
  const pages = knowledgePageCount();

  const call = (question: string, stream: boolean) =>
    POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(stream ? { Accept: "application/x-ndjson" } : {}) },
        body: JSON.stringify({ question, history: [] }),
      }),
    );
  const events = async (question: string) => {
    const res = await call(question, true);
    const text = await res.text();
    return { type: res.headers.get("content-type") ?? "", events: text.trim().split("\n").map((l) => JSON.parse(l) as Event) };
  };
  const describe = (evs: Event[]) =>
    evs.map((e) => (e.event === "stage" ? `${e.stage}(${e.pages ?? e.sections})` : e.event === "result" ? `result:${e.data?.type}` : `error:${e.error?.code}`)).join(" -> ");

  let failures = 0;
  const check = (label: string, ok: boolean, detail: string) => {
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${detail}`);
  };

  // 1. A question our pages answer: searching, then reading (Gemini is "busy" here, so it ends in a friendly error).
  const a = await events("How much is a semester student parking permit?");
  const aStages = a.events.filter((e) => e.event === "stage");
  check(
    "answerable question",
    a.type.includes("application/x-ndjson") && aStages[0]?.stage === "searching" && aStages[0]?.pages === pages && aStages[1]?.stage === "reading" && (aStages[1]?.sections ?? 0) > 0 && a.events.at(-1)?.event !== "stage",
    describe(a.events),
  );
  // 2. Nothing matches: a fallback without Gemini, so only "searching", never "reading".
  const f = await events("asdfgh qwerty zxcvb");
  check("no-match fallback", f.events.filter((e) => e.event === "stage").map((e) => e.stage).join() === "searching" && f.events.at(-1)?.data?.type === "fallback", describe(f.events));
  // 3. Small talk and crisis replies: no steps at all.
  const s = await events("hi");
  check("small talk", s.events.length === 1 && s.events[0].data?.type === "chat", describe(s.events));
  const c = await events("I want to kill myself");
  check("crisis message", c.events.length === 1 && c.events[0].event === "result", describe(c.events));
  // 4. An input problem: no steps, just the friendly error.
  const e = await events("");
  check("empty question", e.events.length === 1 && e.events[0].error?.code === "empty_question", describe(e.events));
  // 5. Without the Accept header: the plain JSON reply, exactly as before (the test runner uses this).
  const plain = await call("hi", false);
  const body = (await plain.json()) as { type?: string };
  check("plain JSON (no Accept header)", (plain.headers.get("content-type") ?? "").includes("application/json") && body.type === "chat", `content-type ${plain.headers.get("content-type")}, type ${body.type}`);

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nOK: progress steps are sent only when they really happen, in order");
  process.exit(0);
}

main();
