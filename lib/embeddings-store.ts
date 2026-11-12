/**
 * embeddings-store.ts: shared by the build script (scripts/build-embeddings.ts) and the app
 * (vector-search.ts), so both agree on what text gets embedded and where vectors are saved.
 *
 * An "embedding" is a list of 768 numbers that describes what a piece of text MEANS. Texts about
 * the same thing get similar numbers even if they use different words ("rec center" vs
 * "Student Recreation and Wellness Center"). We embed every chunk once, ahead of time, and save
 * the numbers in data/ so the app (and Vercel) never has to re-embed them.
 *
 * Files (all committed to git), one pair per set:
 *   data/embeddings.bin / .json          knowledge chunks (for meaning-based search)
 *   data/office-embeddings.bin / .json   CSULB offices, name + description (for "Who can help")
 * The .bin file holds all vectors one after another as 32-bit floats (compact, fast to load);
 * the .json file says which item each vector belongs to, plus a fingerprint of its text.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Chunk } from "./knowledge";

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";
export const DIMENSIONS = 768; // a good size/quality balance; 3072 is the maximum
export const DATA_DIR = path.join(process.cwd(), "data");
export type EmbeddingSet = "chunks" | "offices";
const FILE_PREFIX: Record<EmbeddingSet, string> = { chunks: "embeddings", offices: "office-embeddings" };
export const vectorsFile = (set: EmbeddingSet) => path.join(DATA_DIR, `${FILE_PREFIX[set]}.bin`);
export const indexFile = (set: EmbeddingSet) => path.join(DATA_DIR, `${FILE_PREFIX[set]}.json`);

export type EmbeddingIndex = {
  model: string;
  dimensions: number;
  chunks: { id: string; hash: string }[]; // row i of the .bin file belongs to chunks[i] (a chunk or an office)
};

/** The text we embed for a chunk: where it's from plus what it says (links removed). */
export function embeddingText(chunk: Chunk) {
  const text = chunk.text.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, " ");
  return `${chunk.title} > ${chunk.heading}\n${text}`.slice(0, 6000); // the model reads up to about 2,000 tokens
}

/** A fingerprint of some text. If the text changes, the fingerprint changes and we re-embed it. */
export function textHash(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** A chunk's fingerprint. */
export function chunkHash(chunk: Chunk) {
  return textHash(embeddingText(chunk));
}

/** The text we embed for an office: its name, its one-line description, and our matching keywords. */
export function officeText(office: { name: string; description: string; keywords?: string[] }) {
  const keywords = office.keywords?.length ? ` Handles: ${office.keywords.join(", ")}.` : "";
  return `${office.name}${office.description ? `: ${office.description}` : ""}${keywords}`;
}

/** Make a vector length 1, so comparing two vectors is a simple dot product (cosine similarity). */
export function normalize(values: number[]): Float32Array {
  const length = Math.sqrt(values.reduce((sum, x) => sum + x * x, 0)) || 1;
  return Float32Array.from(values, (x) => x / length);
}

/** Read a set's saved vectors, or null if they don't exist yet. */
export function readStore(set: EmbeddingSet = "chunks"): { index: EmbeddingIndex; vectors: Float32Array } | null {
  if (!existsSync(indexFile(set)) || !existsSync(vectorsFile(set))) return null;
  const index = JSON.parse(readFileSync(indexFile(set), "utf8")) as EmbeddingIndex;
  const buffer = readFileSync(vectorsFile(set));
  const vectors = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  if (vectors.length !== index.chunks.length * index.dimensions) throw new Error(`${FILE_PREFIX[set]}.bin doesn't match ${FILE_PREFIX[set]}.json`);
  return { index, vectors };
}
