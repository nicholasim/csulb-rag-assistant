/**
 * spelling.ts: fixes typos in a question before we search, so "parkng permit" finds parking pages.
 *
 * Our search (retrieval.ts) matches exact words, so one typo can make it miss everything.
 * The idea, in plain English:
 *   1. Make a list of every word that appears in our CSULB pages (the "vocabulary").
 *   2. For each word in the question that is NOT in that list, find the vocabulary word that is
 *      closest to it: the fewest typos away ("edit distance").
 *   3. Swap it in only if it's close enough AND there's exactly one best match.
 *
 * Because we only ever swap in words from our own pages, and only for small typos, a question
 * about something we don't cover (tacos, Paris) stays a question about something we don't cover.
 */
import { loadChunks } from "./knowledge";
import { STOP_WORDS, SYNONYMS, tokenize } from "./retrieval";
import { isSocialWord } from "./small-talk";

const MIN_LENGTH = 4; // words shorter than this are left alone ("bok" could be "book" or "box")

/** How many typos we allow: 1 for words of 4-7 letters, 2 for words of 8 or more. */
function maxTypos(word: string) {
  return word.length >= 8 ? 2 : 1;
}

// A word must appear at least this many times in our pages to be used as a correction.
// Words that appear only once are usually a person's name: "write" must not become "white"
// (a staff member's last name). Real targets appear more often ("parking" 119 times, "tuition" 4).
const MIN_TIMES_SEEN = 2;

let vocabulary: Map<string, number> | null = null;

/**
 * Every word in the knowledge base (titles, headings, and page text), plus our synonym list,
 * with how many times each one appears.
 */
function getVocabulary(): Map<string, number> {
  if (vocabulary) return vocabulary;
  const words = new Map<string, number>();
  const add = (word: string, times = 1) => words.set(word, (words.get(word) ?? 0) + times);
  for (const chunk of loadChunks()) {
    const text = `${chunk.title} ${chunk.category} ${chunk.heading} ${chunk.text}`
      .toLowerCase()
      .replace(/\]\([^)]*\)/g, "]") // skip link addresses, they're not words students type
      .replace(/https?:\/\/\S+/g, " ");
    for (const word of text.split(/[^a-z0-9]+/)) {
      if (word) add(word);
    }
  }
  // Also the singular forms our search uses ("tacos" -> "taco"), so "taco" counts as known.
  for (const [word, times] of [...words]) {
    for (const w of tokenize(word)) if (w !== word) add(w, times);
  }
  for (const [word, related] of Object.entries(SYNONYMS)) {
    for (const w of [word, ...related]) add(w, MIN_TIMES_SEEN); // our own synonyms always count
  }
  vocabulary = words;
  return words;
}

/**
 * Edit distance: the fewest one-letter changes that turn `a` into `b`.
 * A change is adding a letter, removing a letter, replacing a letter, or swapping two letters
 * next to each other ("recieve" -> "receive" is ONE typo, not two).
 * Stops early and returns limit + 1 once the distance is clearly more than `limit`.
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  // d[i][j] = typos between the first i letters of a and the first j letters of b.
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    let rowBest = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // remove a letter
        d[i][j - 1] + 1, // add a letter
        d[i - 1][j - 1] + cost, // replace a letter (or keep it, if it matches)
      );
      // swap two letters next to each other
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowBest = Math.min(rowBest, d[i][j]);
    }
    if (rowBest > limit) return limit + 1; // already too far apart, no need to finish
  }
  return d[a.length][b.length];
}

/**
 * The single closest vocabulary word, or null if none is close enough
 * or if two or more words are equally close (we don't guess).
 */
function closestWord(word: string): string | null {
  const limit = maxTypos(word);
  let best: string | null = null;
  let bestDistance = limit + 1;
  let tie = false;
  for (const [candidate, timesSeen] of getVocabulary()) {
    if (timesSeen < MIN_TIMES_SEEN) continue; // too rare in our pages (see MIN_TIMES_SEEN)
    if (/\d/.test(candidate)) continue; // never turn a word into a code like "d1ta"
    // Same first letter only. People rarely mistype the first letter, and this stops real
    // words we don't cover from becoming words we do: "good" -> "food", "dorms" -> "forms".
    if (candidate[0] !== word[0]) continue;
    const distance = editDistance(word, candidate, limit);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tie = false;
    } else if (distance === bestDistance && distance <= limit) {
      tie = true;
    }
  }
  return best && !tie ? best : null;
}

export type SpellingResult = {
  corrected: string; // the question with typos fixed (the same text if nothing changed)
  changes: { from: string; to: string }[]; // what we changed, e.g. [{ from: "parkng", to: "parking" }]
};

/** Fix the typos in a question. Words we know, short words, numbers, stopwords, and greetings are left alone. */
export function correctSpelling(question: string): SpellingResult {
  const vocab = getVocabulary();
  const changes: SpellingResult["changes"] = [];

  // Only whole words made of letters. Anything with a digit (CECS326, 2027) is skipped.
  const corrected = question.replace(/[A-Za-z0-9]+/g, (original) => {
    const word = original.toLowerCase();
    if (word.length < MIN_LENGTH || /\d/.test(word) || STOP_WORDS.has(word)) return original;
    // Greetings and thanks, typos included ("helo", "thanx"), are never "corrected" into other words.
    if (isSocialWord(word)) return original;
    // Known word, or a plural/singular of one ("permits" -> "permit")? Leave it.
    if (vocab.has(word) || tokenize(word).some((w) => vocab.has(w))) return original;

    const fix = closestWord(word);
    if (!fix) return original;
    changes.push({ from: original, to: fix });
    // Keep a capital first letter if the student used one ("Finacial" -> "Financial").
    return /^[A-Z]/.test(original) ? fix[0].toUpperCase() + fix.slice(1) : fix;
  });

  return { corrected, changes };
}
