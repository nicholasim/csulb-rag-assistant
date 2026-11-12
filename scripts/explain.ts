/**
 * explain.ts: shows HOW the assistant searched for a question, step by step. For debugging and
 * for the presentation ("why did it pick this page?").
 *
 *   npm run explain -- "how much $$ to park for the whole yr"
 *
 * Prints the rewritten search queries (Step A2), the top keyword (BM25) matches and the top
 * meaning-based (embedding, Step A1) matches for each query, and the merged top 5 Gemini would receive. It does NOT write an answer (no answer call).
 * Needs GEMINI_API_KEY in .env.local for the rewrite step; without it, it shows the plain search.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd()); // read .env.local like the app does (the key is never printed)

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.log('Usage: npm run explain -- "your question"');
    process.exit(1);
  }
  // Import after the env is loaded.
  const { correctSpelling } = await import("../lib/spelling");
  const { rewriteQuestion, removePersonalDetails } = await import("../lib/rewrite");
  const { search } = await import("../lib/retrieval");
  const { mergeRankings } = await import("../lib/rank-merge");
  const { vectorSearch } = await import("../lib/vector-search");

  const spelling = correctSpelling(question);
  console.log(`\nQuestion: ${question}`);
  if (spelling.changes.length) console.log(`Spelling: ${spelling.corrected}`);

  const started = Date.now();
  const rewritten = await rewriteQuestion(question, []);
  console.log(`Rewrite (${Date.now() - started} ms): ${rewritten ? rewritten.map((q) => `"${q}"`).join(" | ") : "(skipped: no key or error)"}`);

  const queries = [...new Set([spelling.corrected, ...(rewritten ?? [])].map(removePersonalDetails).filter(Boolean))];
  const lists = queries.map((q) => search(q, 10));
  queries.forEach((q, i) => {
    console.log(`\nKeyword search: "${q}"`);
    for (const r of lists[i].slice(0, 5)) console.log(`  ${r.score.toFixed(2).padStart(6)}  ${r.chunk.id}  (${r.chunk.heading.slice(0, 60)})`);
  });

  const { lists: meaning, queryVectors } = await vectorSearch(queries, 10);
  queries.forEach((q, i) => {
    if (!meaning[i]) return;
    console.log(`\nMeaning search: "${q}"`);
    for (const r of meaning[i].slice(0, 5)) console.log(`  ${r.similarity.toFixed(3).padStart(6)}  ${r.chunk.id}  (${r.chunk.heading.slice(0, 60)})`);
  });
  if (!meaning.length) console.log("\nMeaning search: skipped (no saved embeddings or the call failed)");

  const best = Math.max(0, ...lists.map((l) => l[0]?.score ?? 0));
  console.log(`\nBest keyword score: ${best.toFixed(2)} (needs 3.0 or more to ask Gemini)`);
  console.log("Merged top 5 sent to Gemini:");
  const merged = mergeRankings([...lists.map((l) => l.map((x) => x.chunk)), ...meaning.map((l) => l.map((x) => x.chunk))], 5);
  for (const r of merged) console.log(`  ${r.score.toFixed(4)}  ${r.chunk.id}  (${r.chunk.heading.slice(0, 60)})`);

  // What a fallback would show (Entry 17). If the question reaches Gemini, Gemini's own pick
  // (related_office) and its about_csulb answer come first; this shows what's used without them.
  const { pickHelpOffice, rankOfficesByMeaning, OFF_TOPIC_SIMILARITY, MIN_OFFICE_SIMILARITY } = await import("../lib/help-office");
  const bestSimilarity = Math.max(0, ...meaning.map((l) => l[0]?.similarity ?? 0));
  console.log(`\nIf this falls back (${best >= 3 ? "Gemini is asked first; its office pick and about-CSULB answer win" : "no Gemini: decided here"}):`);
  console.log(`  closest chunk by meaning ${bestSimilarity.toFixed(3)} (below ${OFF_TOPIC_SIMILARITY} = not about CSULB, for fallbacks without Gemini)`);
  for (const r of rankOfficesByMeaning(queryVectors, 3)) console.log(`  office by meaning ${r.similarity.toFixed(3)}  ${r.office.name}${r.similarity >= MIN_OFFICE_SIMILARITY ? "" : "  (below " + MIN_OFFICE_SIMILARITY + ")"}`);
  const strongOffice = (rankOfficesByMeaning(queryVectors, 1)[0]?.similarity ?? 0) >= MIN_OFFICE_SIMILARITY;
  if (best < 3 && queryVectors.length && !strongOffice && bestSimilarity < OFF_TOPIC_SIMILARITY) console.log("  -> not about CSULB: example questions, no office");
  else {
    const office = pickHelpOffice(null, queryVectors);
    console.log(`  -> Who can help: ${office.name} (${office.reason === "meaning" ? "closest by meaning" : "default"})${office.phone ? `, ${office.phone}` : ""}${office.email ? `, ${office.email}` : ""}`);
  }
}

main();
