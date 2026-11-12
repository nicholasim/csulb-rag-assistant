/**
 * build-embeddings.ts: embeds every knowledge chunk and every CSULB office with Gemini and saves
 * the vectors in data/ (Step A1, prompt log Entries 16-17). Run it after `npm run fetch-sources`:
 *
 *   npm run embeddings
 *
 * Two sets are embedded:
 *   chunks   the knowledge base (for meaning-based search)
 *   offices  each office's name + one-line description from lib/data/directory.json
 *            (to pick the "Who can help" office for a fallback)
 *
 * Built to scale to a full-site crawl (thousands of pages) on the free tier:
 *   - Incremental: an item is only embedded if it's new or its text changed (by fingerprint);
 *     unchanged items reuse their saved vector, and items that no longer exist are dropped.
 *   - Batched: 50 items per request, with a short pause between requests.
 *   - Patient: if Gemini says "too many requests" (429) or "busy" (503), wait and try again.
 *   - Resumable: progress is saved after every batch, so a stopped run continues where it left off.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { GoogleGenAI } from "@google/genai";

loadEnvConfig(process.cwd()); // read GEMINI_API_KEY from .env.local (never printed)

const BATCH_SIZE = 50;
const PAUSE_MS = 1_000; // between batches
const RETRY_WAIT_MS = 30_000; // after a 429/503
const MAX_TRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Item = { id: string; text: string };

async function main() {
  const { loadChunks } = await import("../lib/knowledge");
  const { OFFICES } = await import("../lib/directory");
  const store = await import("../lib/embeddings-store");
  const { EMBEDDING_MODEL, DIMENSIONS, DATA_DIR, vectorsFile, indexFile, embeddingText, officeText, textHash, normalize, readStore } = store;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing (add it to .env.local)");
  const client = new GoogleGenAI({ apiKey });

  /** Embed one set incrementally and save it to data/. */
  async function embedSet(set: "chunks" | "offices", items: Item[]) {
    const hashOf = (item: Item) => textHash(item.text);
    // Vectors we already have, by fingerprint (only if made with the same model and size).
    const known = new Map<string, Float32Array>();
    const saved = readStore(set);
    if (saved && saved.index.model === EMBEDDING_MODEL && saved.index.dimensions === DIMENSIONS) {
      saved.index.chunks.forEach(({ hash }, i) => known.set(hash, saved.vectors.slice(i * DIMENSIONS, (i + 1) * DIMENSIONS)));
    }
    const todo = items.filter((item) => !known.has(hashOf(item)));
    console.log(`${set}: ${items.length} items, ${items.length - todo.length} unchanged, ${todo.length} to embed with ${EMBEDDING_MODEL}`);

    /** Save every item that has a vector so far (in order). */
    const save = () => {
      const rows = items.filter((item) => known.has(hashOf(item)));
      const vectors = new Float32Array(rows.length * DIMENSIONS);
      rows.forEach((item, i) => vectors.set(known.get(hashOf(item))!, i * DIMENSIONS));
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(vectorsFile(set), Buffer.from(vectors.buffer));
      writeFileSync(indexFile(set), `${JSON.stringify({ model: EMBEDDING_MODEL, dimensions: DIMENSIONS, chunks: rows.map((item) => ({ id: item.id, hash: hashOf(item) })) }, null, 1)}\n`);
      return rows.length;
    };

    for (let start = 0; start < todo.length; start += BATCH_SIZE) {
      const batch = todo.slice(start, start + BATCH_SIZE);
      for (let attempt = 1; ; attempt++) {
        try {
          const response = await client.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: batch.map((item) => item.text),
            config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: DIMENSIONS },
          });
          const embeddings = response.embeddings ?? [];
          if (embeddings.length !== batch.length) throw new Error(`expected ${batch.length} vectors, got ${embeddings.length}`);
          batch.forEach((item, i) => known.set(hashOf(item), normalize(embeddings[i].values ?? [])));
          break;
        } catch (err) {
          const status = (err as { status?: number }).status;
          if ((status === 429 || status === 503) && attempt < MAX_TRIES) {
            console.log(`  Gemini busy (${status}); waiting ${RETRY_WAIT_MS / 1000}s (try ${attempt} of ${MAX_TRIES})`);
            await sleep(RETRY_WAIT_MS);
            continue;
          }
          save(); // keep what we have, so the next run continues from here
          throw err;
        }
      }
      console.log(`  embedded ${Math.min(start + BATCH_SIZE, todo.length)} of ${todo.length}; saved ${save()} vectors`);
      if (start + BATCH_SIZE < todo.length) await sleep(PAUSE_MS);
    }
    console.log(`  done: ${save()} ${set} vectors (${DIMENSIONS} numbers each)`);
  }

  await embedSet("chunks", loadChunks().map((chunk) => ({ id: chunk.id, text: embeddingText(chunk) })));
  await embedSet("offices", OFFICES.map((office) => ({ id: office.url, text: officeText(office) })));
}

main().catch((err) => {
  console.error(`Embedding stopped: ${(err as Error).message}. Run it again to continue.`);
  process.exit(1);
});
