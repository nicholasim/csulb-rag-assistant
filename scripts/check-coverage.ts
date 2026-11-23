/**
 * check-coverage.ts: offline retrieval check for the question bank (tests/question-bank.json,
 * prompt log Entry 22). For every question that has expected pages, it searches the way the app
 * does without the rewrite step: keyword search + meaning search on the question as typed, merged
 * with RRF into the TOP_K chunks Gemini would see. It reports whether an expected page made it in.
 *
 *   npm run check:coverage
 *
 * No Gemini generate calls. It uses embedding calls only (all questions embedded in a few batched
 * requests, a separate quota). "Before B3" only counts pages that existed before the coverage round,
 * so the numbers show what the new pages added.
 */
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { GoogleGenAI } from "@google/genai";

loadEnvConfig(process.cwd()); // GEMINI_API_KEY from .env.local (never printed)

const TOP_K = 8; // same as lib/rag.ts
const PER_LIST = 10; // same as RESULTS_PER_QUERY in lib/rag.ts
const BATCH = 50;

type BankQuestion = { id: number; category: string; question: string; coverageBefore: string; expectedPages: string[] };

async function main() {
  const { loadChunks } = await import("../lib/knowledge");
  const { search } = await import("../lib/retrieval");
  const { mergeRankings } = await import("../lib/rank-merge");
  const { correctSpelling } = await import("../lib/spelling");
  const { dot } = await import("../lib/vector-search");
  const { readStore, chunkHash, normalize, EMBEDDING_MODEL, DIMENSIONS } = await import("../lib/embeddings-store");

  const bank: BankQuestion[] = JSON.parse(readFileSync("tests/question-bank.json", "utf8")).tests;
  const sources = readFileSync("scripts/fetch-sources.ts", "utf8");
  const b3Slugs = new Set([...sources.split("Coverage round B3")[1].matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]));
  const slugOf = (id: string) => id.split("#")[0];

  // Saved chunk vectors (only chunks whose text hasn't changed).
  const store = readStore();
  if (!store || store.index.model !== EMBEDDING_MODEL) throw new Error("no matching data/embeddings files: run npm run embeddings");
  const byId = new Map(loadChunks().map((c) => [c.id, c]));
  const rows = store.index.chunks.map(({ id, hash }, row) => ({ chunk: byId.get(id), hash, row })).filter((r) => r.chunk && chunkHash(r.chunk) === r.hash);

  // Embed every question (as typed, spelling-corrected like the app) in batches.
  const questions = bank.filter((q) => q.expectedPages.length);
  const texts = questions.map((q) => correctSpelling(q.question).corrected);
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const vectors: Float32Array[] = [];
  // The free tier counts each text in a batch as one request, 100 per minute: pace the batches,
  // and if Gemini still says 429, wait and try again (like scripts/build-embeddings.ts).
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < texts.length; i += BATCH) {
    if (i > 0) await sleep(35_000);
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await client.models.embedContent({ model: EMBEDDING_MODEL, contents: texts.slice(i, i + BATCH), config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: DIMENSIONS } });
        for (const e of res.embeddings ?? []) vectors.push(normalize(e.values ?? []));
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 429 || attempt >= 5) throw err;
        console.log(`  embedding rate limit; waiting 40s (try ${attempt} of 5)`);
        await sleep(40_000);
      }
    }
  }
  if (vectors.length !== texts.length) throw new Error("embedding count mismatch");

  /** Rank of the first expected page in the merged top K (1-based), or 0 if missing. */
  const rankFor = (qi: number, allowed: (slug: string) => boolean) => {
    const keyword = search(texts[qi], 40).map((r) => r.chunk).filter((c) => allowed(slugOf(c.id))).slice(0, PER_LIST);
    const meaning = rows
      .filter((r) => allowed(slugOf(r.chunk!.id)))
      .map((r) => ({ chunk: r.chunk!, sim: dot(vectors[qi], store.vectors, r.row) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, PER_LIST)
      .map((r) => r.chunk);
    const merged = mergeRankings([keyword, meaning], TOP_K).map((r) => slugOf(r.chunk.id));
    const expected = new Set(questions[qi].expectedPages);
    return merged.findIndex((s) => expected.has(s)) + 1;
  };

  const results = questions.map((q, i) => ({ q, before: rankFor(i, (s) => !b3Slugs.has(s)), after: rankFor(i, () => true) }));

  // By category.
  const cats = [...new Set(bank.map((q) => q.category))];
  console.log(`Expected page in the top ${TOP_K} sent to Gemini (keyword + meaning search, no rewrite)\n`);
  console.log(`${"Category".padEnd(30)} ${"Qs".padStart(3)}  Before B3  After B3`);
  for (const cat of cats) {
    const rs = results.filter((r) => r.q.category === cat);
    const noPage = bank.filter((q) => q.category === cat && !q.expectedPages.length).length;
    console.log(`${cat.padEnd(30)} ${String(rs.length + noPage).padStart(3)}  ${String(rs.filter((r) => r.before).length).padStart(9)}  ${String(rs.filter((r) => r.after).length).padStart(8)}${noPage ? `   (+${noPage} with no approved page)` : ""}`);
  }
  const total = (k: "before" | "after") => results.filter((r) => r[k]).length;
  console.log(`${"Total".padEnd(30)} ${String(bank.length).padStart(3)}  ${String(total("before")).padStart(9)}  ${String(total("after")).padStart(8)}   (${bank.length - questions.length} with no approved page)`);

  const misses = results.filter((r) => !r.after);
  console.log(`\nStill not in the top ${TOP_K} (${misses.length}):`);
  for (const r of misses) console.log(`  #${r.q.id} ${r.q.question}  (expected: ${r.q.expectedPages.join(", ")})`);
  const lost = results.filter((r) => r.before && !r.after);
  console.log(`\nFound before B3 but not after (new pages crowding out old ones): ${lost.length}`);
  for (const r of lost) console.log(`  #${r.q.id} ${r.q.question}`);
}

main().catch((err) => {
  console.error(`check-coverage failed: ${(err as Error).message}`);
  process.exit(1);
});
