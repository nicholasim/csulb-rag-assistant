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

// ---- Office directory (Step B2, prompt log Entry 14) ----
// One entry per CSULB office: its name, its official page, and one sentence copied word for word
// from that page (empty when the page has no descriptive sentence, e.g. only announcements).
// buildDirectory() checks each sentence really is on the live page before saving it.
// Used to point fallbacks to the right office (lib/directory.ts); not a source Gemini cites.
const DIRECTORY: { name: string; url: string; description: string }[] = [
  { name: "Admissions", url: "https://www.csulb.edu/admissions", description: "Each applicant to CSULB is considered with great care." },
  { name: "Enrollment Services", url: "https://www.csulb.edu/enrollment-services", description: "Current students can use our site for easy-to-follow information regarding class registration, degree progress and advising, filing to graduate and various other resources." },
  { name: "Student Records (Office of the Registrar)", url: "https://www.csulb.edu/student-records", description: "Plus, navigate the left menu for more services offered by Student Records--including guides on how to use your Academic Requirements Report (ARR), access planning tools (Degree Planner), order transcripts, and more." },
  { name: "Financial Aid and Scholarships", url: "https://www.csulb.edu/financial-aid-and-scholarships", description: "" },
  { name: "Student Financial Services (tuition and fee payments)", url: "https://www.csulb.edu/financial-management/student-financial-services", description: "Your payment due date is available on your MyCSULB Student Center." },
  { name: "Commencement", url: "https://www.csulb.edu/commencement", description: "Your Commencement celebration will take place at Angel Stadium in Anaheim, Tuesday, May 18 through Friday, May 21, 2027." },
  { name: "Testing Department", url: "https://www.csulb.edu/student-affairs/testing-department", description: "Offers proctoring services for an allotted fee for anyone needing to take a paper or computer-based test for another university, college or agency." },
  { name: "University Center for Undergraduate Advising (UCUA)", url: "https://www.csulb.edu/undergraduate-advising/university-center-for-undergraduate-advising-ucua", description: "The University Center for Undergraduate Advising (UCUA) is the primary advising center for" },
  { name: "College of Business Center for Student Success", url: "https://www.csulb.edu/college-of-business/center-for-student-success", description: "" },
  { name: "Engineering Student Success Center (ESSC)", url: "https://www.csulb.edu/college-of-engineering/undergraduate-advising", description: "The Engineering Student Success Center (ESSC) Academic Advising Office serves the College of Engineering (COE) and is committed to helping students graduate in a timely manner with a highly-valued degree from California State University Long Beach." },
  { name: "College of Education Student Success and Advising Center", url: "https://www.csulb.edu/college-of-education/student-success-and-advising-center", description: "The College of Education Student Success and Advising Center utilizes a Generalist/Specialist model for drop-in advising." },
  { name: "College of Health and Human Services Academic Advising Center", url: "https://www.csulb.edu/college-of-health-human-services/chhs-academic-advising", description: "The College of Health & Human Services (CHHS) Academic Advising Center provides both general education and major academic advising" },
  { name: "College of Liberal Arts Advising Center (ATLAS)", url: "https://www.csulb.edu/college-of-liberal-arts/atlas", description: "Welcome to the College of Liberal Arts Advising Center: ATLAS!" },
  { name: "College of Natural Sciences and Mathematics Academic Advising Center", url: "https://web.csulb.edu/colleges/cnsm/advising/", description: "CNSM declared majors can contact their major advisor for questions and drop-in hours." },
  { name: "Career Development Center", url: "https://www.csulb.edu/career-development-center", description: "The CSULB Career Development Center empowers students to become effective leaders of their personal career journeys." },
  { name: "The Learning Center (tutoring)", url: "https://www.csulb.edu/academic-affairs/undergraduate-studies/the-learning-center", description: "Schedule an appointment and see hours for Tutoring, Academic Coaching, and Conversation Lab" },
  { name: "University Writing Center", url: "https://www.csulb.edu/university-writing-center", description: "The University Writing Center is a campus-wide writing support service for all currently enrolled CSULB students." },
  { name: "University Library", url: "https://www.csulb.edu/university-library", description: "" },
  { name: "Student Health Services", url: "https://www.csulb.edu/student-affairs/student-health-services", description: "Student Health Services is your campus health clinic, here to support and serve you on campus and virtually." },
  { name: "Counseling and Psychological Services (CAPS)", url: "https://www.csulb.edu/student-affairs/counseling-and-psychological-services", description: "Counseling and Psychological Services (CAPS) provides support for students facing personal challenges and mental health concerns." },
  { name: "Bob Murphy Access Center (BMAC)", url: "https://www.csulb.edu/student-affairs/bob-murphy-access-center", description: "The Bob Murphy Access Center (BMAC) is a department under CSULB Student Affairs that provides educational access for students with disabilities by working with campus and community partners to provide accommodations, resources, and assistive technology." },
  { name: "Basic Needs Program", url: "https://www.csulb.edu/student-affairs/basic-needs", description: "From food and housing security to financial wellness support, we are here to help you navigate college life with confidence and peace of mind." },
  { name: "CARES Team", url: "https://www.csulb.edu/student-affairs/cares", description: "Crisis Assistance & Resource Education Support (CARES) helps students navigate challenges, connect with resources, and stay on track academically and personally." },
  { name: "Dean of Students", url: "https://www.csulb.edu/student-affairs/dean-of-students", description: "Our team provides support and advocacy for all of our students, in collaboration with faculty and staff across the university." },
  { name: "Veterans Services", url: "https://www.csulb.edu/student-affairs/veterans-services", description: "We help students access the educational benefits they earned by serving in the United States armed forces." },
  { name: "Dream Success Center", url: "https://www.csulb.edu/student-affairs/dream-success-center", description: "" },
  { name: "Educational Opportunity Program (EOP)", url: "https://www.csulb.edu/student-affairs/educational-opportunity-program", description: "The Educational Opportunity Program (EOP) at CSULB is dedicated to serving first-generation, historically low-income students by providing access and equity to higher education." },
  { name: "Women's and Gender Equity Center", url: "https://www.csulb.edu/student-affairs/womens-gender-equity-center", description: "aims to foster women's and gender equity among individuals of diverse identities and expressions" },
  { name: "Student Conduct and Ethical Development", url: "https://www.csulb.edu/student-affairs/student-conduct-and-ethical-development", description: "The Office of Student Conduct and Ethical Development investigates campus-related complaints and charges against students involving violations of campus regulations." },
  { name: "Office of Equity & Compliance (Title IX and civil rights)", url: "https://www.csulb.edu/equity-compliance", description: "To report an incident to the OEC, please complete the online reporting form." },
  { name: "Student Life & Development (clubs and organizations)", url: "https://www.csulb.edu/student-affairs/student-life-development", description: "CSULB has more than 300 recognized student organizations, representing 12 diverse categories." },
  { name: "Center for International Education (international students)", url: "https://www.csulb.edu/international", description: "The Center for International Education is a one-stop hub for international programs at CSULB comprised of three distinct areas: International Enrollment Management (IEM), International Students and Scholars (ISS), and Study Abroad." },
  { name: "Student Orientation, Advising, and Registration (SOAR)", url: "https://www.csulb.edu/student-affairs/student-orientation-advising-and-registration", description: "All new first-time/first-year and transfer students are required to complete SOAR, as it is a mandatory program for all incoming students." },
  { name: "Housing & Residential Life", url: "https://www.csulb.edu/student-affairs/university-housing-residential-life", description: "CSULB's housing options offer students a convenient and supportive living environment." },
  { name: "Beach Shops (bookstore and campus dining)", url: "https://www.csulb.edu/beach-shops", description: "Comprised of the University Bookstore, Campus Dining Services and Convenience Stores, and Residential Dining Services, Beach Shops operates locations providing goods and services to students, staff and faculty and creating an inclusive learning environment." },
  { name: "ID Card Services", url: "https://www.csulb.edu/beach-shops/get-your-id", description: "You must be registered for at least one class for the current or upcoming semester to obtain your ID Card" },
  { name: "Parking & Transportation Services", url: "https://www.csulb.edu/parking-and-transportation-services", description: "CSULB uses a completely paperless permitting system." },
  { name: "University Police", url: "https://www.csulb.edu/university-police", description: "It is the Mission of the California State University Long Beach Police Department to safeguard the lives and property of the campus community that we serve." },
  { name: "Division of Information Technology (Technology Help Desk)", url: "https://www.csulb.edu/information-technology", description: "is CSU Long Beach's enterprise technology organization and is responsible for providing high-quality, reliable, and secure information and technology services" },
  { name: "Academic Technology Services (Horn Center, computer labs, software)", url: "https://www.csulb.edu/academic-technology-services", description: "Academic Technology Services (ATS) leads the CSULB campus in leveraging technology that effectively supports and inspires instruction, online and in-person learning environments, business processes, and student learning." },
  { name: "Associated Students, Inc. (ASI)", url: "https://www.asicsulb.org/", description: "Associated Students, Inc. is a nonprofit membership association and auxiliary organization of California State University, Long Beach." },
  { name: "Student Recreation and Wellness Center (SRWC)", url: "https://asirecreation.org/", description: "The Student Recreation and Wellness Center (SRWC) is a 126,500-square-foot, two-story, state-of-the-art recreation facility" },
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

/** Page text for checking directory sentences: the main content plus the page's meta description. */
async function pageText(url: string) {
  const $ = cheerio.load(await download(url));
  const meta = $('meta[name="description"]').attr("content") ?? "";
  $("script, style, noscript, nav").remove();
  const main = $("main").length ? $("main") : $("body");
  return normalize(`${main.text()} ${meta}`);
}

/** Collapse spaces and use straight quotes, so a copied sentence matches the page text. */
function normalize(text: string) {
  return text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim();
}

/**
 * Check every directory entry against its live page and save lib/data/directory.json.
 * An entry whose page doesn't load, or whose sentence isn't on the page word for word, is left
 * out and reported, so the directory never contains text that isn't on the office's own page.
 */
async function buildDirectory(today: string) {
  const offices = [];
  for (const office of DIRECTORY) {
    try {
      if (office.description && !(await pageText(office.url)).includes(normalize(office.description))) {
        throw new Error("description not found word for word on the page");
      }
      if (!office.description) await download(office.url); // still check the page loads
      offices.push(office);
      console.log(`OK    directory: ${office.name}`);
    } catch (err) {
      console.error(`FAIL  directory: ${office.name}: ${(err as Error).message}`);
    }
  }
  const output = { checked: today, offices };
  await writeFile(path.join(process.cwd(), "lib", "data", "directory.json"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Saved lib/data/directory.json (${offices.length} of ${DIRECTORY.length} offices)`);
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
  await buildDirectory(today);
}

main();
