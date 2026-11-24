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
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  // Entry 34: remove email addresses, phone numbers, and staff contact lines before saving, so no
  // officer or staff contact details are stored (used for the club and student-org pages).
  stripContacts?: boolean;
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

  // ---- Coverage round B3 (prompt log Entry 22): pages that answer questions from the 157-question
  // bank (tests/question-bank.json) that our sources didn't cover. All official csulb.edu pages,
  // plus CSULB's official IT help center (csulb.teamdynamix.com) and one ASI page (team-approved).
  // Admissions (prospective and newly admitted students)
  { slug: "first-year-application-process", category: "Enrollment / Registration", url: "https://www.csulb.edu/admissions/first-time-first-year-student-application-process" },
  { slug: "first-year-admission-eligibility", category: "Enrollment / Registration", url: "https://www.csulb.edu/admissions/first-time-first-year-student-admission-eligibility" },
  { slug: "transfer-application-process", category: "Enrollment / Registration", url: "https://www.csulb.edu/admissions/transfer-application-process" },
  { slug: "transfer-admission-eligibility", category: "Enrollment / Registration", url: "https://www.csulb.edu/admissions/transfer-admission-eligibility" },
  { slug: "impaction", category: "Enrollment / Registration", url: "https://www.csulb.edu/admissions/impaction" },
  { slug: "newly-admitted-first-year", category: "Enrollment / Registration", url: "https://www.csulb.edu/admissions/steps-for-newly-admitted-first-time-first-year-students" },
  { slug: "newly-admitted-transfers", category: "Enrollment / Registration", url: "https://www.csulb.edu/admissions/steps-for-newly-admitted-transfers" },
  { slug: "residency-for-tuition", category: "Tuition / Payments", url: "https://www.csulb.edu/admissions/residency-for-tuition-purposes" },
  { slug: "transfer-credit", category: "Majors & Academics", url: "https://www.csulb.edu/admissions/transfer-credit-for-incoming-students" },
  { slug: "test-credit-ap-ib", category: "Majors & Academics", url: "https://www.csulb.edu/admissions/first-time-first-year-student-test-and-transfer-credit" },
  { slug: "campus-tours", title: "Campus Tours", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/university-outreach-school-relations/tours" },
  // Registration, unit load, calendar
  { slug: "student-unit-load", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/student-unit-load" },
  { slug: "waitlisting", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/waitlisting-for-classes" },
  { slug: "repeating-courses", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/repeating-courses" },
  { slug: "enrollment-options", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/enrollment-options" },
  { slug: "concurrent-enrollment", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/visitorconcurrent-non-csulb-students" },
  { slug: "final-exam-schedule", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/final-exam-schedule" },
  { slug: "academic-calendar", category: "Enrollment / Registration", url: "https://www.csulb.edu/academic-affairs/academic-affairs-calendar" },
  // Tuition and financial aid
  { slug: "tuition-and-fees", category: "Tuition / Payments", url: "https://www.csulb.edu/student-records/tuition-and-fees" },
  { slug: "fafsa-cadaa", category: "Financial Aid", url: "https://www.csulb.edu/financial-aid-and-scholarships/fafsa-cadaa-support" },
  { slug: "scholarships", category: "Financial Aid", url: "https://www.csulb.edu/financial-aid-and-scholarships/scholarships" },
  { slug: "sap-financial-aid", category: "Financial Aid", url: "https://www.csulb.edu/financial-aid-and-scholarships/understanding-satisfactory-academic-progress-sap" },
  { slug: "federal-work-study", category: "Financial Aid", url: "https://www.csulb.edu/financial-aid-and-scholarships/federal-work-study" },
  { slug: "basic-needs-financial", title: "Basic Needs: Emergency Grants and Financial Support", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/basic-needs/financial" },
  { slug: "basic-needs-housing", title: "Basic Needs: Housing Support", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/basic-needs/housing" },
  // Jobs, graduation, campus life
  { slug: "job-internship-search", category: "Career Development Center", url: "https://www.csulb.edu/career-development-center/students/job-internship-search" },
  { slug: "commencement-faq", title: "Commencement FAQ", category: "Majors & Academics", url: "https://www.csulb.edu/commencement/frequently-asked-questions" },
  { slug: "university-honors", category: "Majors & Academics", url: "https://www.csulb.edu/university-honors" },
  { slug: "student-life-development", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/student-life-development" },
  { slug: "student-organizations", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/student-life-development/student-organizations" },
  { slug: "fraternities-sororities", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/student-life-development/about-fraternities-and-sororities" },
  { slug: "club-sports", category: "Recreation", url: "https://www.csulb.edu/student-affairs/student-life-development/club-sports-recreation" },
  { slug: "about-asi", title: "About ASI (Associated Students, Inc.)", category: "Campus Places", url: "https://www.asicsulb.org/corporate/resources/about-us" },
  { slug: "residential-dining", category: "Housing", url: "https://www.csulb.edu/student-affairs/student-housing/residential-dining-services" },
  // Library, IT, parking
  { slug: "library-circulation-desk", category: "Library", url: "https://www.csulb.edu/university-library/circulation-desk" },
  { slug: "library-reserves", category: "Library", url: "https://www.csulb.edu/university-library/reserves-services" },
  { slug: "library-study-areas", title: "Library Study Areas", category: "Library", url: "https://www.csulb.edu/university-library/study-areas" },
  { slug: "student-email", title: "Student Email (IT Help Center)", category: "Technology Help Desk", url: "https://csulb.teamdynamix.com/TDClient/1993/Portal/Requests/ServiceDet?ID=28187", contentSelector: "#ctl00_ctl00_cpContent_cpContent_divDescription" },
  { slug: "eduroam-wifi", title: "Connect to Campus Wi-Fi (eduroam, IT Help Center)", category: "Technology Help Desk", url: "https://csulb.teamdynamix.com/TDClient/1993/Portal/KB/ArticleDet?ID=163830", contentSelector: "#ctl00_ctl00_cpContent_cpContent_divBody" },
  { slug: "parking-citation-appeal", category: "Parking & Transportation", url: "https://www.csulb.edu/parking-and-transportation-services/appeal-a-citation" },
  { slug: "parking-citations-faq", category: "Parking & Transportation", url: "https://www.csulb.edu/parking-and-transportation-services/citations-faq" },
  { slug: "go-beach-bus-pass", category: "Parking & Transportation", url: "https://www.csulb.edu/parking-and-transportation-services/go-beach-discounted-bus-pass" },
  // Health
  { slug: "shs-make-appointment", title: "Student Health Services: Make an Appointment", category: "Student Health Services", url: "https://www.csulb.edu/student-affairs/student-health-services/make-an-appointment" },
  { slug: "shs-health-insurance", title: "Student Health Services: Health Insurance", category: "Student Health Services", url: "https://www.csulb.edu/student-affairs/student-health-services/health-insurance" },
  { slug: "shs-pharmacy", title: "Student Health Services: Pharmacy", category: "Student Health Services", url: "https://www.csulb.edu/student-affairs/student-health-services/pharmacy" },
  { slug: "immunizations", category: "Student Health Services", url: "https://www.csulb.edu/student-affairs/immunizations" },
  // Safety, international, records, support programs
  { slug: "title-ix", category: "Safety", url: "https://www.csulb.edu/equity-compliance/title-ix-at-the-beach" },
  { slug: "f1-rules", title: "F-1 Rules (International Students)", category: "International Students", url: "https://www.csulb.edu/international/current-students/f-1-rules" },
  { slug: "international-campus-employment", title: "On-Campus Employment (International Students)", category: "International Students", url: "https://www.csulb.edu/international/current-students/campus-employment" },
  { slug: "optional-practical-training", category: "International Students", url: "https://www.csulb.edu/international/current-students/optional-practical-training" },
  { slug: "travel-reentry", category: "International Students", url: "https://www.csulb.edu/international/current-students/travel-and-re-entry-guidance" },
  { slug: "obtain-i-20", category: "International Students", url: "https://www.csulb.edu/international/newly-admitted-students/obtain-csulb-form-i-20" },
  { slug: "social-security-number", title: "Social Security Number (International Students)", category: "International Students", url: "https://www.csulb.edu/international/current-students/social-security-number" },
  { slug: "international-health-insurance", title: "Health Insurance (International Students)", category: "International Students", url: "https://www.csulb.edu/international/current-students/health-insurance" },
  { slug: "study-abroad", category: "International Students", url: "https://www.csulb.edu/international/csulb-study-abroad-programs" },
  { slug: "ferpa", category: "Enrollment / Registration", url: "https://www.csulb.edu/student-records/ferpa-for-students" },
  { slug: "veterans-services", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/veterans-services" },
  { slug: "dream-success-center", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/dream-success-center" },
  { slug: "guardian-scholars", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/guardian-scholars" },
  { slug: "lgbtq-resource-center", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/lgbtq-resource-center" },
  { slug: "eop", title: "Educational Opportunity Program (EOP)", category: "Basic Student Support", url: "https://www.csulb.edu/student-affairs/educational-opportunity-program" },
  // Cleanup round (Entry 24): 3 pages for topics the live bank sample still missed.
  { slug: "how-to-apply-for-aid", category: "Financial Aid", url: "https://www.csulb.edu/financial-aid-and-scholarships/how-to-apply-for-aid" },
  { slug: "commencement-ceremony-schedules", title: "Commencement Ceremony Schedules", category: "Majors & Academics", url: "https://www.csulb.edu/commencement/ceremony-schedules" },
  { slug: "cross-enrollment", title: "Cross Enrollment (classes at a community college)", category: "Financial Aid", url: "https://www.csulb.edu/financial-aid-and-scholarships/cross-enrollment" },

  // ---- Clubs and gaming (prompt log Entry 34, team-approved list). Official club and student-org
  // lists from csulb.edu, plus ASI's Games Area page. Contact details are stripped (stripContacts).
  // BeachSync (csulb.campuslabs.com) is NOT fetched: its robots.txt disallows automated access to
  // its data, so the app only links to its search page instead.
  { slug: "engineering-student-clubs", title: "Engineering Student Clubs & Organizations", category: "Campus Places", url: "https://www.csulb.edu/hung-family-college-of-engineering/student-clubs-orgs", stripContacts: true },
  { slug: "chhs-student-organizations", title: "Health & Human Services Student Organizations", category: "Campus Places", url: "https://www.csulb.edu/college-of-health-human-services/student-organizations", stripContacts: true },
  { slug: "business-student-organizations", title: "College of Business Student Organizations", category: "Campus Places", url: "https://www.csulb.edu/college-of-business/student-organizations", stripContacts: true },
  { slug: "arts-student-organizations", title: "College of the Arts Student Organizations", category: "Campus Places", url: "https://www.csulb.edu/college-of-the-arts/student-organizations", stripContacts: true },
  { slug: "liberal-arts-clubs", title: "College of Liberal Arts Clubs", category: "Campus Places", url: "https://www.csulb.edu/college-of-liberal-arts/discover-cla/clubs", stripContacts: true },
  { slug: "cultural-resource-centers", title: "Student Cultural Resource Centers", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/office-of-belonging-and-inclusion/resource-centers", stripContacts: true },
  { slug: "american-indian-student-organizations", title: "American Indian Student Organizations", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/student-life-development/american-indian-student-organizations", stripContacts: true },
  { slug: "physics-astronomy-student-organizations", title: "Physics & Astronomy Student Organizations", category: "Campus Places", url: "https://www.csulb.edu/physics-astronomy/student-organizations", stripContacts: true },
  { slug: "liberal-studies-student-association", title: "Liberal Studies Student Association (LSSA)", category: "Campus Places", url: "https://www.csulb.edu/college-of-education/liberal-studies/peer-mentors-liberal-studies-student-association-lssa", stripContacts: true },
  // Entry 35: official pages that name Cambodian and other APID student groups and programs.
  { slug: "cambodian-graduation-celebration", title: "Cambodian Graduation Celebration (Cambodian Student Society)", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/cultural-graduation-celebrations/cambodian-graduation-celebration", stripContacts: true },
  { slug: "apid-who-we-serve", title: "APID Resource Center: Who We Serve", category: "Campus Places", url: "https://www.csulb.edu/student-affairs/asian-pacific-islander-desi-resource-center/who-apid", stripContacts: true },
  { slug: "aanhpi-initiatives", title: "AANHPI Initiatives (ASCEND, Project Resilience)", category: "Campus Places", url: "https://www.csulb.edu/office-of-the-provost/academic-affairs-inclusive-excellence/asian-american-native-hawaiian-pacific", stripContacts: true },
  { slug: "asi-games-area", title: "ASI Games Area (Esports Lounge)", category: "Campus Places", url: "https://www.asicsulb.org/corporate/discover/campus-events-office/games-area", stripContacts: true },
];

// ---- Office directory (Step B2, prompt log Entry 14) ----
// One entry per CSULB office: its name, its official page, and one sentence copied word for word
// from that page (empty when the page has no descriptive sentence, e.g. only announcements).
// phone/email (optional) were picked by hand from the office's page or our knowledge files; we
// don't extract them automatically because pages also list other offices' numbers.
// buildDirectory() checks every sentence, phone, and email really is on the office's live page
// (or, for contacts, in knowledge/) before saving it, so nothing is invented.
// keywords (optional) are OUR search hints for offices whose page has no matchable description
// ("undocumented" -> Dream Success Center). They're only used to match a question to an office
// (office embeddings, Gemini's office list) and are never shown to students as facts (Entry 18).
// Used to point fallbacks to the right office (lib/directory.ts); not a source Gemini cites.
const DIRECTORY: { name: string; url: string; description: string; phone?: string; email?: string; keywords?: string[] }[] = [
  { name: "Admissions", url: "https://www.csulb.edu/admissions", description: "Each applicant to CSULB is considered with great care." },
  { name: "Enrollment Services", url: "https://www.csulb.edu/enrollment-services", description: "Current students can use our site for easy-to-follow information regarding class registration, degree progress and advising, filing to graduate and various other resources." , phone: "562.985.5471" },
  { name: "Student Records (Office of the Registrar)", url: "https://www.csulb.edu/student-records", description: "Plus, navigate the left menu for more services offered by Student Records--including guides on how to use your Academic Requirements Report (ARR), access planning tools (Degree Planner), order transcripts, and more." , phone: "562.985.5471" },
  { name: "Financial Aid and Scholarships", url: "https://www.csulb.edu/financial-aid-and-scholarships", description: "" , phone: "562.985.5471"  },
  { name: "Student Financial Services (tuition and fee payments)", url: "https://www.csulb.edu/financial-management/student-financial-services", description: "Your payment due date is available on your MyCSULB Student Center." , email: "cashiers@csulb.edu" },
  { name: "Commencement", url: "https://www.csulb.edu/commencement", description: "Your Commencement celebration will take place at Angel Stadium in Anaheim, Tuesday, May 18 through Friday, May 21, 2027." },
  { name: "Testing Department", url: "https://www.csulb.edu/student-affairs/testing-department", description: "Offers proctoring services for an allotted fee for anyone needing to take a paper or computer-based test for another university, college or agency." , phone: "562.985.4007", email: "testing@csulb.edu" },
  { name: "University Center for Undergraduate Advising (UCUA)", url: "https://www.csulb.edu/undergraduate-advising/university-center-for-undergraduate-advising-ucua", description: "The University Center for Undergraduate Advising (UCUA) is the primary advising center for" , email: "aa-advising@csulb.edu" },
  { name: "College of Business Center for Student Success", url: "https://www.csulb.edu/college-of-business/center-for-student-success", description: "" , phone: "(562) 985-4514", email: "cob-css@csulb.edu" , keywords: ["business major advising", "accounting", "finance", "marketing", "management", "information systems", "College of Business"] },
  { name: "Engineering Student Success Center (ESSC)", url: "https://www.csulb.edu/college-of-engineering/undergraduate-advising", description: "The Engineering Student Success Center (ESSC) Academic Advising Office serves the College of Engineering (COE) and is committed to helping students graduate in a timely manner with a highly-valued degree from California State University Long Beach." },
  { name: "College of Education Student Success and Advising Center", url: "https://www.csulb.edu/college-of-education/student-success-and-advising-center", description: "The College of Education Student Success and Advising Center utilizes a Generalist/Specialist model for drop-in advising." },
  { name: "College of Health and Human Services Academic Advising Center", url: "https://www.csulb.edu/college-of-health-human-services/chhs-academic-advising", description: "The College of Health & Human Services (CHHS) Academic Advising Center provides both general education and major academic advising" },
  { name: "College of Liberal Arts Advising Center (ATLAS)", url: "https://www.csulb.edu/college-of-liberal-arts/atlas", description: "Welcome to the College of Liberal Arts Advising Center: ATLAS!" , phone: "(562) 985-7804" },
  { name: "College of Natural Sciences and Mathematics Academic Advising Center", url: "https://web.csulb.edu/colleges/cnsm/advising/", description: "Each student in the College of Natural Sciences and Mathematics has an assigned academic advisor." },
  { name: "Career Development Center", url: "https://www.csulb.edu/career-development-center", description: "The CSULB Career Development Center empowers students to become effective leaders of their personal career journeys." , phone: "(562) 985-4151" },
  { name: "The Learning Center (tutoring)", url: "https://www.csulb.edu/academic-affairs/undergraduate-studies/the-learning-center", description: "Schedule an appointment and see hours for Tutoring, Academic Coaching, and Conversation Lab" , email: "TLC-info@csulb.edu" },
  { name: "University Writing Center", url: "https://www.csulb.edu/university-writing-center", description: "The University Writing Center is a campus-wide writing support service for all currently enrolled CSULB students." , phone: "(562) 985 5162", email: "UWC@csulb.edu" },
  { name: "University Library", url: "https://www.csulb.edu/university-library", description: ""  },
  { name: "Student Health Services", url: "https://www.csulb.edu/student-affairs/student-health-services", description: "Student Health Services is your campus health clinic, here to support and serve you on campus and virtually." , phone: "562.985.4771" },
  { name: "Counseling and Psychological Services (CAPS)", url: "https://www.csulb.edu/student-affairs/counseling-and-psychological-services", description: "Counseling and Psychological Services (CAPS) provides support for students facing personal challenges and mental health concerns." , phone: "562-985-4001" },
  { name: "Bob Murphy Access Center (BMAC)", url: "https://www.csulb.edu/student-affairs/bob-murphy-access-center", description: "The Bob Murphy Access Center (BMAC) is a department under CSULB Student Affairs that provides educational access for students with disabilities by working with campus and community partners to provide accommodations, resources, and assistive technology." , phone: "562.985.5401", email: "bmac@csulb.edu" },
  { name: "Basic Needs Program", url: "https://www.csulb.edu/student-affairs/basic-needs", description: "From food and housing security to financial wellness support, we are here to help you navigate college life with confidence and peace of mind." , phone: "562-985-2038", email: "supportingstudents@csulb.edu" },
  { name: "CARES Team", url: "https://www.csulb.edu/student-affairs/cares", description: "Crisis Assistance & Resource Education Support (CARES) helps students navigate challenges, connect with resources, and stay on track academically and personally." , email: "cares@csulb.edu" },
  { name: "Dean of Students", url: "https://www.csulb.edu/student-affairs/dean-of-students", description: "Our team provides support and advocacy for all of our students, in collaboration with faculty and staff across the university." },
  { name: "Veterans Services", url: "https://www.csulb.edu/student-affairs/veterans-services", description: "We help students access the educational benefits they earned by serving in the United States armed forces." },
  { name: "Dream Success Center", url: "https://www.csulb.edu/student-affairs/dream-success-center", description: "" , keywords: ["undocumented", "DACA", "AB 540", "Dream Act", "CA Dream Act"] },
  { name: "Educational Opportunity Program (EOP)", url: "https://www.csulb.edu/student-affairs/educational-opportunity-program", description: "The Educational Opportunity Program (EOP) at CSULB is dedicated to serving first-generation, historically low-income students by providing access and equity to higher education." , phone: "562.985.5637", email: "eop@csulb.edu" },
  { name: "Women's and Gender Equity Center", url: "https://www.csulb.edu/student-affairs/womens-gender-equity-center", description: "aims to foster women's and gender equity among individuals of diverse identities and expressions" , phone: "562.985.8576", email: "WGEC@csulb.edu" },
  { name: "Student Conduct and Ethical Development", url: "https://www.csulb.edu/student-affairs/student-conduct-and-ethical-development", description: "The Office of Student Conduct and Ethical Development investigates campus-related complaints and charges against students involving violations of campus regulations." },
  { name: "Office of Equity & Compliance (Title IX and civil rights)", url: "https://www.csulb.edu/equity-compliance", description: "To report an incident to the OEC, please complete the online reporting form." , email: "OEC@csulb.edu" },
  { name: "Student Life & Development (clubs and organizations)", url: "https://www.csulb.edu/student-affairs/student-life-development", description: "CSULB has more than 300 recognized student organizations, representing 12 diverse categories." },
  { name: "Center for International Education (international students)", url: "https://www.csulb.edu/international", description: "The Center for International Education is a one-stop hub for international programs at CSULB comprised of three distinct areas: International Enrollment Management (IEM), International Students and Scholars (ISS), and Study Abroad." , email: "cie-student@csulb.edu" },
  { name: "Student Orientation, Advising, and Registration (SOAR)", url: "https://www.csulb.edu/student-affairs/student-orientation-advising-and-registration", description: "All new first-time/first-year and transfer students are required to complete SOAR, as it is a mandatory program for all incoming students." , phone: "562.985.5515" },
  { name: "Housing & Residential Life", url: "https://www.csulb.edu/student-affairs/university-housing-residential-life", description: "CSULB's housing options offer students a convenient and supportive living environment." },
  { name: "Beach Shops (bookstore and campus dining)", url: "https://www.csulb.edu/beach-shops", description: "Comprised of the University Bookstore, Campus Dining Services and Convenience Stores, and Residential Dining Services, Beach Shops operates locations providing goods and services to students, staff and faculty and creating an inclusive learning environment." , phone: "562.985.5093" },
  { name: "ID Card Services", url: "https://www.csulb.edu/beach-shops/get-your-id", description: "You must be registered for at least one class for the current or upcoming semester to obtain your ID Card" , phone: "(562) 985-7388", email: "IDCard@csulb.edu" },
  { name: "Parking & Transportation Services", url: "https://www.csulb.edu/parking-and-transportation-services", description: "CSULB uses a completely paperless permitting system." },
  { name: "University Police", url: "https://www.csulb.edu/university-police", description: "It is the Mission of the California State University Long Beach Police Department to safeguard the lives and property of the campus community that we serve." , phone: "562.985.4101" },
  { name: "Division of Information Technology (Technology Help Desk)", url: "https://www.csulb.edu/information-technology", description: "is CSU Long Beach's enterprise technology organization and is responsible for providing high-quality, reliable, and secure information and technology services" , phone: "562.985.4959", email: "helpdesk@csulb.edu" },
  { name: "Academic Technology Services (Horn Center, computer labs, software)", url: "https://www.csulb.edu/academic-technology-services", description: "Academic Technology Services (ATS) leads the CSULB campus in leveraging technology that effectively supports and inspires instruction, online and in-person learning environments, business processes, and student learning." },
  { name: "Associated Students, Inc. (ASI)", url: "https://www.asicsulb.org/", description: "Associated Students, Inc. is a nonprofit membership association and auxiliary organization of California State University, Long Beach." , keywords: ["video games", "gaming", "esports", "games"] },
  { name: "Student Recreation and Wellness Center (SRWC)", url: "https://asirecreation.org/", description: "The Student Recreation and Wellness Center (SRWC) is a 126,500-square-foot, two-story, state-of-the-art recreation facility" },
];

const USER_AGENT = "Mozilla/5.0 (CSULB IS300 class project)";
// On csulb.edu list pages, each list entry (e.g. one advising center) is one of these.
const LIST_ITEM = ".views-view-responsive-grid__item";

const OUTPUT_DIR = path.join(process.cwd(), "knowledge");
const CHECKS_FILE = path.join(process.cwd(), "lib", "data", "page-checks.json");

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
async function fetchAsMarkdown({ url, morePages = 0, contentSelector = "main", stripContacts = false }: Source) {
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

  // Contact details: email and phone links are removed (their text is usually the address).
  // A marker takes their place so removeContacts() can drop the whole sentence around them.
  if (stripContacts) main.find('a[href^="mailto:"], a[href^="tel:"]').replaceWith(CONTACT_MARK);

  let markdown = turndown
    .turndown(main.html() ?? "")
    .replace(/\[\s*\]\([^)]*\)/g, "") // drop links that only wrapped an image (now empty)
    .replace(/(\d)\\\./g, "$1.") // turndown writes "1\." to avoid accidental lists; we want "1."
    .replace(/[ \t]+$/gm, "") // trailing spaces
    .replace(/\n{3,}/g, "\n\n") // collapse big blank gaps
    .replace(/(\n\s*\* \* \*\s*)*\n## Sidebar\s*$/, "") // drop a sidebar that ended up empty
    .replace(/(\n\s*\* \* \*\s*)+$/, "") // drop trailing divider lines
    .trim();
  if (stripContacts) markdown = removeContacts(markdown);

  return { title, markdown };
}

/**
 * Entry 34: remove contact details from a page's Markdown, so no staff or officer names, emails, or
 * phone numbers are stored. What goes:
 *   - any sentence holding an email address, a phone number, or a removed email link (so we never
 *     leave half sentences like "contact or ."),
 *   - a paragraph that starts with a contact label ("**Club Advisor**", "Officers:") and the name
 *     lines under it,
 *   - lines that are only a label and a contact ("Email: ...", "Phone: ...").
 * Everything else stays word for word.
 */
const CONTACT_MARK = "CONTACTREMOVED"; // plain letters, so the Markdown converter leaves it alone
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
const CONTACT_WORDS = /\b(advisors?|advisers?|officers?|president|vice president|treasurer|secretary|coordinator|contacts?|e-?mail|phone|board|e-?board|cabinet|recipients?)\b/i;
// Entry 35: a sentence that names people in a role ("With the help of ... CSS faculty advisors, Dr. A,
// Dr. B, ...") is dropped too: a role word plus a title before a name, in either order.
const NAMED_ROLE = /\b(advisors?|advisers?|officers?|president|treasurer|secretary|coordinator)\b[\s\S]*\b(Dr\.|Professor|Prof\.)\s+[A-Z]|\b(Dr\.|Professor|Prof\.)\s+[A-Z][\s\S]*\b(advisors?|advisers?|officers?|president|coordinator)\b/;
function removeContacts(markdown: string) {
  const hasContact = (text: string) => text.includes(CONTACT_MARK) || EMAIL.test(text) || PHONE.test(text) || NAMED_ROLE.test(text);
  return markdown
    .split(/\n{2,}/)
    .filter(function (this: { dropList: boolean; dropSection: boolean }, para) {
      const first = para.split("\n")[0].trim();
      // Entry 35: a "## Contact" heading and everything under it (a staff name and title) go,
      // up to the next heading.
      if (/^#+\s/.test(first)) {
        this.dropSection = /^#+\s*(contacts?|contact us|staff|advisors?|officers?)\s*$/i.test(first);
        if (this.dropSection) return false;
      } else if (this.dropSection) return false;
      // A list right after a dropped label ("**Executive Board:**" then "- **VP:** Name") goes too.
      if (this.dropList && /^\s*([-*+]|\d+\.)\s/.test(para)) return (this.dropList = false);
      this.dropList = false;
      const isLabel = /^(\*\*|__).*(\*\*|__):?$/.test(first) || /:\s*$/.test(first);
      if (isLabel && first.length <= 80 && CONTACT_WORDS.test(first)) return !(this.dropList = true);
      return true;
    }, { dropList: false, dropSection: false })
    .join("\n\n")
    // "visit the website _or_ <email>": drop just the email and its "or", keeping the website link.
    .replace(new RegExp(`\\s*(_or_|\\bor\\b|,)\\s*${CONTACT_MARK}`, "g"), "")
    .replace(new RegExp(`${CONTACT_MARK}\\s*(_or_|\\bor\\b)\\s*`, "g"), "")
    .split("\n")
    // Role lines that name a person ("**President:** Name", "Faculty Advisor: Name").
    .filter((line) => !/^\W*([A-Za-z]+ ){0,2}(advisors?|advisers?|officers?|president|vice president|treasurer|secretary|coordinator|contact|e-?mail|phone)\b[^:.]{0,40}:/i.test(line.trim()))
    .map((line) => {
      if (!hasContact(line)) return line;
      if (/^\W*(e-?mail|phone|tel|contact)\b[^.]*:/i.test(line.trim())) return "";
      if (line.trim().startsWith("|")) return line.split("|").map((cell) => (hasContact(cell) ? " " : cell)).join("|");
      // Keep the line's list/heading prefix, drop only the sentences with contact details.
      const [, prefix, body] = line.match(/^(\s*(?:[-*+]|\d+\.|#+)?\s*)(.*)$/)!;
      // (Never split after a title like "Dr." or "Prof.", so "advisors, Dr. A, Dr. B" stays one sentence.)
      const kept = body.split(/(?<=(?<!\b(?:Dr|Prof|Mr|Mrs|Ms))[.!?])\s+/).filter((sentence) => !hasContact(sentence)).join(" ");
      return kept ? prefix + kept : "";
    })
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\n\s*\* \* \*\s*)*\n## Sidebar\s*$/, "") // a sidebar left empty after removing its contact section
    .trim();
}

/** Page text for checking directory sentences and contacts: main content, sidebar, and meta description. */
async function pageText(url: string) {
  const $ = cheerio.load(await download(url));
  const meta = $('meta[name="description"]').attr("content") ?? "";
  $("script, style, noscript, nav").remove();
  const main = $("main").length ? $("main") : $("body");
  // csulb.edu pages keep contact details in a sidebar next to <main> (the same one our knowledge files include).
  return normalize(`${main.text()} ${$("aside.sidebars").text()} ${meta}`);
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
  // Our knowledge files, for checking contacts that appear there instead of on the office's home page.
  const { readdir, readFile } = await import("node:fs/promises");
  const knowledgeText = normalize(
    (await Promise.all((await readdir(OUTPUT_DIR)).map((f) => readFile(path.join(OUTPUT_DIR, f), "utf8")))).join(" "),
  );
  const offices = [];
  for (const office of DIRECTORY) {
    try {
      const page = await pageText(office.url);
      if (office.description && !page.includes(normalize(office.description))) {
        throw new Error("description not found word for word on the page");
      }
      // Keep a phone/email only if it's on the office's page or in our knowledge files.
      const entry: { name: string; url: string; description: string; phone?: string; email?: string; keywords?: string[] } = { name: office.name, url: office.url, description: office.description };
      for (const field of ["phone", "email"] as const) {
        const value = office[field];
        if (!value) continue;
        if (page.includes(value) || knowledgeText.includes(value)) entry[field] = value;
        else console.error(`WARN  directory: ${office.name}: ${field} ${value} not found, left out`);
      }
      if (office.keywords?.length) entry.keywords = office.keywords; // matching hints, not facts: not checked against the page
      offices.push(entry);
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
  // When each page was last fetched and checked (Entry 32). Shown as "checked Nov 23" on source chips.
  // Pages that fail this run keep their previous date.
  const checks: Record<string, string> = JSON.parse(await readFile(CHECKS_FILE, "utf8").catch(() => "{}"));
  const changed: string[] = [];

  // ONLY=slug1,slug2 fetches just those pages (Entry 34: add new pages without refreshing all 130).
  const only = process.env.ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  for (const source of SOURCES.filter((s) => !only || only.includes(s.slug))) {
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
      // Only rewrite the file when the page's text (or title, URL, category) changed, so a file's
      // "retrieved" date means "when this text was copied". A page that's unchanged keeps its file.
      const file = path.join(OUTPUT_DIR, `${source.slug}.md`);
      const next = `${header}\n\n${markdown}\n`;
      const previous = await readFile(file, "utf8").catch(() => null);
      const withoutDate = (text: string) => text.replace(/^retrieved: .*$/m, "");
      if (previous === null || withoutDate(previous) !== withoutDate(next)) {
        await writeFile(file, next);
        changed.push(source.slug);
      }
      checks[source.slug] = today;
      console.log(`OK    ${source.slug.padEnd(32)} ${markdown.split(/\s+/).length} words${changed.at(-1) === source.slug ? "  (changed, saved)" : ""}`);
    } catch (err) {
      // Never invent content: if a page fails, report it and skip it.
      console.error(`FAIL  ${source.slug.padEnd(32)} ${(err as Error).message}`);
    }
  }
  const sorted = Object.fromEntries(Object.entries(checks).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(CHECKS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\n${changed.length} page(s) changed and were saved${changed.length ? `: ${changed.join(", ")}` : ""}. Check dates saved to lib/data/page-checks.json.`);
  await buildDirectory(today);
}

main();
