/**
 * embeddings-store.ts: shared by the build script (scripts/build-embeddings.ts) and the app
 * (vector-search.ts), so both agree on what text gets embedded and where vectors are saved.
 *
 * An "embedding" is a list of 768 numbers that describes what a piece of text MEANS. Texts about
 * the same thing get similar numbers even if they use different words ("rec center" vs
 * "Student Recreation and Wellness Center"). We embed every chunk once, ahead of time, and save
 * the numbers in data/ so the app (and Vercel) never has to re-embed them.
 *
 * Files (both committed to git):
 *   data/embeddings.bin   all vectors, one after another, as 32-bit floats (compact, fast to load)
 *   data/embeddings.json  which chunk each vector belongs to, plus a fingerprint of its text
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Chunk } from "./knowledge";

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";
export const DIMENSIONS = 768; // a good size/quality balance; 3072 is the maximum
export const DATA_DIR = path.join(process.cwd(), "data");
export const VECTORS_FILE = path.join(DATA_DIR, "embeddings.bin");
export const INDEX_FILE = path.join(DATA_DIR, "embeddings.json");

export type EmbeddingIndex = {
  model: string;
  dimensions: number;
  chunks: { id: string; hash: string }[]; // row i of embeddings.bin belongs to chunks[i]
};

/** The text we embed for a chunk: where it's from plus what it says (links removed). */
export function embeddingText(chunk: Chunk) {
  const text = chunk.text.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, " ");
  return `${chunk.title} > ${chunk.heading}\n${text}`.slice(0, 6000); // the model reads up to about 2,000 tokens
}

/** A fingerprint of a chunk's text. If the page changes, the fingerprint changes and we re-embed it. */
export function chunkHash(chunk: Chunk) {
  return createHash("sha256").update(embeddingText(chunk)).digest("hex").slice(0, 16);
}

/** Make a vector length 1, so comparing two vectors is a simple dot product (cosine similarity). */
export function normalize(values: number[]): Float32Array {
  const length = Math.sqrt(values.reduce((sum, x) => sum + x * x, 0)) || 1;
  return Float32Array.from(values, (x) => x / length);
}

/** Read the saved vectors, or null if they don't exist yet. */
export function readStore(): { index: EmbeddingIndex; vectors: Float32Array } | null {
  if (!existsSync(INDEX_FILE) || !existsSync(VECTORS_FILE)) return null;
  const index = JSON.parse(readFileSync(INDEX_FILE, "utf8")) as EmbeddingIndex;
  const buffer = readFileSync(VECTORS_FILE);
  const vectors = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  if (vectors.length !== index.chunks.length * index.dimensions) throw new Error("embeddings.bin doesn't match embeddings.json");
  return { index, vectors };
}
