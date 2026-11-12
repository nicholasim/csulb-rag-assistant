# Prompt Log: CSULB Services RAG Assistant

The assignment needs at least 5 meaningful prompt iterations and at least 2 times the AI got something wrong and we fixed or redirected it. Add an entry every time you give Claude Code a real prompt, not just "yes" or "continue".

---

## Entry 1 (Phase 1: Knowledge base)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Read everything in docs/ first: the assignment (is300_capstone.docx), our Solution Design Brief (PDF), and prompt-log.md. We're building the CSULB Services RAG Assistant described there. The brief is our spec, so follow it.
>
> STACK (already set up): Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui. Gemini via the official @google/genai SDK (not the OpenAI-compatible endpoint, since our "AQ." key fails there). Key in .env.local as GEMINI_API_KEY, server-only, never hardcoded/logged/sent to the browser. Optional GEMINI_MODEL env variable. Deploying to Vercel, so no separate server or paid database.
>
> HOW IT SHOULD WORK: (1) Knowledge base: one Markdown file per approved source in knowledge/ with a header (title, url, category, date retrieved), URLs from the "CSULB Sources" table. (2) Retrieval: chunk by heading (~150-300 words), find top 3-5 chunks with simple keyword ranking like BM25, no vector database. (3) Fallback: if nothing matches well, skip the LLM and reply exactly "I do not have enough information in the provided CSULB sources." plus the most related department page. (4) Answer: send chunks + question to Gemini with a strict system prompt (sources only, inline [1] citations, clarifying question when ambiguous, exact fallback sentence, no medical/legal/financial advice, no personal info). (5) API returns the answer plus sources used (title, url, excerpt).
>
> UI, ERROR CASES, and TESTING requirements (welcome message with example questions, category sidebar, source chips, black and gold, friendly errors for empty / over 500 characters / missing key / Gemini errors, tests/test-questions.json with 12+ questions and an npm results-table script).
>
> WORK IN PHASES. Stop after each one so I can review, commit, and log it.
> Phase 1: Build the knowledge base only. Fetch each URL and copy the page's actual text into Markdown. Do NOT summarize or reword, because exact dates, prices, and contacts matter. If a page fails to load or looks incomplete, tell me instead of filling gaps. Also flag: (a) the "campus map and parking" link is a conference page, not an official map page, so suggest an official CSULB replacement; (b) Bookstore/Day 1 Textbooks, Orientation, and Instructor Information have no sources, so ask whether to add sources or treat them as intentionally unanswerable.

**What the AI did:**
- Read the assignment PDF (it is `is300 capstone.pdf`, not a .docx) and the Solution Design Brief.
- Wrote `scripts/fetch-sources.ts` (run with `npm run fetch-sources`). It downloads all 14 approved CSULB pages, keeps only the main page content plus the page's sidebar, and converts the HTML to Markdown with a converter (no AI rewording). Each file in `knowledge/` gets a header with title, url, category, and date retrieved.
- Read every generated file to check it against the real page, then reported problems instead of filling gaps:
  - **Academic Advising is incomplete.** The page loads advising centers in batches behind a "Load More" button. Only the first batch (10 centers, ending at English) was captured. Four more batches (35 centers, including Business, Engineering, Natural Sciences, and Arts) live at `?page=1` to `?page=4`.
  - **Thin pages.** Library Services and Student Health are mostly lists of links (nothing on reserving a study room, no clinic hours or phone). International advising names no specific advisors.
  - **Source quirks copied exactly.** The enrollment page lists two different Spring 2027 drop deadlines (Feb. 3 and Feb. 2). The parking page announces a fee freeze but shows the motorcycle permit rising from $129 to $140. The food page lists "Playa Tacos and Mas" on campus, which affects our "taco spots near campus" unanswerable test.
- Flag (a): recommended replacing the 2024 conference map page with the official Permit Information page (as a knowledge source) and https://www.csulb.edu/maps (as the page to send students to).
- Flag (b): found official pages for Day 1 Textbook Access and SOAR orientation. Recommended treating instructor ratings as intentionally unanswerable, since no official CSULB source exists.

**Did it work?** Partly. All 14 pages downloaded, but Academic Advising is incomplete and some pages are thin. Three decisions are waiting on us (advising batches, map replacement, new sources).

**Troubleshooting or redirection (if any):**
The first version of the script produced bad output that Claude caught by reading each file:
- **Broken tables.** Table cells with line breaks, paragraphs, or numbered lists split rows apart on the enrollment page (Reinstatement, Permission to Add) and the parking fee table ("Short-Term / 30 min"). Fixed by flattening multi-line cells into one line.
- **Footnotes merged into words.** "Motorcycle Semester¹" became "Motorcycle Semester1". Fixed by writing footnotes as "^1".
- **Missing contact info.** The Technology Help Desk phone, email, and hours were missing because they are in the page sidebar, not the main content. Fixed by including the sidebar.
- **Smaller fixes.** Leftover image links were removed, empty "Sidebar" headings were removed, and the retrieved date was changed from UTC (which showed tomorrow) to local time.

**Screenshot / commit:**

---

## Entry 2 (Phase 1: Filling knowledge base gaps)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Answers:
> 1. Yes, fetch all four remaining Academic Advising batches (?page=1 to ?page=4) and merge them into academic-advising.md. "Find my advisor's contact info" is a Must story in our brief.
> 2. Yes, replace the conference map page with the Permit Information page as a knowledge source. Use csulb.edu/maps as the link we point students to for map questions.
> 3. Yes, add the Day 1 Textbook Access and SOAR pages. Treat instructor ratings as intentionally unanswerable. That'll be one of our fallback test cases.
>
> Two more gaps to fill:
> 4. International advising: also fetch the Staff Contacts page that the meet-an-advisor page links to, so "who is my international advisor" can actually be answered.
> 5. Find an official csulb.edu library page about reserving group study rooms and add it. If none exists, tell me, and we'll treat that question as unanswerable.
>
> For the conflicting Spring 2027 drop dates (Feb 2 vs Feb 3): keep both as-is. In Phase 2, the system prompt should tell Gemini that when sources conflict, it shows both and tells the student to confirm with the office.
>
> Re-run the fetch script, re-check the new and changed files, update the prompt log, then stop. Don't start Phase 2 yet.

**What the AI did:**
- **Academic Advising:** taught the fetch script to handle "Load More" pages. It downloads the 4 extra batches, copies only the advising-center entries (each batch repeats the page intro), and merges them into `academic-advising.md`. The file now lists all 45 advising centers instead of 10, including Business (Center for Student Success), Engineering, Natural Sciences, and the Arts.
- **Campus map:** removed the 2024 conference page and added the official Permit Information & Regulations page (`parking-permit-information.md`). It covers where and how to buy permits, which lots each permit is valid in, refunds, and overnight parking. `csulb.edu/maps` is saved as a to-do for Phase 2, as the department link for map questions.
- **New sources:** added Day 1 Textbook Access (category "Bookstore"), SOAR orientation (category "Orientation"), and the International Staff Contacts page. That page names the three International Student Advisors with email and phone.
- **Library study rooms:** searched the library's own pages and the web. No official csulb.edu page explains how to reserve a group study room. The closest is the library "Study Areas" page, which lists the floors where group study is allowed but says nothing about reserving. Not added; the question will be treated as unanswerable.
- Re-ran the script (17 sources, all loaded), type-checked it, and read every new or changed file.
- The knowledge base now has 17 files.

**Did it work?** Yes. All 17 pages downloaded and the new files are complete.

**Troubleshooting or redirection (if any):**
- **Redirection from us:** we told Claude to fetch the rest of the Academic Advising page, swap the conference map page for an official one, add the Staff Contacts page, and look for a study room page. Claude had only flagged these in Entry 1.
- **Wrong number from Claude:** in Entry 1, Claude said the first Advising batch had 15 centers. Counting after the merge showed it was 10 (10 + 10 + 10 + 10 + 5 = 45). Entry 1 was corrected.
- **Bug found and fixed:** after the first merge, a leftover "Load More" button label was still in the file. Fixed by removing that button too.

**Notes for Phase 2:**
- System prompt: when sources conflict (e.g., Spring 2027 drop deadline Feb. 2 vs Feb. 3), show both and tell the student to confirm with the office.
- Fallback links: send map questions to https://www.csulb.edu/maps.
- Expected unanswerable questions: instructor ratings, reserving a group study room, "taco spots near campus".
- The Day 1 page's sidebar still lists Spring 2026 deadlines (already past). Copied as-is, but keep it in mind when testing.
- Most advising entries link to a "Contact & Location" page instead of listing phone numbers. The assistant can name the right center and link it, but usually not give a phone number.

**Screenshot / commit:**

---

## Entry 3 (Phase 2: Retrieval, fallback, and the Gemini API route)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Start Phase 2: retrieval, fallback logic, and the Gemini API route. Follow the original plan, plus:
>
> - When sources conflict (like the Feb 2 vs Feb 3 Spring drop date), show both and tell the student to confirm with the office.
> - For map or "how do I get around campus" questions, point students to https://www.csulb.edu/maps.
> - Advising entries usually link to a "Contact & Location" page instead of a phone number. In that case, name the right advising center and give the link. Never make up a phone number or email.
> - Fallback answers should suggest the most related department page when one exists in the knowledge base.
> - Before calling Gemini, check that GEMINI_API_KEY exists, and return a friendly error if it doesn't.
>
> Test it from the terminal (not the UI yet) with at least these, and show me the actual output for each:
> 1. "How much is a semester student parking permit?" (should answer with source)
> 2. "Who are the international student advisors?" (should answer with names)
> 3. "How do I apply?" (should ask a clarifying question)
> 4. "Where are the nearest taco spots near campus?" (should fall back, even though Playa Tacos is on campus)
> 5. "Who is the best professor for CECS 326?" (should fall back)
> 6. "How do I reserve a group study room?" (should fall back)
>
> If any of those don't behave as expected, tell me what happened before you fix it. Then update the prompt log and stop before Phase 3.

**What the AI did:**
Built the back end of the RAG flow (question -> retrieve -> AI answer -> answer + source):
- `lib/knowledge.ts`: loads the 17 knowledge files and cuts them into 92 chunks of about 150-300 words, split at headings. Big tables are split between rows, repeating the header row in each piece.
- `lib/retrieval.ts`: BM25 keyword search that finds the top 5 chunks for a question. It drops filler words ("how", "the", "csulb"), treats plurals like singulars ("tacos" = "taco"), and has a short synonym list ("how much" also searches "price" and "fee").
- `lib/gemini.ts`: the strict system prompt and the Gemini call (official `@google/genai` SDK, Interactions API). Gemini must reply in a fixed JSON format labeled `answer`, `clarify`, or `fallback`, so the code knows which kind of reply it got. Model: `gemini-3.8-flash`, changeable with `GEMINI_MODEL`. `store: false` keeps students' questions from being saved on Google's servers.
- `lib/rag.ts`: the full pipeline:
  - check the input (empty, over 500 characters);
  - retrieve the top chunks;
  - if the best match scores under 3.0 (only one common word matched), reply with the exact fallback sentence without calling the AI;
  - otherwise ask Gemini with only those chunks;
  - double-check every email, phone number, and link against the sources;
  - return the answer plus the cited sources (title, url, short excerpt).
- `app/api/chat/route.ts`: the `POST /api/chat` endpoint. Every problem becomes a friendly JSON error, never a crash or stack trace.
- `next.config.ts`: tells Vercel to include the `knowledge/` files when deploying.

Final test results (from the terminal, against the running app):
| # | Question | Expected | Result |
|---|---|---|---|
| 1 | How much is a semester student parking permit? | answer + source | "$259 [1, 5]" with chips for the Fee Schedule and Permit Information pages. PASS |
| 2 | Who are the international student advisors? | names | Ignacio Castor, Tammy Guzman, Angela Garris with emails, phone 562-985-2919 [2]. PASS |
| 3 | How do I apply? | clarifying question | "Do you mean admission, scholarships, graduation, financial aid, or something else?" PASS |
| 4 | Where are the nearest taco spots near campus? | fallback | Exact fallback sentence + link to the Eat and Shop page. PASS |
| 5 | Who is the best professor for CECS 326? | fallback | Exact fallback sentence (no related department). PASS |
| 6 | How do I reserve a group study room? | fallback | Exact fallback sentence + link to University Library Services. PASS |

Also checked:
- Advising question: named the Computer Science advising center and gave its Contact & Location link, no made-up number.
- Map question: pointed to csulb.edu/maps.
- Error cases: empty question, 639-character question, malformed request, and missing API key all return friendly messages.

**Did it work?** Partly. All 6 required questions pass, but only after fixing several problems (below), and the conflicting-dates rule only works some of the time.

**Troubleshooting or redirection (if any):**
1. **Gemini was overloaded, so the first test run failed completely.** Questions 1-3 returned friendly errors after about 9-37 seconds each. Claude checked the server log and made a direct test call. The cause was Google's servers: `503 gemini-3.8-flash is currently experiencing high demand`. Our API key was fine. The SDK's automatic retries made students wait about 34 seconds, and one retry also hit a Node.js bug that showed up as a confusing "connection error".
   **Fix:** if the main model is overloaded (503), rate-limited (429), erroring, or times out, the app switches right away to a backup model (`gemini-3.5-flash-lite`, changeable with `GEMINI_BACKUP_MODEL`). No long retries. Answers now take 1-4 seconds.
2. **The AI made up an email address.** On the backup model, question 2 showed `angela.garris@csulb.edu`, but the link behind it was `mailto:angela.gizzis@csulb.edu`, an address that doesn't exist.
   **Fix:** added a safety check in `lib/rag.ts`. Every email, phone number, and link in an answer must appear word for word in the retrieved sources. Anything that doesn't is removed, and the student sees a note to check the source page. Tested on the exact bad answer: the wrong address was removed and the correct one kept.
3. **Question 5 hit the free-tier rate limit (429)** after many test calls. The student-facing message worked ("too many questions right now, please wait a minute"), but the test never ran. The backup-model fix above now also covers 429.
4. **Retrieval missed the price table.** For "How much is a semester student parking permit?", the chunks with the actual prices weren't in the top 10. Pages that repeat "parking" and "permit" outranked them, and "how much" didn't match "Price". Fixed by adding synonyms and counting section headings twice. The price tables now rank #1 and #5.
5. **Source excerpts showed the wrong line.** The parking chip quoted a sentence about sponsored students instead of the $259 row. Later, citation markers like "[1, 5]" were counted as matching numbers. Date excerpts were also cut off before the date. Fixed by picking the source line that shares the most facts (especially numbers) with the sentence citing it, and by shortening long table descriptions so the dates still show.
6. **Conflicting dates (not fully fixed).** "What is the last day to drop a class without a W in Spring 2027?" answered only Feb. 3. Retrieval had found the Feb. 2 chunk (ranked #2); the backup model just didn't connect the two dates. Added a more explicit rule with an example to the system prompt. "When is the add/drop deadline for spring?" now shows both dates and says to confirm with Enrollment Services, but the "without a W" wording still gets only Feb. 3. Retest when `gemini-3.8-flash` is available again.

**Notes for later phases:**
- Optional settings for `.env.local` and Vercel: `GEMINI_MODEL` (main model, default `gemini-3.8-flash`) and `GEMINI_BACKUP_MODEL` (default `gemini-3.5-flash-lite`). `gemini-4-carbon` isn't usable on our free tier (its limit is 0).
- The API accepts an optional `history` (the last few chat messages), so a follow-up like "graduation" after "How do I apply?" can be understood. The Phase 3 UI should send it.
- Phase 4: add the conflicting-date questions to the test file, and spread the tests out in time to avoid free-tier rate limits.

**Screenshot / commit:**

---

<!-- Copy an entry block above for each new prompt -->
