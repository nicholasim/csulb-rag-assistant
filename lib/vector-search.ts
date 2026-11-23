/**
 * vector-search.ts: meaning-based search (Step A1, prompt log Entry 16).
 *
 * Keyword search (retrieval.ts) only finds chunks that share words with the question. This finds
 * chunks that MEAN something similar: we turn each search query into an embedding (768 numbers)
 * with one Gemini call, and compare it with the saved embedding of every chunk
 * (data/embeddings.bin, made by `npm run embeddings`). Closer numbers = closer meaning.
 *
 * It only adds results. If anything is missing or fails (no saved vectors, a different model,
 * a slow or failed Gemini call), it returns nothing and the app uses keyword search alone.
 *
 * Speed: comparing against every chunk takes well under a millisecond for our ~300 chunks, and
 * about 10 ms at ~10,000 chunks. A crawl of 50,000+ chunks would want an approximate index;
 * this file's interface would stay the same.
 */
import { GoogleGenAI } from "@google/genai";
import { loadChunks, type Chunk } from "./knowledge";
import { chunkHash, DIMENSIONS, EMBEDDING_MODEL, normalize, readStore } from "./embeddings-store";
import { errorKind } from "./gemini";

const TIMEOUT_MS = 3_000; // after this, skip meaning-based search for this question

type Loaded = { chunks: Chunk[]; vectors: Float32Array } | null;
let loaded: Loaded | undefined;

/** Load the saved vectors once, keeping only chunks whose text hasn't changed since they were embedded. */
function load(): Loaded {
  if (loaded !== undefined) return loaded;
  loaded = null;
  try {
    const store = readStore();
    if (!store) {
      console.warn("[vectors] no data/embeddings files; using keyword search only (run npm run embeddings)");
      return loaded;
    }
    if (store.index.model !== EMBEDDING_MODEL || store.index.dimensions !== DIMENSIONS) {
      console.warn("[vectors] saved vectors use a different model or size; using keyword search only (run npm run embeddings)");
      return loaded;
    }
    const byId = new Map(loadChunks().map((c) => [c.id, c]));
    const chunks: Chunk[] = [];
    const rows: number[] = [];
    store.index.chunks.forEach(({ id, hash }, row) => {
      const chunk = byId.get(id);
      if (chunk && chunkHash(chunk) === hash) {
        chunks.push(chunk);
        rows.push(row);
      }
    });
    const missing = byId.size - chunks.length;
    if (missing > 0) console.warn(`[vectors] ${missing} chunk(s) changed or are new since the last npm run embeddings; they're found by keyword search only`);
    const vectors = new Float32Array(chunks.length * DIMENSIONS);
    rows.forEach((row, i) => vectors.set(store.vectors.subarray(row * DIMENSIONS, (row + 1) * DIMENSIONS), i * DIMENSIONS));
    loaded = { chunks, vectors };
  } catch (err) {
    console.warn(`[vectors] couldn't read data/embeddings files (${(err as Error).message}); using keyword search only`);
  }
  return loaded;
}

export type VectorResult = { chunk: Chunk; similarity: number };

/**
 * For each query, the `limit` chunks closest in meaning (similarity from -1 to 1; higher is closer),
 * plus the query vectors themselves (so the "Who can help" office can be picked without another call).
 * Returns empty lists (and the app keeps going with keyword search) if anything goes wrong.
 */
export async function vectorSearch(queries: string[], limit = 10): Promise<{ lists: VectorResult[][]; queryVectors: Float32Array[] }> {
  const none = { lists: [], queryVectors: [] };
  const data = load();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!data || !apiKey || queries.length === 0) return none;
  try {
    // One request embeds all of this question's queries together.
    const response = await new GoogleGenAI({ apiKey }).models.embedContent({
      model: EMBEDDING_MODEL,
      contents: queries,
      config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: DIMENSIONS, httpOptions: { timeout: TIMEOUT_MS } },
    });
    // Cost log (Entry 23). The embedding API doesn't return token counts, so estimate ~4 characters per token.
    console.info(`[usage] embed model=${EMBEDDING_MODEL} texts=${queries.length} est_tokens=${Math.ceil(queries.join(" ").length / 4)}`);
    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== queries.length) throw new Error("wrong number of vectors");
    const queryVectors = embeddings.map((e) => normalize(e.values ?? []));
    const lists = queryVectors.map((query) =>
      data.chunks
        .map((chunk, i) => ({ chunk, similarity: dot(query, data.vectors, i) }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit),
    );
    return { lists, queryVectors };
  } catch (err) {
    console.warn(`[vectors] skipped (${errorKind(err)}); using keyword search only`);
    return none;
  }
}

/** Cosine similarity between a query vector and row `row` of a vector table (both have length 1). */
export function dot(query: Float32Array, table: Float32Array, row: number) {
  let sum = 0;
  for (let d = 0; d < DIMENSIONS; d++) sum += query[d] * table[row * DIMENSIONS + d];
  return sum;
}
