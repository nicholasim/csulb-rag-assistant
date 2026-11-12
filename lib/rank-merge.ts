/**
 * rank-merge.ts: combines several ranked lists of chunks into one (Reciprocal Rank Fusion).
 *
 * We search more than once per question: the question itself, each rewritten query (A2), and
 * later a meaning-based search for each query (A1). Their raw scores aren't comparable, so we
 * only use each chunk's PLACE in each list: a chunk gets 1 / (60 + place) from every list it's
 * in, and the totals decide the final order. A chunk that ranks well in several lists wins;
 * a chunk that is #1 in one list still scores well. 60 is the standard value from the original
 * RRF paper; it keeps one list's #1 from outweighing everything else.
 */
import type { Chunk } from "./knowledge";
import type { SearchResult } from "./retrieval";

const RRF_K = 60;

/** Merge ranked lists into one list of the best `limit` chunks. `score` is the merged RRF score. */
export function mergeRankings(lists: Chunk[][], limit: number): SearchResult[] {
  const totals = new Map<string, { chunk: Chunk; score: number }>();
  for (const list of lists) {
    list.forEach((chunk, i) => {
      const entry = totals.get(chunk.id) ?? { chunk, score: 0 };
      entry.score += 1 / (RRF_K + i + 1); // i + 1 = the chunk's place in this list
      totals.set(chunk.id, entry);
    });
  }
  return [...totals.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
