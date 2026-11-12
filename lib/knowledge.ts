/**
 * knowledge.ts: loads the knowledge base and cuts it into small "chunks".
 *
 * The knowledge/ folder has one Markdown file per approved CSULB page (made by
 * scripts/fetch-sources.ts). A whole page is too big to hand to the AI, and most of it
 * would be off-topic anyway, so we cut each page into chunks of roughly 150-300 words,
 * splitting at headings. Retrieval (retrieval.ts) then picks the few chunks that best
 * match a student's question.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type Chunk = {
  id: string; // e.g. "parking-permit-fees#2"
  title: string; // page title, e.g. "Permit Fee Schedule (2026-27)"
  url: string; // the real CSULB page
  category: string; // service area, e.g. "Parking & Transportation"
  heading: string; // the section the chunk came from, e.g. "Permit Prices (2023-2026)"
  text: string; // the chunk's Markdown (links kept, so the AI can share them)
};

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const MIN_WORDS = 150; // keep adding sections until a chunk has at least this many words
const MAX_WORDS = 300; // never let a chunk grow past this

/** Count words, ignoring link URLs (some CSULB links are hundreds of characters long). */
export function countWords(markdown: string) {
  const withoutUrls = markdown.replace(/\]\([^)]*\)/g, "]");
  return withoutUrls.split(/\s+/).filter(Boolean).length;
}

/** Read the small header at the top of each file (title, url, category, retrieved). */
function parseHeader(file: string) {
  const match = file.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error("knowledge file is missing its --- header ---");
  const header: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    header[key.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
  }
  return { header, body: file.slice(match[0].length) };
}

/**
 * Split text that is too long into pieces of at most MAX_WORDS.
 * We split between paragraphs. A big table is split between rows, and every piece
 * repeats the table's header rows so each piece still makes sense on its own.
 */
function splitLongText(text: string): string[] {
  const pieces: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) pieces.push(current.join("\n\n"));
    current = [];
  };

  for (const paragraph of text.split(/\n{2,}/)) {
    const isTable = paragraph.trimStart().startsWith("|");
    if (isTable && countWords(paragraph) > MAX_WORDS) {
      flush();
      const lines = paragraph.split("\n");
      const tableHeader = lines.slice(0, 2); // column names + the "| --- |" line
      let rows: string[] = [];
      for (const row of lines.slice(2)) {
        if (rows.length && countWords([...tableHeader, ...rows, row].join("\n")) > MAX_WORDS) {
          pieces.push([...tableHeader, ...rows].join("\n"));
          rows = [];
        }
        rows.push(row);
      }
      if (rows.length) pieces.push([...tableHeader, ...rows].join("\n"));
      continue;
    }
    if (current.length && countWords([...current, paragraph].join("\n\n")) > MAX_WORDS) flush();
    current.push(paragraph);
  }
  flush();
  return pieces;
}

/** Cut one knowledge file into chunks. */
function chunkFile(slug: string, file: string): Chunk[] {
  const { header, body } = parseHeader(file);

  // 1. Split the page into sections, one per heading.
  const sections: { heading: string; text: string }[] = [];
  let heading = header.title;
  let lines: string[] = [];
  const endSection = () => {
    const text = lines.join("\n").replace(/^\s*\* \* \*\s*$/gm, "").trim(); // drop "* * *" dividers
    if (text) sections.push({ heading, text });
    lines = [];
  };
  for (const line of body.split("\n")) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      endSection();
      // Headings like "## [Career Pathways](url)" -> "Career Pathways"; "**" bold marks removed.
      const name = h[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").trim();
      // "Sidebar" is a label our fetch script added, not a real heading on the page.
      if (name !== "Sidebar") heading = name || heading;
      if (name === "Sidebar") continue;
    }
    lines.push(line);
  }
  endSection();

  // 2. Group small sections together and split big ones, so chunks land near 150-300 words.
  const chunks: Chunk[] = [];
  let group: { heading: string; texts: string[] } | null = null;
  const pushChunk = (chunkHeading: string, text: string) =>
    chunks.push({
      id: `${slug}#${chunks.length + 1}`,
      title: header.title,
      url: header.url,
      category: header.category,
      heading: chunkHeading,
      text,
    });
  const flushGroup = () => {
    if (group) pushChunk(group.heading, group.texts.join("\n\n"));
    group = null;
  };

  for (const section of sections) {
    const words = countWords(section.text);
    if (words > MAX_WORDS) {
      flushGroup();
      for (const piece of splitLongText(section.text)) pushChunk(section.heading, piece);
      continue;
    }
    // Adding this section would make the group too big: close the group first.
    if (group && countWords(group.texts.join("\n\n")) + words > MAX_WORDS) flushGroup();
    if (!group) group = { heading: section.heading, texts: [] };
    group.texts.push(section.text);
    if (countWords(group.texts.join("\n\n")) >= MIN_WORDS) flushGroup();
  }
  flushGroup();

  // 3. A tiny leftover (like a one-sentence intro right before a big table) makes a poor
  //    chunk on its own. Glue it onto the next chunk, or the previous one if it's last.
  const TINY = 60;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length < 2 || countWords(chunks[i].text) >= TINY) continue;
    if (i + 1 < chunks.length) {
      chunks[i + 1].text = `${chunks[i].text}\n\n${chunks[i + 1].text}`;
      chunks[i + 1].heading = chunks[i].heading;
    } else {
      chunks[i - 1].text = `${chunks[i - 1].text}\n\n${chunks[i].text}`;
    }
    chunks.splice(i, 1);
    i--;
  }
  chunks.forEach((chunk, i) => (chunk.id = `${slug}#${i + 1}`));
  return chunks;
}

let cache: Chunk[] | null = null;

/** All chunks from every file in knowledge/. Loaded once, then kept in memory. */
export function loadChunks(): Chunk[] {
  if (cache) return cache;
  const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".md")).sort();
  cache = files.flatMap((f) =>
    chunkFile(f.replace(/\.md$/, ""), readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8")),
  );
  return cache;
}
