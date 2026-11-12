/**
 * retrieval.ts: finds the chunks that best match a question (the "R" in RAG).
 *
 * We use BM25, a classic keyword-ranking formula that search engines have used for decades.
 * In plain English, a chunk scores higher when:
 *   1. it contains more of the question's words,
 *   2. those words are rare across the knowledge base ("taco" counts for more than "student"),
 *   3. and it's not just long and full of every word (shorter, focused chunks win ties).
 * No AI and no vector database: just counting words.
 */
import { loadChunks, type Chunk } from "./knowledge";

// Common words that don't help find the right page ("how", "do", "the", ...).
// "csulb" and "campus" are here too, since nearly every page is about CSULB's campus.
const STOP_WORDS = new Set(
  `a about am an and any are as at be been but by can could did do does for from get got had has have
  he her here how i if in into is it its just me my of on or our please she should so some tell than
  that the their them then there these they this to too us was we were what when where which who whom
  why will with would you your csulb campus`.split(/\s+/),
);

/** Very light "stemming" so plurals match singulars: "tacos" -> "taco", "fees" -> "fee". */
function stem(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(sses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// Students and web pages often use different words for the same thing.
// When a question uses a word on the left, we also search for the words on the right.
const SYNONYMS: Record<string, string[]> = {
  much: ["price", "fee"], // "how much is ..." -> pages list "Price" / "Fees"
  cost: ["price", "fee"],
  price: ["fee"],
  tuition: ["fee", "payment"],
  pay: ["payment"],
  deadline: ["last", "day"],
  eat: ["food", "dining"],
  food: ["eat", "dining"],
  grocery: ["food", "pantry"], // "groceries" becomes "grocery" after plural trimming
  pantry: ["food"],
  advisor: ["advising"],
  advising: ["advisor"],
  professor: ["instructor", "faculty"],
  orientation: ["soar"],
  textbook: ["d1ta"],
  book: ["textbook"],
};

/** Turn text into a list of search words: lowercase, no punctuation, no stop words. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\]\([^)]*\)/g, "]") // ignore link URLs
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .map(stem);
}

// BM25's two standard tuning knobs (these are the usual textbook defaults).
const K1 = 1.2; // how quickly repeating a word stops adding points
const B = 0.75; // how much to favor shorter chunks

type Index = {
  chunks: Chunk[];
  termCounts: Map<string, number>[]; // for each chunk: word -> how many times it appears
  lengths: number[]; // number of words in each chunk
  avgLength: number;
  docFreq: Map<string, number>; // word -> how many chunks contain it
};

let index: Index | null = null;

/** Build the search index once: count the words in every chunk. */
function getIndex(): Index {
  if (index) return index;
  const chunks = loadChunks();
  const termCounts = chunks.map((chunk) => {
    // The page title, category, and section heading are searched too, so "parking" finds
    // parking pages. The heading is added twice because it says what the chunk is about.
    const counts = new Map<string, number>();
    const searchable = `${chunk.title} ${chunk.category} ${chunk.heading} ${chunk.heading} ${chunk.text}`;
    for (const word of tokenize(searchable)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return counts;
  });
  const lengths = termCounts.map((counts) => [...counts.values()].reduce((a, b) => a + b, 0));
  const docFreq = new Map<string, number>();
  for (const counts of termCounts) {
    for (const word of counts.keys()) docFreq.set(word, (docFreq.get(word) ?? 0) + 1);
  }
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  index = { chunks, termCounts, lengths, avgLength, docFreq };
  return index;
}

export type SearchResult = { chunk: Chunk; score: number };

/** Score every chunk against the question and return the best `limit` matches. */
export function search(question: string, limit = 5): SearchResult[] {
  const { chunks, termCounts, lengths, avgLength, docFreq } = getIndex();
  const words = tokenize(question);
  const queryWords = [...new Set([...words, ...words.flatMap((w) => SYNONYMS[w] ?? [])])];
  const N = chunks.length;

  const results = chunks.map((chunk, i) => {
    let score = 0;
    for (const word of queryWords) {
      const tf = termCounts[i].get(word) ?? 0; // times the word appears in this chunk
      if (tf === 0) continue;
      const df = docFreq.get(word) ?? 0; // number of chunks with this word
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5)); // rare words are worth more
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * lengths[i]) / avgLength)));
    }
    return { chunk, score };
  });

  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
