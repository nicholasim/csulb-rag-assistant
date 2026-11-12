/**
 * fetch-sources.ts — builds the knowledge base (step 0 of our RAG flow).
 *
 * For every approved CSULB page listed in our Solution Design Brief, this script:
 *   1. downloads the page's HTML
 *   2. keeps only the main page content (drops menus, headers, footers)
 *   3. converts that HTML to Markdown WITHOUT rewording anything
 *   4. saves it to knowledge/<slug>.md with a small header (title, url, category, date retrieved)
 *
 * Run it with:  npm run fetch-sources
 * Re-running it refreshes every file with the current version of each page.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
// @ts-expect-error -- this plugin ships without TypeScript types
import { gfm } from "turndown-plugin-gfm";

type Source = {
  slug: string;
  category: string;
  url: string;
  // Some pages only show part of a list and hide the rest behind a "Load More" button.
  // morePages = how many extra batches (?page=1, ?page=2, ...) to download and merge in.
  morePages?: number;
};

// The approved sources from the "CSULB Sources" table in our brief, plus the pages we
// added in Phase 1 to fill gaps (see docs/prompt-log.md, Entry 2).
// "category" is the service area; the chat sidebar will use these names.
const SOURCES: Source[] = [
  { slug: "enrollment-key-dates", category: "Enrollment / Registration", url: "https://www.csulb.edu/enrollment-services/key-dates-and-deadlines" },
  { slug: "financial-aid", category: "Financial Aid", url: "https://www.csulb.edu/enrollment-services/mycsulb-financial-aid-information" },
  { slug: "academic-advising", category: "Academic Advising", url: "https://www.csulb.edu/academic-advising-at-csulb", morePages: 4 },
  { slug: "parking-permit-fees", category: "Parking & Transportation", url: "https://www.csulb.edu/parking-and-transportation-services/permit-fee-schedule-2026-27" },
  { slug: "parking-shuttle", category: "Parking & Transportation", url: "https://www.csulb.edu/parking-and-transportation-services/shuttle" },
  // Replaces the brief's conference "campus map and parking" page, which was for a 2024 event.
  { slug: "parking-permit-information", category: "Parking & Transportation", url: "https://www.csulb.edu/parking-and-transportation-services/permit-information" },
  { slug: "career-development-center", category: "Career Development Center", url: "https://www.csulb.edu/career-development-center" },
  { slug: "library-study-spaces", category: "Library", url: "https://www.asicsulb.org/corporate/enjoy/study-seating-spaces" },
  { slug: "library-services", category: "Library", url: "https://www.csulb.edu/university-library/university-library-services" },
  { slug: "technology-help-desk", category: "Technology Help Desk", url: "https://www.csulb.edu/information-technology" },
  { slug: "tuition-payments", category: "Tuition / Payments", url: "https://www.csulb.edu/financial-management/student-financial-services/how-to-guides" },
  { slug: "student-health-services", category: "Student Health Services", url: "https://www.csulb.edu/student-affairs/student-health-services/available-health-services" },
  // The brief's link had tracking (utm_) parameters; they don't change the page, so we drop them.
  { slug: "food-services", category: "Food Services", url: "https://www.csulb.edu/beach-shops/eat-and-shop" },
  { slug: "international-student-advising", category: "International Students", url: "https://www.csulb.edu/international/current-students/meet-an-advisor" },
  // Added: names and contact info for the international student advisors.
  { slug: "international-staff-contacts", category: "International Students", url: "https://www.csulb.edu/international/staff-contacts" },
  // Added: brief features that had no source.
  { slug: "day-1-textbook-access", category: "Bookstore", url: "https://www.csulb.edu/beach-shops/day-1-textbook-access" },
  { slug: "orientation-soar", category: "Orientation", url: "https://www.csulb.edu/student-affairs/student-orientation-advising-and-registration" },
];

const USER_AGENT = "Mozilla/5.0 (CSULB IS300 class project)";
// On csulb.edu list pages, each list entry (e.g. one advising center) is one of these.
const LIST_ITEM = ".views-view-responsive-grid__item";

const OUTPUT_DIR = path.join(process.cwd(), "knowledge");

// Turndown converts HTML into Markdown. The GFM plugin keeps tables as tables.
const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
turndown.use(gfm);

/** Download a URL and return its HTML, or throw if the page didn't load. */
async function download(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Download one page and turn its main content into Markdown. */
async function fetchAsMarkdown({ url, morePages = 0 }: Source) {
  const $ = cheerio.load(await download(url));

  // "Load More" pages: download each extra batch and add its list entries after ours.
  // (Each batch repeats the page intro, so we copy only the list entries.)
  for (let page = 1; page <= morePages; page++) {
    const $batch = cheerio.load(await download(`${url}?page=${page}`));
    const items = $batch(`main ${LIST_ITEM}`);
    if (items.length === 0) throw new Error(`no list entries found on ?page=${page}`);
    $(`main ${LIST_ITEM}`).last().after($batch.html(items));
  }
  if (morePages > 0) $("main .pager, main button").remove(); // the "Load More" link and button

  // The page title, minus the " | California State University, Long Beach" suffix.
  const title = $("h1").first().text().trim() || $("title").text().split("|")[0].trim();

  // Keep only the main content area. Both csulb.edu and asicsulb.org use a <main> element.
  // csulb.edu pages also put page-specific info (like help desk phone numbers and hours)
  // in a sidebar <aside class="sidebars">, so we add that to the end.
  const main = $("main").first();
  const sidebarHtml = $("aside.sidebars")
    .toArray()
    .filter((aside) => $(aside).text().trim() !== "") // skip empty sidebars
    .map((aside) => $(aside).html())
    .join("");
  if (sidebarHtml) main.append(`<hr><h2>Sidebar</h2>${sidebarHtml}`);
  // Remove things that are not page text: scripts, styles, forms, embedded videos,
  // images, breadcrumbs, and nav menus.
  main.find("script, style, noscript, form, iframe, svg, img, picture, nav, .breadcrumb, .visually-hidden, .sr-only").remove();

  // A Markdown table row must be on one line, so flatten anything multi-line inside a cell:
  // line breaks become spaces, list items become "1. ..." or "• ...", and paragraphs run together.
  main.find("td, th").each((_, cell) => {
    const $cell = $(cell);
    $cell.find("br").replaceWith(" ");
    $cell.find("ol").each((_, ol) => {
      $(ol).children("li").each((i, li) => { $(li).replaceWith(`<span>${i + 1}. ${$(li).html()}</span> `); });
    });
    $cell.find("li").each((_, li) => { $(li).replaceWith(`<span>• ${$(li).html()}</span> `); });
    // Replace block elements one at a time (outermost first) until none are left.
    const blocks = "p, div, ol, ul, h1, h2, h3, h4, h5, h6";
    while ($cell.find(blocks).length) {
      const el = $cell.find(blocks).first();
      el.replaceWith(`<span>${el.html()}</span> `);
    }
  });
  // Footnote markers like "Semester<sup>1</sup>" would become "Semester1", so mark them as "^1".
  main.find("sup").each((_, sup) => { $(sup).replaceWith(`^${$(sup).text()}`); });

  // Make links absolute so they still work outside the website.
  main.find("a[href]").each((_, a) => {
    const href = $(a).attr("href")!;
    try { $(a).attr("href", new URL(href, url).toString()); } catch { /* leave odd links alone */ }
  });

  const markdown = turndown
    .turndown(main.html() ?? "")
    .replace(/\[\s*\]\([^)]*\)/g, "") // drop links that only wrapped an image (now empty)
    .replace(/(\d)\\\./g, "$1.") // turndown writes "1\." to avoid accidental lists; we want "1."
    .replace(/[ \t]+$/gm, "") // trailing spaces
    .replace(/\n{3,}/g, "\n\n") // collapse big blank gaps
    .replace(/(\n\s*\* \* \*\s*)*\n## Sidebar\s*$/, "") // drop a sidebar that ended up empty
    .replace(/(\n\s*\* \* \*\s*)+$/, "") // drop trailing divider lines
    .trim();

  return { title, markdown };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  // Today's date in local time, formatted YYYY-MM-DD ("en-CA" happens to use that format).
  const today = new Date().toLocaleDateString("en-CA");

  for (const source of SOURCES) {
    try {
      const { title, markdown } = await fetchAsMarkdown(source);
      // Small header ("front matter") the retrieval code will read later.
      const header = [
        "---",
        `title: "${title.replace(/"/g, "'")}"`,
        `url: ${source.url}`,
        `category: ${source.category}`,
        `retrieved: ${today}`,
        "---",
      ].join("\n");
      await writeFile(path.join(OUTPUT_DIR, `${source.slug}.md`), `${header}\n\n${markdown}\n`);
      console.log(`OK    ${source.slug.padEnd(32)} ${markdown.split(/\s+/).length} words`);
    } catch (err) {
      // Never invent content: if a page fails, report it and skip it.
      console.error(`FAIL  ${source.slug.padEnd(32)} ${(err as Error).message}`);
    }
  }
}

main();
