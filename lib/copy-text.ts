/**
 * copy-text.ts: the plain text the "Copy answer" button copies (Entry 32). Safe in the browser.
 *
 * The answer as clean plain text (no [1] citation markers, no Markdown symbols; a link keeps its
 * address as "text (url)" so it isn't lost), then a short "Sources:" list with each page's title
 * and link.
 */
export function plainTextForCopy(answer: string, sources: { title: string; url: string }[]) {
  const text = answer
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\](?!\()/g, "") // citation markers: [1], [2, 3]
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // [text](url) -> text (url)
    .replace(/^\s*[*+]\s+/gm, "- ") // list bullets become "- " (before italics, so "* item" isn't read as italic)
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2") // *italic*
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/[ \t]+([.,;:!?])/g, "$1") // no space left before punctuation after removing a citation
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!sources.length) return text;
  const list = sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n");
  return `${text}\n\nSources:\n${list}`;
}
