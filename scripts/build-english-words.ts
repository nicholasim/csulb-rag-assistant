/**
 * build-english-words.ts: makes lib/data/english-words.json, the list of real English words
 * the spelling fixer must never "correct" (so "died" never becomes "did", "dorms" never "forms").
 *
 * Run it with:  npm run english-words   (only needed if we change the list size)
 *
 * The words come from SCOWL (Spell Checker Oriented Word Lists) via the wordlist-english
 * package. We keep sizes 10-40, the common words: about 44,000 entries, which is roughly the
 * 20,000 most common English words plus their plurals and verb forms. Bigger sizes add rare
 * words (like "studdy"), which would stop real typos from being fixed.
 * SCOWL license: copyright Kevin Atkinson and others; free to use, copy, and distribute with
 * this notice (see node_modules/wordlist-english/Copyright).
 */
import { readFile, writeFile } from "node:fs/promises";

const SIZES = [10, 20, 35, 40];

async function main() {
  const words = new Set<string>();
  for (const variant of ["english", "american"]) {
    for (const size of SIZES) {
      const file = `node_modules/wordlist-english/${variant}-words-${size}.json`;
      for (const word of JSON.parse(await readFile(file, "utf8")) as string[]) {
        if (/^[a-z]+$/i.test(word)) words.add(word.toLowerCase());
      }
    }
  }
  const output = {
    source: "SCOWL sizes 10-40 (english + american) via the wordlist-english npm package. Copyright 2000-2016 Kevin Atkinson and others; free to use with this notice. Built by scripts/build-english-words.ts.",
    words: [...words].sort(),
  };
  await writeFile("lib/data/english-words.json", `${JSON.stringify(output)}\n`);
  console.log(`Saved lib/data/english-words.json (${output.words.length} words)`);
}

main();
