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
  // Where the page's main text is. Most csulb.edu and asicsulb.org pages use a <main> element
  // (the default); a few other official sites use something else.
  contentSelector?: string;
  // A clearer name for the source chip when the page's own heading is vague ("Contact Us").
  // Only the label changes; the page text is still copied word for word.
  title?: string;
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
  // Added: one of the brief's ten core service areas that had no source.
  { slug: "basic-needs", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/basic-needs" },
  // Added: brief features that had no source.
  { slug: "day-1-textbook-access", category: "Bookstore", url: "https://www.csulb.edu/beach-shops/day-1-textbook-access" },
  { slug: "orientation-soar", category: "Orientation", url: "https://www.csulb.edu/student-affairs/student-orientation-advising-and-registration" },

  // ---- Step B1 (prompt log Entry 13): pages that answer common student questions. ----
  // Every URL was checked to load, and the team approved the list before fetching.
  // Campus places
  { slug: "horn-center", category: "Campus Places", url: "https://www.csulb.edu/academic-technology-services/horn-center" },
  { slug: "computer-labs", category: "Campus Places", url: "https://www.csulb.edu/academic-technology-services/csulb-computer-labs" },
  { slug: "building-names-codes", category: "Campus Places", url: "https://www.csulb.edu/maps/building-names-codes" },
  { slug: "asi-maps-hours", title: "ASI Maps & Hours", category: "Campus Places", url: "https://www.asicsulb.org/corporate/resources/maps-hours" },
  // Majors and academic rules. (The catalog site blocks scripts, so we use the Student Records
  // pages that list the same requirements.)
  { slug: "change-of-major", category: "Majors & Academics", url: "https://www.csulb.edu/student-records/change-of-major-undergraduates" },
  { slug: "declare-a-major", category: "Majors & Academics", url: "https://www.csulb.edu/student-records/declare-a-major-pre-majorsundeclared" },
  { slug: "engineering-major-requirements", category: "Majors & Academics", url: "https://www.csulb.edu/student-records/fall-2026-major-specific-degree-requirements-hung-family-college-of-engineering" },
  { slug: "computer-science-bs", category: "Majors & Academics", url: "https://www.csulb.edu/college-of-engineering/bachelor-of-science-computer-science" },
  { slug: "ge-requirements", category: "Majors & Academics", url: "https://www.csulb.edu/student-records/fall-2025-ge-requirements" },
  { slug: "apply-to-graduate", category: "Majors & Academics", url: "https://www.csulb.edu/student-records/apply-to-graduate-undergraduate" },
  { slug: "academic-standing", category: "Majors & Academics", url: "https://www.csulb.edu/student-records/academic-standing-and-appeals" },
  // Records and registration in MyCSULB
  { slug: "transcripts", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/transcripts-for-current-students-former-students-and-alumni" },
  { slug: "dropping-and-withdrawing", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/dropping-and-withdrawing" },
  { slug: "using-academics", category: "Enrollment / Registration", url: "https://www.csulb.edu/enrollment-services/using-academics" },
  { slug: "permission-to-add", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/permission-to-add" },
  { slug: "holds-and-to-do-lists", category: "Enrollment / Registration", url: "https://www.csulb.edu/enrollment-services/holds-and-to-do-lists" },
  { slug: "grades-and-grading", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/understanding-grades-and-grading" },
  { slug: "enrollment-verification", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/faqs-for-enrollment-verification-vs-official-transcripts" },
  // Housing
  { slug: "apply-for-housing", category: "Housing", url: "https://www.csulb.edu/student-affairs/university-housing-residential-life/apply-for-housing" },
  { slug: "housing-rates", category: "Housing", url: "https://www.csulb.edu/student-affairs/university-housing-residential-life/housing-rates" },
  // Wellness and access
  { slug: "caps", category: "Wellness & Access", url: "https://www.csulb.edu/student-affairs/counseling-and-psychological-services" },
  { slug: "caps-contact-faq", title: "CAPS Contact Us & FAQ", category: "Wellness & Access", url: "https://www.csulb.edu/student-affairs/counseling-and-psychological-services/contact-us-faq" },
  // Also used by the crisis reply (lib/crisis.ts), which checks its phone numbers are still here.
  { slug: "caps-crisis-intervention", title: "CAPS Crisis Intervention", category: "Wellness & Access", url: "https://www.csulb.edu/student-affairs/counseling-and-psychological-services/crisis-intervention" },
  { slug: "bob-murphy-access-center", category: "Wellness & Access", url: "https://www.csulb.edu/student-affairs/bob-murphy-access-center" },
  { slug: "cares-team", title: "CARES Team", category: "Wellness & Access", url: "https://www.csulb.edu/student-affairs/cares" },
  { slug: "dean-of-students", category: "Wellness & Access", url: "https://www.csulb.edu/student-affairs/dean-of-students" },
  // Tutoring and writing
  { slug: "tutoring", title: "The Learning Center: Tutoring", category: "Tutoring & Writing", url: "https://www.csulb.edu/academic-affairs/undergraduate-studies/the-learning-center/tutoring" },
  { slug: "writing-center", category: "Tutoring & Writing", url: "https://www.csulb.edu/university-writing-center" },
  { slug: "supplemental-instruction", category: "Tutoring & Writing", url: "https://www.csulb.edu/learning-assistance-center/supplemental-instruction" },
  // Safety
  { slug: "university-police", title: "University Police: Contact Us", category: "Safety", url: "https://www.csulb.edu/university-police/contact-us" },
  { slug: "night-safety-escort", category: "Safety", url: "https://www.csulb.edu/university-police/night-safety-escort-program" },
  { slug: "beachalert", category: "Safety", url: "https://www.csulb.edu/university-police/emergency-notification-system" },
  // Recreation: ASI's own rec site (the old asirecreation.asicsulb.org address no longer works).
  { slug: "srwc-membership", title: "SRWC Membership (ASI Recreation)", category: "Recreation", url: "https://asirecreation.org/membership", contentSelector: ".item-page" },
  // Technology
  { slug: "beachid-password", title: "BeachID Account Access Help", category: "Technology Help Desk", url: "https://beachid.csulb.edu/", contentSelector: "#main-content" },
  { slug: "technology-for-students", category: "Technology Help Desk", url: "https://www.csulb.edu/academic-technology-services/academic-technology-resources-for-students" },
  // Library (building hours are only on a separate booking site, so we have desk hours only)
  { slug: "library-services-for-students", category: "Library", url: "https://www.csulb.edu/university-library/services-for-students" },
  { slug: "library-research-desk", category: "Library", url: "https://www.csulb.edu/university-library/research-and-information-desk" },
  // Student ID card (run by Beach Shops, like the bookstore)
  { slug: "get-your-id", category: "Bookstore", url: "https://www.csulb.edu/beach-shops/get-your-id" },
  { slug: "id-card-faqs", category: "Bookstore", url: "https://www.csulb.edu/beach-shops/id-card-services-faqs" },
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
async function fetchAsMarkdown({ url, morePages = 0, contentSelector = "main" }: Source) {
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
  const main = $(contentSelector).first();
  if (main.length === 0) throw new Error(`no "${contentSelector}" content area found`);
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
  // The Markdown converter only turns a table into a Markdown table if its first row is a header
  // row; otherwise it leaves raw HTML (<td>...) in the file. So: drop tables with no text at all
  // (e.g. a row of social-media icons), and give every other table a header row. If the first
  // row is all bold labels ("Acronym | Building Name"), it becomes the header; if not, we add an
  // empty header row, so no real row is lost or relabeled.
  main.find("table").each((_, table) => {
    const $table = $(table);
    if ($table.text().trim() === "") return void $table.remove();
    const rows = $table.find("tr");
    const first = rows.first();
    if ($table.find("thead").length || first.children("td").length === 0) return; // already has a header
    const firstCells = first.children("td, th").toArray();
    const allBold = firstCells.every((c) => $(c).text().trim() !== "" && $(c).find("strong, b").text().trim() === $(c).text().trim());
    if (allBold) {
      firstCells.forEach((c) => { $(c).replaceWith(`<th>${$(c).text().trim()}</th>`); });
      first.wrap("<thead></thead>");
    } else {
      const columns = Math.max(...rows.toArray().map((r) => $(r).children("td, th").length));
      $table.prepend(`<thead><tr>${"<th></th>".repeat(columns)}</tr></thead>`);
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
        `title: "${(source.title ?? title).replace(/"/g, "'")}"`,
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
