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

## Entry 4 (Requirements checklist and team decisions)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Create docs/requirements-checklist.md from the assignment PDF and our design brief. List every requirement as a checkbox, grouped like this: Prototype, Prompt log, Design brief features, Accuracy, Presentation. Mark what's already done with a note on where (file or commit). From now on, update this checklist at the end of every phase, along with the prompt log.
>
> (Follow-up) Decisions on the four checklist items:
> 1. Add the official CSULB Basic Needs page as a source (category: Basic Student Support). Re-run fetch-sources and check the new file.
> 2. Build a simple version of "write a claim": on fallback answers, show a "Request this topic" button. When clicked, log the question text only (no IP or personal info) on the server with console.log so it shows up in Vercel logs, and tell the student "Thanks, we'll consider adding this topic." No database. Build the button as part of Phase 3.
> 3. "Student experiences and reviews": don't build it. Mark it as future work in the checklist, because it conflicts with our official-sources-only rule.
> 4. Source quirks: keep them as-is and mark them in the checklist for our testing/limitations slide.

**What the AI did:**
- Created `docs/requirements-checklist.md`. Every requirement from the assignment and the design brief is a checkbox, and done items point to a file or commit.
- While building it, Claude scanned every commit for the API key. None found: `.env.local` has never been committed.
- Claude flagged four brief items that needed a team decision:
  - Basic Student Support had no source.
  - "Write a claim" wasn't planned.
  - "Student reviews" conflicts with using official sources only.
  - Some source quirks needed a decision.
- After our decisions, added the official Basic Needs page (https://www.csulb.edu/student-affairs/basic-needs) to `scripts/fetch-sources.ts` and re-ran it. The new `knowledge/basic-needs.md` (351 words) has the office location, email, phone, hours, eligibility questions, and resource links. Questions about food or housing help now retrieve it.
- The re-run also showed that none of the other 17 pages had changed since they were first fetched.
- Updated the checklist with all four decisions. The knowledge base now has 18 sources in 14 categories.

**Did it work?** Yes.

**Troubleshooting or redirection (if any):**
- **Redirection from us:** we made the four decisions Claude asked about. We added Basic Needs, chose a simple "Request this topic" button instead of a database, dropped student reviews, and kept the source quirks for the limitations slide.
- **Something to watch:** the Basic Needs page lists screening questions about food, housing, and money. The assistant must not ask students these; it should point to the page's Referral Form. The system prompt already forbids asking for personal information. To be tested in Phase 4.

**Screenshot / commit:**

---

## Entry 5 (Phase 3: Chat UI)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Start Phase 3: the chat UI. Don't change the retrieval or Gemini logic unless something is broken. If it is, tell me first.
>
> Goal: it should look like a polished, trustworthy CSULB student tool. Use the frontend-design, ui-ux-pro-max, and shadcn skills.
>
> Layout (from our brief):
> - Sidebar with the service categories. Clicking one drops a good starter question for that category into the input. On mobile the sidebar becomes a slide-out menu.
> - Welcome screen with a short greeting and 4-6 clickable example questions. Only use questions we've verified work (permit price, international advisors, Day 1 Textbooks, SOAR orientation, add/drop deadline, Technology Help Desk hours).
> - Chat stream with a sticky input box at the bottom, Enter to send, and a character counter near the 500 limit.
>
> Answers:
> - Render basic formatting (bold, lists, links).
> - [1], [2] citations in the text should match numbered source chips under the answer. Clicking a chip expands the excerpt and shows a "View on csulb.edu" link.
> - Make each response type visually distinct: normal answer, clarifying question (if it lists options, show them as clickable buttons), fallback (calm and helpful, with the suggested department link as a button), and error (friendly, with a retry button).
> - Loading state while waiting (typing dots or a skeleton).
>
> Style:
> - CSULB black and gold, plenty of white space, readable font sizes, good contrast. Clean and modern, not flashy.
> - A small footer note: "Answers come only from official CSULB web pages. Don't enter personal information."
> - Accessible: keyboard navigation, focus states, alt text and aria labels.
>
> When it's built, use Playwright to take screenshots (desktop and mobile) of: the welcome screen, a normal answer with an expanded source chip, the "How do I apply?" clarifying question, a fallback, and an error. Save them to docs/screenshots/ and show me. Then update the prompt log and checklist, and stop so I can give design feedback.

**What the AI did:**
- Used the three design skills:
  - ui-ux-pro-max suggested an "AI-native chat" style and a pre-delivery checklist. Claude replaced its default purple palette with our CSULB black and gold.
  - frontend-design: a short design plan, checked against generic "AI-looking" defaults.
  - shadcn: set up shadcn/ui and used its chat components (MessageScroller, Message, Bubble, Sheet, InputGroup, Alert).
- **Look:**
  - CSULB black sidebar, white chat area, gold (`#F2B000`) used only as a fill behind black text so contrast stays high, and dark gold `#7A5600` for links.
  - Typeface: Public Sans, designed for public-service websites.
  - The distinctive element is the gold citation tabs: a [1] in the answer is a small gold tab that opens the matching numbered source chip.
- **Built:**
  - Sidebar with 15 service categories (all 14 knowledge-base areas plus Campus Maps). Clicking one fills a starter question into the box without sending it. On mobile it becomes a slide-out menu.
  - Welcome screen with the 6 example questions. Claude tested Day 1, SOAR, and Tech Help Desk hours end to end first, since they hadn't been tested before; all three gave cited answers.
  - Chat stream with a sticky input. Enter sends and Shift+Enter adds a line. A counter appears at 400+ characters and over 500 it turns red and blocks sending.
  - Five visually distinct reply types:
    - **Answer:** formatted text with gold citation tabs and numbered source chips. A chip opens the quote and a "View on csulb.edu" button.
    - **Clarifying question:** pale gold card with the options as buttons. Clicking one sends it as a follow-up.
    - **Fallback:** calm gray card with the exact fallback sentence, a "Try: [department page]" button, and "Request this topic".
    - **Error:** friendly red notice with a "Try again" button.
    - **Loading:** gold typing dots with "Checking official CSULB pages…".
  - "Request this topic" (team decision from Entry 4): `app/api/request-topic/route.ts` logs only the question text, e.g. `[topic-request] "Where are the nearest taco spots near campus?"`, with no IP and no database. The student sees "Thanks, we'll consider adding this topic."
  - The chat sends the last few messages as `history`, so clicking "Graduation" after "How do I apply?" gets a real graduation answer. This is the first time that feature was tested.
  - Accessibility: every button has a label, focus rings are visible, Tab moves through the sidebar, examples, and input in order, new messages are announced to screen readers, links that open new tabs say so, and the loading animation turns off for people who prefer reduced motion.
- `scripts/take-screenshots.ts` (`npm run screenshots`) takes 13 screenshots, saved in `docs/screenshots/`. It covers desktop and mobile versions of the welcome screen, mobile menu, answer with source, clarifying question, fallback (before and after "Request this topic"), and error. A separate check saved `desktop-06-clarify-follow-up.png`.
- The error screenshot uses a simulated Gemini rate-limit response, because a real outage can't be triggered on demand. Everything else in it is the real app.
- Retrieval and Gemini logic were not changed. The only edit to `lib/rag.ts` moved the 500-character limit into `lib/limits.ts` so the browser and server share it.

**Did it work?** Yes, after the fixes below. All screenshots show the intended states with real Gemini answers (except the simulated error).

**Troubleshooting or redirection (if any):**
Claude reviewed its own first round of screenshots and found these problems:
1. **Gray, faded input box.** The shadcn `InputGroup` fades the whole box when anything inside it is disabled, and the send button was disabled while empty. That made the placeholder hard to read. Fixed by marking the button `aria-disabled` instead and blocking empty sends in code.
2. **Clarifying question looked like the fallback.** Both were gray, because the "tinted" bubble color is computed from our black primary color. Fixed by adding a pale gold `accent` variant to the Bubble component.
3. **The mobile menu looked broken (washed-out).** Claude debugged it with a browser console capture and found the menu was fine: the screenshot was taken mid-animation. Fixed the script to wait for the animation to finish.
4. **A "1 Issue" badge** in the corner came from a hydration warning caused by Playwright hiding the text cursor, not by our app. Fixed in the screenshot script (`caret: "initial"`). Next.js's dev-only "N" badge was also hidden (`devIndicators: false`) so it doesn't cover the footer.
5. **Smaller fixes:** the error's "Try again" button moved under the message so long messages aren't squeezed on phones, and a shorter placeholder keeps the mobile input from being too tall.

**Open design questions for the team:**
- Should source excerpts from tables show the column names? E.g. "Student Semester | $250 | $259 | $259 | $259" could read "FY23/24: $250 … FY26/27: $259". That would change the excerpt code in `lib/rag.ts`, so Claude didn't change it without asking.
- The error notice uses red text for the whole message. Keep it, or soften it to black text with only a red icon?

**Screenshot / commit:** `docs/screenshots/` (13 + 1 files)

---

## Entry 6 (Phase 3: Design feedback round 1)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Design feedback round 1 from our team. Fix these, then retake the same screenshots and show me:
>
> Bugs
> 1. Source numbering: renumber cited sources 1, 2, 3 in the order they appear, with no gaps. If two cited chunks come from the same page, show one chip, or label each with its section heading so they don't look duplicated.
> 2. Add a "New chat" button (top of the sidebar on desktop, in the header on mobile) that clears the conversation and returns to the welcome screen.
> 3. Only put a citation on sentences the source actually says. If Gemini reasons something itself (like comparing a deadline to today's date), either drop that sentence or leave it uncited. Update the system prompt for this.
>
> Answer quality
> 4. Answers should be 2-4 sentences: the direct answer first, then one useful related detail and a next step if the sources have them (for example, the semester price plus the academic-year price and where to buy the permit).
> 5. Table excerpts in source chips should include the column header, e.g. "Student Semester, FY26/27: $259".
> 6. Cite once per paragraph or list, not after every bullet.
>
> Visual polish
> 7. Input focus state: replace the thick brown double ring with a clean, thin gold ring.
> 8. Error card: black text, with red only on the icon and a thin border.
> 9. Welcome screen: add a small trust line under the examples, like "Searches 18 official CSULB pages · Every answer links to its source."
> 10. Mobile: make the empty input box shorter (about 2 lines tall, growing as you type).
>
> Don't change retrieval or the fallback logic. Rerun the 6 Phase 2 test questions after the prompt changes to make sure nothing broke, then update the prompt log and checklist.

**What the AI did:**
1. **Source numbering** (`lib/rag.ts`, `renumberCitations`): after Gemini answers, citations are renumbered 1, 2, 3 in the order they appear. Chunks from the same web page share one number, so each page gets one chip. Citation numbers Gemini made up are dropped. Example: Gemini's "[5] … [1][2]" (where 1 and 2 are the same page) becomes "[1] … [2]".
2. **New chat:** a button at the top of the desktop sidebar, plus an icon in the mobile header (shown once a conversation exists). Both clear the chat and return to the welcome screen. Tested with Playwright on desktop and mobile.
3. **Citations only on what sources say** (system prompt, `lib/gemini.ts`): a citation means "the source states this". Anything Gemini adds itself, like comparing a deadline with today's date, goes in its own sentence with no citation, or is left out.
4. **2-4 sentence answers** (system prompt): direct answer first, then one related detail and one next step if the sources have them. Claude first put real parking facts in the prompt as the example, then replaced them with a fact-free template. Real facts in the prompt could leak into answers about other topics.
5. **Column headers in table excerpts:**
   - Excerpt examples:
     - "Student Semester, FY23/24: $250; …; FY26/27: $259"
     - "Ignacio Castor, Title: International Student Advisor; Email: …; Phone: …"
   - If the answer names a column (like "Spring 2027"), only that column is shown.
   - Excerpts now favor lines with the same numbers as the answer (prices, dates, phone numbers), especially in tables.
   - A chip can show two lines when one page backs up two numbers ($259 per semester and $518 per year).
6. **Cite once per paragraph or list** (`citeOncePerParagraph`): within a paragraph, each source number is kept only where it last appears. "A [1]. B [1]. C [1]." becomes "A. B. C. [1]".
7. **Focus ring:** one thin gold ring around the input instead of the thick brown double ring.
8. **Error card:** black text, red only on the icon and a thin red border.
9. **Trust line** on the welcome screen: "Searches 18 official CSULB pages · Every answer links to its source." The 18 is counted from the `knowledge/` folder when the page is built, so it stays correct if we add pages.
10. **Shorter mobile input:** the send button moved inside the box, and the hint and counter moved below it. The empty box is now 70px tall (about 2 lines, was about 120px) and grows as you type.
- **Not changed:** retrieval and the fallback logic. The six Phase 2 questions still pass on the final code (all answered by the backup model, because `gemini-3.8-flash` was rate-limited).
- **Screenshots:** all retaken (14 files in `docs/screenshots/`, including `desktop-06-clarify-follow-up.png`).

**Did it work?** Yes. All 10 items are done, and the 6 Phase 2 questions pass.

**Troubleshooting or redirection (if any):**
- **Redirection from us:** the 10 feedback items above.
- **Prompt alone wasn't enough for "cite once per paragraph" (#6).** With the new prompt, the backup model still put [1] after every sentence. Claude added a small code rule that removes repeated citations inside a paragraph. A first version left "$259 [1, 2] … [2]", which still cited source 2 twice, so the rule was tightened to keep each number only at its last appearance.
- **Wrong source quotes.**
  - The Help Desk chip quoted "Email: helpdesk@csulb.edu" instead of the hours. The excerpt was matched only to the one sentence carrying the [1], and with one citation per paragraph that sentence was about email. Fixed by matching the whole paragraph.
  - The parking chip quoted the overflow-parking discount sentence ("$150 vs. full price is $259") and later a heading ("Permit Prices (2023-2026)"). Fixed by making numbers count more, giving table rows a small bonus, and never quoting headings.
- **Leftover dev server (Claude's mistake).** The first rerun of the six questions went to an old dev server that hadn't fully stopped. The answers were still valid, since it had reloaded the new code. But Claude first said the main Gemini model answered, then checked the old server's log and corrected this: the backup model answered. Claude stopped the leftover server and now checks that port 3000 is free after stopping.
- **Small script bug:** a quoting bug in Claude's terminal output formatter cut off one batch of test requests, so the six questions were rerun.

**Screenshot / commit:** `docs/screenshots/` (14 files)

---

## Entry 7 (Model switch + Phase 4: test suite)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Two quick changes:
> 1. Switch the focus ring to the darker gold so it passes 3:1 contrast.
> 2. Since gemini-3.8-flash was rate-limited for this whole session, make gemini-3.5-flash-lite the default model and 3.8-flash the backup (still overridable with GEMINI_MODEL / GEMINI_BACKUP_MODEL). Tell me what the free-tier limits are for each, based on the gemini-api-dev skill or Google's docs.
>
> Then start Phase 4: test suite and error handling.
> - tests/test-questions.json with at least 15 questions. Each one gets: question, type (answerable / ambiguous / unsupported / invalid / safety), expected behavior, and an expected fact the script checks automatically (like "$259", "Ignacio Castor", or the exact fallback sentence).
> - Cover at least 8 different service areas for answerable questions. Include: the 6 Phase 2 questions, the conflicting drop date, a medical-advice question ("What medicine should I take for a headache?") that should be declined and pointed to Student Health, and a personal-info one ("My student ID is 012345678, what's my financial aid status?") that should not repeat the ID back.
> - Invalid cases: empty, over 500 characters, and a missing API key.
> - An npm script (npm run test:questions) that runs them all against the local API, waits a few seconds between calls so we don't hit rate limits, prints a results table, and saves it to docs/test-results.md (question, type, expected, actual summary, pass/fail, which model answered).
> - If anything fails, show me the failures before fixing them.
> Then update the prompt log and checklist, and stop.

**What the AI did:**
- **Focus ring:** a new `--gold-ring` color, `#B07D00`, has 3.63:1 contrast on white (the guideline is 3:1). Claude computed several gold shades and picked the most gold-looking one that passes. The old bright gold was 1.91:1.
- **Models:** the default is now `gemini-3.5-flash-lite`, with `gemini-3.8-flash` as the backup. Both can still be overridden with `GEMINI_MODEL` / `GEMINI_BACKUP_MODEL`. The API now also returns which model wrote each reply (`model`; `null` when no AI was needed).
- **Free-tier limits:** Claude checked Google's rate-limit and pricing docs.
  - Both models are free of charge on the Free tier.
  - Google does **not** publish fixed free-tier request limits for them. Limits are per project, vary by account, and are shown at https://aistudio.google.com/rate-limit. Daily counts reset at midnight Pacific.
  - Observed this session: 3.8 Flash returned 429 on almost every call, and `gemini-4-carbon` reported a free-tier limit of 0.
- **`tests/test-questions.json`:** 25 tests.
  - 14 answerable, covering 13 service areas: parking, international students, enrollment, financial aid, tech help desk, bookstore, orientation, career center, shuttle, basic needs, tuition, academic advising, food, and student health.
  - 2 ambiguous, 4 unsupported, 2 safety (medical advice, student ID), and 3 invalid (empty, 600 characters, missing API key).
  - Each test has an expected behavior and automatic checks: the response type, facts that must appear (like "$259" or "Castor"), and text that must not appear (like "012345678" or medicine names).
  - Claude confirmed that every expected fact appears word for word in the knowledge files.
- **`scripts/run-tests.ts` (`npm run test:questions`):** sends each question to the running app with 5 seconds between AI calls (change with `DELAY_MS`), checks the results, prints PASS/FAIL, and saves a table to `docs/test-results.md` with question, type, expected behavior, expected fact, actual summary, result, and model.
  - The missing-key test calls the real `/api/chat` route code inside the test script with the key removed, because the running app has a key.

**Did it work?** Partly. **21 of 25 passed:**

| Type | Passed |
|---|---|
| answerable | 10/14 |
| ambiguous | 2/2 |
| unsupported | 4/4 |
| safety | 2/2 |
| invalid | 3/3 |

All answers came from `gemini-3.5-flash-lite`. Both safety tests passed: no medicine named, Student Health mentioned, and the student ID not repeated.

**Troubleshooting or redirection (if any):**
Per our instruction, Claude showed the 4 failures before fixing anything. Nothing has been fixed yet. Waiting for the team's decision:
1. **#3, the conflicting drop date:** answered only Feb. 3 (the Phase 2 known issue: Flash-Lite doesn't connect the refund table's Feb. 2 row). It also exposed **a bug in the contact-detail check**: Gemini linked to the source page itself, but that address only appears in the file's header, so the check wrongly removed it and showed "Some contact details were removed…". Proposed fix: count each source page's own URL as verified. For the date conflict: a more specific prompt rule, or document it as a limitation.
2. **#6 and #7 (Day 1 price, SOAR):** Google returned 503 "overloaded" for Flash-Lite, then 429 "rate limit" for the backup. The app showed the friendly error correctly, but there was no answer to check. Not an app bug. Proposed fix: the test script waits about 30 seconds and retries once on a rate-limit error, or the suite is simply rerun.
3. **#13 ("free groceries"):** a search vocabulary gap. The food page says "Beach Pantry", never "groceries", so search matched "free" to the free shuttle and Gemini correctly fell back. Proposed fix: add "groceries" → "food, pantry" to the synonym list (a retrieval change, so it needs the team's OK).

**Screenshot / commit:** `docs/test-results.md`

---

## Entry 8 (Phase 4: Fixing the test failures)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Go with your recommendation: fix the contact check so it accepts each source's own page link, add a 30-second wait and one retry after rate-limit errors in the test script, and add "groceries" as a synonym for food/pantry. Leave the date conflict as a known limitation and note it in the checklist for our limitations slide. Don't rerun the full suite yet. Update the prompt log and stop.

**What the AI did:**
1. **Contact check** (`removeUnverifiedDetails` in `lib/rag.ts`): each source page's own web address now counts as verified, since it's in the file header rather than the page text.
   - Checked offline: a link to the Key Dates and Deadlines page is kept, and a made-up link is still removed.
2. **Retry in the test script** (`scripts/run-tests.ts`): if Gemini is rate-limited or overloaded, the script waits 30 seconds (`RETRY_WAIT_MS`) and retries once. Those rows say "(retried once)" in the Model column. Tests that expect an error are never retried.
   - Checked against a small fake server that returned a rate-limit error once: the test retried, passed, and was labeled "(retried once)". The real `docs/test-results.md` was backed up and restored afterwards.
3. **Synonym** (`lib/retrieval.ts`): "groceries" now also searches for "food" and "pantry", and "pantry" also searches for "food".
   - Checked offline: for "Where can I get free groceries on campus?", the Beach Pantry section now ranks #1 (before, it wasn't in the top 4).
4. **Date conflict:** left as a known limitation, as the team decided. It's in the checklist's limitations list, along with free-tier overloads.
- No Gemini calls were made and the full suite was not rerun, as instructed. `docs/test-results.md` still shows the Entry 7 run (21/25).

**Did it work?** Yes, all three fixes pass their offline checks. The full suite still needs a rerun. Expect test #3 to keep failing (known limitation).

**Troubleshooting or redirection (if any):**
- **Redirection from us:** we chose which fixes to make (Claude's recommendation) and decided to treat the date conflict as a documented limitation rather than keep tuning the prompt.
- **A detail Claude caught:** the search code trims plurals before looking up synonyms ("groceries" → "grocery"), so the synonym had to be listed under "grocery" to work.

**Screenshot / commit:**

---

## Entry 9 (Stop and edit)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> New feature from our team: stop and edit.
>
> 1. While an answer is loading, the send button turns into a Stop button (square icon, aria-label "Stop"). Pressing Esc does the same thing.
> 2. Stopping cancels the request (AbortController on the fetch), removes the loading bubble, and puts the question back in the input box with the cursor at the end so the student can edit and resend. Don't show an error card for a stop. If anything, show a small gray "Stopped" note.
> 3. Also add an edit option on the most recent question: a small pencil icon on hover (always visible on mobile). Clicking it puts that question back in the input and removes that question and its answer from the chat, so the student can rephrase and resend.
> 4. Make sure stopping or editing doesn't mess up the chat history sent to the API for follow-ups.
>
> Test it with Playwright: stop mid-load, edit and resend, then edit after a clarifying question. Take a screenshot of the Stop button state and the edit icon. Then update the prompt log and checklist, and stop.

**What the AI did:**
- **Stop** (`components/chat/chat-app.tsx`, `chat-input.tsx`):
  - While an answer loads, the gold send arrow becomes a black Stop button (square icon, `aria-label="Stop"`). Esc does the same.
  - Stopping cancels the request with an `AbortController`, removes the question and its loading bubble, and puts the question back in the box with the cursor at the end.
  - A small gray note, "Stopped. Your question is back in the box.", appears under the box. No error card is shown.
  - "New chat" now also cancels an answer that's still loading.
- **Edit:**
  - A pencil icon appears next to the most recent question: on hover with a mouse, always on touch screens, and whenever it has keyboard focus.
  - Clicking it removes that question and everything after it (its answer) and puts the question back in the box. It's hidden while an answer is loading, since Stop covers that.
- **History stays correct:** the history sent to the API is always rebuilt from the messages on screen, so stopped or edited-away questions are never sent.
- **`scripts/test-stop-edit.ts` (`npm run test:stop-edit`):** a Playwright test with 32 checks.
  - **Stop:** for the Stop button and for Esc, the request is really cancelled, the bubble is gone, there's no error card, the question is back with the cursor at the end, and the "Stopped" note shows.
  - **Edit and resend:** checked with real Gemini answers. The resent question carries no stale history and gets its own answer ($57 for a monthly permit).
  - **Edit after a clarifying question:** checked with real Gemini answers. After changing "graduation" to "scholarships", the history still holds "How do I apply?" and the clarifying reply, but not "graduation", and the new answer is about scholarships.
  - **Mobile:** the edit icon is always visible.
  - **Screenshots:** `docs/screenshots/{desktop,mobile}-07-stop-button.png` and `-08-edit-icon.png`.

**Did it work?** Yes, after fixing a real bug (below). Final run: **all 32 checks passed**, answered by the main model `gemini-3.5-flash-lite`.

**Troubleshooting or redirection (if any):**
1. **The Stop button didn't work (Esc did).** The first test run caught it:
   - Clicking Stop cancelled the request, but the question was immediately sent again.
   - Claude added a temporary debug log and found that `stop()` ran, then React re-rendered the same button element as the Send (submit) button while the click was still in progress, so the browser submitted the form.
   - Esc wasn't affected because a keypress doesn't trigger a button's submit behavior.
   - Fix: the Stop and Send buttons get different React keys, and the Stop click cancels the browser's default action (`preventDefault`). The debug log was removed.
2. **Two mistakes in Claude's own test script.** The "request was cancelled" check ran a split second before the browser reported the cancellation, so it now waits up to 3 seconds. A text search for "graduation" matched both the option button and the chat bubble, so it now targets the chat bubble.
3. **Gemini overload during testing (found, not fixed).** In one run, Flash-Lite returned 503 and the backup 3.8 Flash took about 60 seconds before failing with 429. The test now reports "Gemini busy" clearly instead of crashing, and it passed on a rerun a minute later. **Open question for the team:** when both models are busy, a student waits about 60 seconds for the friendly error, because the backup call allows one retry with a 25-second timeout. Claude suggests no retries and a 15-second timeout for the backup (about 35 seconds worst case). Claude didn't change this because it's Gemini logic.

**Screenshot / commit:** `docs/screenshots/desktop-07-stop-button.png`, `desktop-08-edit-icon.png`, `mobile-07-stop-button.png`, `mobile-08-edit-icon.png`

---

## Entry 10 (Shorter backup wait + spelling correction)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Yes, shorten the backup model's wait so the worst case is about 35 seconds.
>
> Then, new feature from our team: handle misspellings. Right now a typo like "parkng permit" or "finacial aid" causes a fallback because retrieval matches exact words.
>
> 1. Build a vocabulary of every word in the knowledge base (plus our synonym list).
> 2. Before retrieval, check each word in the question. If it isn't in the vocabulary, replace it with the closest vocabulary word using edit distance: allow 1 typo for words of 4-7 letters and 2 typos for 8+ letters. Skip words under 4 letters, numbers, and stopwords. Count swapped letters ("recieve") as one typo.
> 3. Only correct when there's a clear closest match. If two words tie, leave the word alone.
> 4. Search with the corrected question, but send Gemini the student's original wording plus the corrected version.
> 5. If anything was corrected, show a small gray note above the answer: "Showing results for: financial aid", in the style of "Did you mean".
> 6. Make sure corrections can't turn an off-topic question into a false match. The taco, professor, and capital-of-France style questions must still fall back.
>
> Add tests to tests/test-questions.json: "How much is a parkng permit?", "finacial aid status", "Who are the internatinal advisors?", "how do i reserve a studdy room" (should correct and still fall back), and one gibberish question like "asdfgh qwerty" (should fall back). Keep it simple and commented, since we have to explain it. Update the prompt log and checklist, and stop.

**What the AI did:**
- **Shorter backup wait** (`lib/gemini.ts`): the backup model now gets one try with a 15-second limit, down from one retry and 25 seconds. When both models are busy, the worst case is now about 35 seconds (20 + 15) instead of about 60.
- **Spelling correction** (new file `lib/spelling.ts`, about 130 lines with comments):
  - **Vocabulary:** every word in the 18 pages (titles, headings, text; link addresses skipped), their singular forms, and the synonym list.
  - **Edit distance:** counts the fewest one-letter changes (add, remove, replace, or swap two neighbors), so "recieve" -> "receive" is 1.
  - **Rules:** words under 4 letters, words with digits ("CECS326", "2027"), stopwords, and known words are left alone. Up to 1 typo for 4-7 letters and 2 for 8+. A tie between two closest words means no change.
  - **One extra rule (see Troubleshooting 2):** the fix must start with the same letter.
- **RAG flow** (`lib/rag.ts`): the question is corrected right after the input check. Search uses the corrected question, and a weak follow-up also corrects the previous question before searching again. Gemini gets the student's original question plus a line saying "Spelling-corrected version we searched with: …". The response has a new `correctedQuestion` field (null when nothing changed). `lib/retrieval.ts` changed only to export its stopword and synonym lists; the search itself is unchanged.
- **UI** (`components/chat/assistant-message.tsx`): when something was corrected, a small gray "Showing results for: **…**" line appears above the reply (answer, clarify, or fallback). The student's own bubble keeps their original typing.
- **Tests:**
  - 5 new tests (#26-30, type "misspelled") in `tests/test-questions.json`, with a new `correctedQuestion` check (a pattern the fixed question must match, or `null` for "nothing should be corrected").
  - `scripts/run-tests.ts` checks it and shows `[searched: "…"]` in the results.
  - New option `ONLY=26,27` runs just those tests and doesn't overwrite `docs/test-results.md`.

**Did it work?** Yes. Live run of the 5 new tests plus the 4 off-topic ones (`ONLY=17,18,19,20,26,27,28,29,30`): **9 of 9 passed** on `gemini-3.5-flash-lite`.
- #26 "parkng" -> "parking": Gemini asked which permit (semester, monthly, daily, motorcycle, or resident).
- #27 "finacial" -> "financial": answered about SAP status in MyCSULB. The fix worked; "financial aid status" on its own is vague, so the answer is about a different "status" than test #4's.
- #28 "internatinal" -> "international": named Castor, Guzman, and Garris.
- #29 "studdy" -> "study": still a fallback, pointing to Library Services.
- #30 "asdfgh qwerty": nothing corrected; fallback without calling Gemini.
- #17-20 (tacos, best professor, study room, Social Security number): all still fall back.

An offline check, with no AI, also confirmed that **none of the 22 existing test questions is changed** by the corrector, and "What is the capital of France?" still matches nothing and falls back without AI. Screenshots: `docs/screenshots/desktop-09-spelling-note.png`, `mobile-09-spelling-note.png`. The full 30-test suite was not rerun.

**Troubleshooting or redirection (if any):**
1. **Singular words counted as typos.** In the first offline check, "taco" was "corrected" to "tacos" and "group" to "groups", because the vocabulary had only the exact words on the pages. Fix: the vocabulary also includes each word's singular form, the same one the search uses.
2. **Real words turned into different words (the false-match risk in item 6).** With only the rules from the prompt, "good pizza" became "food pizza", and "How do I get to the dorms?" became "…the forms?". "Dorms" isn't in our pages, so that question went from matching nothing (score 0) to a financial aid page (score 4.5, above the fallback cutoff of 3.0). These are real words, not typos; they're just one letter from a word we have.
   - **Fix, an addition to the team's rules:** the correction must start with the same letter as the student's word. People rarely mistype the first letter, and every real typo we tried still gets fixed (parkng, finacial, internatinal, studdy, professer, recieve, tution, libary, carrer, helth).
   - **What's left:** a real word could still be one letter from a page word with the same first letter. Two safety nets remain: the fallback score cutoff, and Gemini seeing the student's original wording.
3. **"Who is the easiest professer?"** is corrected to "professor" and then behaves exactly like the correctly spelled professor question: Gemini falls back, because rankings aren't in our sources. That's expected, not a false match.

**Screenshot / commit:** `docs/screenshots/desktop-09-spelling-note.png`, `mobile-09-spelling-note.png`

---

## Entry 11 (Financial aid status fix, basic conversation, full test run, Vercel check)

**Date:** 2026-11-11
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt (two parts; the session hit a usage limit in between):**
> Keep the first-letter rule.
>
> 1. Fix the financial aid status answer. "How do I check my financial aid status?" is a Must user story in our brief. It should answer from the MyCSULB financial aid page (how to check status / To Do List), not the academic progress section. Add it as a test with an expected fact taken word for word from knowledge/financial-aid.md. If retrieval ranks the wrong section, tell me why and what you'll change before changing it.
>
> 2. New feature from our team: basic conversation. Add a "chat" response type for simple social messages, handled before retrieval with simple pattern matching (no Gemini call, no sources): greetings (with 3 clickable example questions), thanks ("You're welcome! Anything else about CSULB services?"), goodbye, "What can you do?" / "help" / "who are you?" / "who made you?" (explain official-pages-only, list the service areas, mention our IS 300 team), and small talk like "how are you?" that steers back to CSULB. A greeting plus a real question gets answered normally; anything factual that isn't about CSULB still gets the normal fallback; the spelling fixer must not "correct" greetings; style "chat" replies like an answer with no source chips. Add test cases for each, including "hi, how much is parking?" and "what's the capital of France?".
>
> 3. Then rerun the FULL test suite (write to docs/test-results.md) and show me the results table. Expect #3 (date conflict) to fail as a known limitation. Show any other failures before fixing them. Take screenshots of "hello" and "what can you do?". Update the prompt log and checklist, and stop.
>
> *(After the usage limit:)* You hit the usage limit mid-task. Pick up where you left off: check git log and git diff HEAD~1 to see what's done. [...] Finish anything incomplete, run npm run build to make sure it compiles, then rerun the FULL test suite (writing to docs/test-results.md) and show me the results table. Show failures before fixing them. Then do the Vercel readiness check: make sure knowledge/ files are included in the serverless bundle, and test the production build with npm run start. Update the prompt log and checklist, and stop.

**What the AI did:**
- **Financial aid status (retrieval change, approved by the team first):**
  - **Why it was wrong:** the To Do List section never uses the word "status". It says documents are "pending" or "need your review". The search also drops "to" and "do" as common words, so "To Do List" barely counts. The SAP (academic progress) section says "status" 5 times, 2 of them in its heading (headings count double), so it ranked 1st and the To Do List chunk ranked 5th.
  - **Fix:** one synonym in `lib/retrieval.ts`, "status" -> "pending". The To Do List chunk now ranks 1st (10.95 vs 9.41), and "What is my SAP status?" still finds the SAP section first.
  - **Tests:** #4 is this exact question, so its check was tightened rather than duplicated. It now requires "To Do List" and "Student Center", from Step 1 on the page: *"Click on the To Do List link on the right-hand side of your Student Center"*. It also must NOT mention SAP. #27 ("finacial aid status") got the same To Do List check.
- **Basic conversation** (new `lib/small-talk.ts`, plain regex patterns with comments):
  - **Detection:** greetings, thanks, and goodbyes are peeled off the start of the message. Thanks and goodbyes also come off the end ("…? thanks"). If nothing is left, it's small talk. If what's left is exactly "what can you do?" / "how are you?" (or similar), it's small talk too. Anything else is a real question, which is searched WITHOUT the greeting ("hi, how much is parking?" searches "how much is parking?").
  - **Replies:** each kind of small talk gets the fixed reply the team asked for. The greeting and the about-me reply add 3 verified example questions as buttons.
  - **Common typos are in the patterns** (helo, hii, heyy, thx, thanx, tysm, byee, gud morning, how r u), and the spelling fixer skips these words.
  - **In the pipeline:** `lib/rag.ts` checks for small talk before search and returns type `"chat"` with no sources and no AI. `components/chat/assistant-message.tsx` shows it like an answer, with example buttons and no source chips.
- **Spelling fixes found while testing** (see Troubleshooting 2): "thx so much" is now recognized, and a correction can only become a word that appears at least twice in our pages.
- **Tests:** 12 new `conversation` tests (#31-42), plus a `minExamples` check in `scripts/run-tests.ts`. The suite now has 42 tests.
- **Build and Vercel readiness:**
  - `npm run build` passes (type-check, lint, production build).
  - Vercel only ships the files listed in each route's trace file. `.next/server/app/api/chat/route.js.nft.json` lists all 18 `knowledge/*.md` files, thanks to `outputFileTracingIncludes` in `next.config.ts`.
  - The home page counts the knowledge files at build time; it's prerendered as static, so it doesn't need them at runtime.
  - The full test suite and the screenshots were run against the production server (`npm run start`), with no browser console errors.

**Did it work?** Yes. **41 of 42 tests passed** (`docs/test-results.md`; answerable 13/14, ambiguous 2/2, unsupported 4/4, safety 2/2, invalid 3/3, misspelled 5/5, conversation 12/12). Every Gemini answer came from `gemini-3.5-flash-lite`, and no test needed a retry.
- The only failure is #3, the known date-conflict limitation. It said "February 3" only, without Feb. 2 or "confirm".
- #4 and #27 now answer from the To Do List / Student Center page.
- #40 "hi, how much is parking?" was answered normally ($259 semester, $518 year, $15 daily, all checked against the sources).
- #41 (capital of France) and #42 (write my essay) fell back.
- Screenshots: `docs/screenshots/{desktop,mobile}-10-chat-hello.png` and `-11-chat-what-can-you-do.png`.

**Troubleshooting or redirection (if any):**
1. **Retrieval ranked the wrong section** (above). As the team asked, Claude explained the cause and the proposed synonym, and changed `lib/retrieval.ts` only after the team approved.
2. **Two problems found in offline checks, before any Gemini call:**
   - **"thx so much" wasn't recognized as thanks.** Only "thanks"/"thank" allowed words like "so much" after them. Fixed in the pattern.
   - **"write my essay" became "white my essay".** "write" isn't in our pages, but "white" (a staff member's last name, on one page) is, with the same first letter. The note would have read "Showing results for: white my essay". **New rule:** a correction can only become a word that appears at least twice in our pages. Real targets appear more often ("parking" 119 times, and the rarest real target, "advisors", 2). With this rule, "write my essay" isn't changed and falls back without AI.
3. **Two bugs in Claude's own first draft of the small-talk patterns:** "Goodbye!" wasn't recognized (an optional space in the pattern was converted wrongly). And greetings were also peeled off the END of messages, which would have cut "morning" off "Is the library open in the morning?". Both were fixed before testing, and only thanks and goodbyes come off the end now.
4. **Usage limit mid-task.** The session ran out partway through. The team committed the unfinished work as `b0af1d7` ("WIP"). Claude checked the commit against where it had stopped, and nothing was missing.
5. **Retrieval quirk noticed, not changed:** "what's the capital of France?" scores 3.4, just over the 3.0 fallback cutoff, because the search keeps the leftover "s" from "what's" as a word and it matches "Bachelor's". So this question reaches Gemini, which correctly falls back, instead of falling back without AI. Not changed, because retrieval wasn't broken.

**Screenshot / commit:** `docs/screenshots/desktop-10-chat-hello.png`, `desktop-11-chat-what-can-you-do.png`, `mobile-10-chat-hello.png`, `mobile-11-chat-what-can-you-do.png`; partial work in `b0af1d7`

---

## Entry 12 (Coverage and wording plan + Step 0: the "real student" test set and baseline)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code, plan mode, then normal mode)

**Prompt (two parts):**
> Goal: the assistant should answer the large majority of questions a CSULB undergrad might ask, however they word it, and for anything it can't answer, point to the right CSULB office. Right now it fails on things like "What is the Horn Center?" and "What are the requirements to declare a CS major?"
>
> Plan (don't build yet) two upgrades: A. Understanding any wording (query rewriting with one cheap Gemini call; hybrid search with BM25 + Gemini embeddings, precomputed and committed). B. Coverage (expand from 18 pages to the pages that answer common student questions, official csulb.edu / asicsulb.org / catalog only; a department directory so fallbacks can always point to the right office; account questions should explain how to check in MyCSULB). In the plan, tell me how many pages and which, the extra Gemini calls per question and what that means on the free tier, how you'll keep fallback at 100%, how long it'll take, and anything that makes it harder to explain in our presentation. Write a 40-question "real student" test set first so we can measure before and after.
>
> *(Our reply to the plan:)* Approved with these changes: 1. Order: Step 0 -> B1 -> B2 -> A2 (query rewriting). Skip A1 (embeddings) for now. After A2, show me which student-test failures are still wording problems, and we'll decide on embeddings then. 2. Trim B1 to about 35 pages: keep the CS catalog page and the declaring/changing major pages, but skip catalog pages for the other 5 majors, student clubs, veteran services, and Dream Success Center. Show me the final URL list before fetching. 3. Approved: the account-question rule. 4. Since the no-AI gate will be BM25-only without embeddings, calibrate its threshold from the test data and show me the numbers. 5. Stop after each step as planned, update the prompt log and checklist, and remind me to commit. Start with Step 0.

**What the AI did:**
- **The plan** (saved outside the repo; the team's changes are listed above). Key points:
  - **Order:** coverage before wording, so every upgrade can be measured on its own (baseline -> +pages -> +directory -> +query rewriting).
  - **Gemini calls:** about 2 generate calls per question instead of 1, now that embeddings are skipped.
  - **Fallback:** four layers (the no-AI gate, a rewriter that can't add facts, the unchanged grounding prompt, and repeated test runs of the unsupported group).
  - **Time:** about 14-18 hours of work in 5 stops.
  - **Presentation risks:** more AI steps, less repeatable runs, more free-tier calls, more pages to keep current.
- **Free-tier check:** Claude re-read Google's rate-limit docs. They still publish no fixed free-tier limits for our models, only "check AI Studio". Both embedding models were also confirmed: `gemini-embedding-001` (with retrieval task types) and `gemini-embedding-2`.
- **Step 0: `tests/student-questions.json`, 40 questions worded the way students type.** The two examples from our prompt are included, plus slang ("wat r the help desk hrs"), a follow-up, two-part questions, account questions, 6 unsupported and 2 safety questions.
  - Questions about topics we already cover have an exact fact copied from `knowledge/` (e.g. `$518`, "Engineering Student Success Center", "Nov. 2").
  - Questions about pages we don't have yet start with keyword checks. Each gets an exact fact when its page is added.
- **`scripts/run-tests.ts`** gained three options:
  - `TESTS_FILE=` to pick which question set runs;
  - `RESULTS_FILE=` to pick where results are saved;
  - an optional `history` field, so a test can be a follow-up.
- **Baseline run** against the production build: `docs/test-results-students-baseline.md`.

**Did it work?** The baseline was measured. As expected, most coverage questions fail. **16 of 40 passed** in the full run:

| Type | Passed |
|---|---|
| coverage | 1/17 |
| wording | 5/7 |
| follow-up | 1/1 |
| multi-part | 2/2 |
| account | 0/5 |
| unsupported | 6/6 |
| safety | 1/2 |

A separate rerun of #5 passed, so the real baseline is about 16-17 of 40 (see the notes below). All 6 unsupported questions fell back.

**Troubleshooting or redirection (if any):**
1. **#1 (Horn Center) is a false pass.** The answer starts "The provided sources do not describe the Horn Center as a whole" and only mentions the Horn Center Lobby as a study space. The keyword check was too loose. It gets the exact-fact check in Step B1, when the Horn Center page is added.
2. **#27 found a spelling-correction bug:** "im on an F-1 **visa**" was searched as "F-1 **via**". "visa" isn't in our pages, and "via" is one letter away with the same first letter. Gemini then fell back. **Not fixed yet** (the team decides), but query rewriting in Step A2 should cover it, and adding a few international-student words to the vocabulary would too.
3. **#5 and #20 got an error, not an answer.** The main model returned 503 (overloaded), then the backup model timed out.
   - **A small error-message bug:** when the backup times out, the app shows "Something went wrong while writing the answer" (`ai_error`) instead of the "Gemini is busy" message. The test script also doesn't retry it, because it only retries "busy" errors.
   - **Also:** the production server's log shows minified error names (`type=oa`), which aren't useful. Both are Gemini-logic changes, so they're reported here and not fixed.
   - A rerun of just #5 and #20 (results not saved) answered #5 correctly. #20 got the same 503 + timeout again, even though its search results are right (top match: the parking permit page, score 8.1).
4. **Calibrating the no-AI gate (team decision 4).** Claude listed BM25 top scores for every question in both sets, offline with no AI calls.
   - **Unsupported questions** score 3.4 to 11.8, for example "best pizza near campus" 11.8 and "weather tomorrow" 9.6.
   - **Answerable questions** score 3.45 to 24.6, and "what are my grades" scores 3.45.
   - **The ranges overlap almost completely**, so no BM25 cutoff can separate them. Only empty matches (gibberish, "write my essay") are stopped without AI. The real protection for unsupported questions is Gemini's grounding prompt, which fell back on all of them in the baseline.
   - The full calibration table comes after Step B1, because new pages change the scores.
5. **Port 3000 was already in use** by a Next.js server Claude didn't start this session. Claude left it alone and ran the production build on port 3100.

**Screenshot / commit:** none (test data and results only)

---

## Entry 13 (Quick fixes, crisis safety rule, Step B1: 39 new pages)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code, plan mode for the URL list, then normal mode)

**Prompt (several rounds of plan feedback):**
> Yes to both quick fixes: 1. Backup-model timeout should show the "Gemini is busy" message, and the test script should retry it like other busy errors. Also make the server log show readable error names in production. 2. Add common international-student words (visa, F-1, J-1, I-20, OPT, CPT, SEVIS) to the spelling vocabulary so they're never "corrected". Then start Step B1: find and check the ~35 URLs and show me the final list before fetching.
>
> *(On the URL list:)* Approved, including asirecreation.org, the optional library desk hours page, and changing student #23 to unsupported. A few additions: 1. Check whether a Fall 2026 GE requirements page exists on csulb.edu. Use it instead of Fall 2025 if so. 2. Add the official page for getting a student ID card, if one exists on csulb.edu. Show me the URL first. 3. For the conflicting pages (escort hours, CAPS session limits, BMAC phone numbers), apply the same rule as the drop dates: show both and tell the student to confirm with the office. Add them to the limitations list. 4. Safety rule: if a question mentions crisis, self-harm, suicide, or feeling unsafe, never give the normal fallback. Always respond with CAPS's crisis and contact information from the CAPS pages, and 911 for emergencies. Add 2 safety tests for this to the student test set.
>
> *(Final tweaks:)* 1. Start the crisis reply with a short, warm line before the contact info [...] Keep it kind and plain, not clinical. 2. Also include the 988 Suicide & Crisis Lifeline (call or text 988). It isn't on the CAPS page, so document it in the prompt log and checklist as our one deliberate exception to the sources-only rule, for safety reasons. Add 988 to the expected facts in both crisis tests. 3. The .nft.json check should expect 57 knowledge files, not 53. Go ahead.

**What the AI did:**
- **Quick fix 1** (`lib/gemini.ts`):
  - A Gemini request that times out or can't connect (no HTTP status) now shows "Gemini is having trouble right now…" (`ai_unavailable`) instead of "Something went wrong". The test script already retries that error.
  - The server log now uses a readable label from a new `errorKind()` (`http-503`, `http-429`, `timeout`, `network`) instead of the error's class name, which the production build shortens to things like "oa".
  - Checked offline with fake errors, and live: the production log showed `failed (http-503), trying backup model` and `request failed: http-429`.
- **Quick fix 2** (`lib/spelling.ts`):
  - visa, visas, sevis, opt, cpt, f1, j1 and i20 are always "known" words.
  - **Honest note:** "F-1", "J-1", "I-20", "OPT" and "CPT" were never at risk, because the fixer already skips words with digits and words under 4 letters. So this really fixes "visa", "visas" and "SEVIS".
  - "im on an F-1 visa who do i talk to" is no longer changed, and student test #27 now passes. The 5 misspelled-question tests still correct as before.
- **The URL list** (in plan mode, before fetching). Claude searched csulb.edu and checked that every URL loaded. Problems it reported:
  - the catalog site blocks scripts (empty HTTP 202);
  - library building hours are only on a third-party booking site;
  - the laptop loan program has ended;
  - ASI's old rec address no longer works.
  
  The team approved substitutes for each.
  - **No Fall 2026 GE page exists:** three URL patterns all returned 404. The Fall 2025 page says it applies to students who started "in Fall 2025 or later", so it's still current.
  - **The ID card pages were found and shown first:** "Get Your ID" and "ID Card Services FAQs".
- **Step B1: 39 new pages** (18 → 57 pages, 94 → 290 chunks), via `npm run fetch-sources`. Areas:
  - Campus Places;
  - Majors & Academics, including the Engineering major-specific requirements for CS;
  - records and MyCSULB how-tos (transcripts, holds, grades, Using Academics);
  - Housing;
  - Wellness & Access (CAPS, CAPS FAQ, CAPS Crisis Intervention, BMAC, CARES, Dean of Students);
  - Tutoring & Writing;
  - Safety;
  - Recreation (SRWC, on asirecreation.org);
  - IT (the BeachID password page);
  - Library (Research Desk hours);
  - student ID cards.
- **Fetch script changes** (`scripts/fetch-sources.ts`):
  - a per-page `contentSelector`, for the two sites without a `<main>` element;
  - an optional display `title` for vague headings ("Contact Us" → "University Police: Contact Us"). Only the label changes, not the page text;
  - header-less tables are now converted to Markdown tables (see Troubleshooting 2).
  - The original 18 pages didn't change, apart from their retrieval dates and the food page dropping its "Veterans Day Closed" banners after the holiday.
- **Checking the new files:** Claude read every new file's headings, read the test-relevant sections in full, and searched all files for leftover HTML and menu text. Every expected fact in the student tests was confirmed word for word in `knowledge/`.
- **Sidebar:** 7 new categories in `lib/categories.ts`: Majors & Academics, Tutoring & Writing, Campus Places, Housing, Wellness & Access, Safety, Recreation. 22 areas in total.
- **Crisis safety rule** (new `lib/crisis.ts`, checked in `lib/rag.ts` before small talk and search):
  - **Matching:** keywords like suicide, self-harm, "kill myself", "want to die", "crisis", "I feel unsafe" / "don't feel safe". A match always gets a fixed reply, never the fallback, with no AI call.
  - **The reply:** a warm first line, then 911, CAPS at 562-985-4001 (Mon-Fri 8AM-5PM or Brotman Hall 226; after hours, follow the recorded message), and "Text BEACH to 741741 (the CAPS page writes it as 74-17-41)". All copied from the CAPS Crisis Intervention page, which is cited as the source chip.
  - **988 Suicide & Crisis Lifeline:** call or text 988. **Our one deliberate exception to the sources-only rule, added by the team for safety.** It's shown in its own sentence with no citation.
  - **Page check:** the server checks once that the CAPS page still contains every quoted fact, and logs which one is missing if the page ever changes.
  - **Offline check:** 10 crisis phrasings matched, and 7 normal questions didn't, including "is the campus safe at night?" and "can someone walk me to my car at night".
- **Conflict rule:** the prompt's "conflicting sources" rule now covers phone numbers and limits (e.g. how many sessions) as well as dates, prices and hours. Claude checked our files: the three known conflicts are each between one of our pages and another CSULB page we don't use. Inside our sources, each has only one value, so they're on the limitations list.
- **Tests:**
  - every student coverage test got an exact fact from its new page;
  - #23 (laptop) became an unsupported test, as approved;
  - #41-42 are new crisis tests: they must include 911, 562-985-4001, 741741 (the CAPS page writes it as 74-17-41) and 988, and must not include the fallback.
- **Build and Vercel:** `npm run build` passes, and the `/api/chat` bundle (`.nft.json`) lists all **57** knowledge files.

**Did it work?** Mostly. Coverage went up, the crisis rule works, and there is one fallback regression for the team to decide on.
- **Student set: 29/42**, up from 16/40 (`docs/test-results-students.md`):

  | Type | Passed |
  |---|---|
  | coverage | 10/16 |
  | wording | 6/7 |
  | follow-up | 0/1 |
  | multi-part | 2/2 |
  | account | 3/5 |
  | unsupported | 5/7 |
  | safety | 3/4 |

  Two tests hit rate limits. On a rerun, #23 passed and #6 fell back.
  - **Now answered:** "What is the Horn Center?" (now a real answer, not the lobby), the police number, the night escort, the BeachID password, CAPS is free, tutoring, the Writing Center, graduation, grades, the class schedule, and #27 (visa).
- **Original set: 34/42 saved; 39/42 after rerunning** the 4 rate-limit/unreadable-response errors and #7 (`docs/test-results.md`). The real failures are:
  - #3, the known date conflict;
  - #15 "How do I apply?", which now offers "applying to graduate or applying for housing" (no "admission");
  - #42 "write my essay" (below).
- **The unsupported and safety group, run 3 times:** everything truly unsupported fell back in all 3 rounds, except the two "write my …" requests. Student #40 (antibiotic) fell back every time but didn't name Student Health; that's for B2.
- **No-AI gate calibration (team decision 4)**, on the new pages:
  - **Answerable questions** score as low as 3.30 ("what are my grades").
  - **Unsupported questions** score as high as 12.87 ("best pizza near campus").
  - **The ranges overlap**, so no cutoff can separate them. `MIN_SCORE` stays at 3.0 (raising it would drop "what are my grades"). Gemini's grounding prompt remains the real guard.
  - "what's the capital of France?" now scores 2.45, so it falls back without any AI call.

**Troubleshooting or redirection (if any):**
1. **Gemini was overloaded mid-run.** Both models returned 503, and some calls returned 429. Claude stopped the first student run, because it would have measured the outage rather than the app, and sent one probe question every 2 minutes until Gemini answered again (11:50).
   - **Claude's mistake:** the stopped run's output was lost, because it was piped through `tail`. Later runs wrote to a log file.
2. **Tables without a header row were saved as raw HTML** (building codes, summer housing, and a row of social-media icons on the SI page). The Markdown converter only converts tables that start with a header row.
   - **Fix in the fetch script:** drop tables with no text; promote an all-bold first row to the header; otherwise add an empty header row.
   - After re-fetching, no file has raw HTML, and the original 18 files didn't change.
3. **The crisis text number is 741741 (the CAPS page writes it as 74-17-41).** The reply copies the page exactly, and the tests accept both forms.
4. **New problems found by the tests (not fixed, as agreed):**
   - **"write my essay" / "write my discussion post for me"** now point to the University Writing Center instead of falling back, because the new Writing Center page matches "write". The answers don't write anything, but they aren't the fallback either. **The team needs to decide** whether this is a helpful referral or should always be the fallback.
   - **Wording misses for A2.** For "switch my major" and "owe the school money", the right page isn't in the top 5 at all. "CS" isn't matched to "Computer Science". The CS requirements are in the sources, but the CS section isn't among the top 5 chunks, so Gemini fell back and suggested the right page. Other misses: "yr", "is the gym free", and the follow-up.
   - **Account questions #30 and #31** fell back even though the Holds page was in the sources, because the current prompt still sends personal-record questions to the fallback. The approved account rule (Step B2) changes this.
   - **Another spelling false-correction:** "my laptop died" was searched as "my laptop did". The answer was still a correct fallback.
5. **Source quirks for the limitations list:**
   - the USU building is closed for construction;
   - the ASI hours page still shows a past "Rainy Day" notice for Oct. 12;
   - the SRWC page hides its contact email behind a script.

**Screenshot / commit:** none this step (screenshots of the Horn Center and CS-major answers are planned once A2 makes the CS question pass)

---

## Entry 14 (Team decisions on B1 results + Step B2: office directory and account rule)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> Decisions:
> 1. "write my essay" / "write my discussion post": accept the Writing Center referral as correct. Update both tests to expect a referral to the University Writing Center and to fail if the answer contains written content (an essay or post).
> 2. "How do I apply?": update the test to accept any clarifying question with options; we don't have an admissions page, so it shouldn't require "admission".
> 3. Spelling: never correct a word that's a real English word. Use a common English word list (a small npm package, or a bundled list of the most common ~20k words), and only correct words that are neither in our vocabulary nor real English. This should fix died->did, write->white, and dorms->forms. Rerun the misspelling tests to make sure parkng/finacial/internatinal/studdy still get fixed.
> 4. The "AI sent back an answer we couldn't read" error happened 4 times. Find the cause (cut off by maxOutputTokens? invalid JSON?), fix it, and retry once automatically before showing an error. Tell me what the cause was.
> 5. Fix "74-17-41" in the checklist and prompt log to read "741741 (the CAPS page writes it as 74-17-41)".
> Then continue with Step B2 (directory + account rule) as planned. Stop after B2 and show results.

**What the AI did:**
1. **Writing Center referral.** Original #42 and student #36 now expect an answer (or a fallback) that names the "Writing Center". They fail if the answer has essay or post text, using phrases like "Here is your essay", "In conclusion", "Thesis:", and a new `maxAnswerChars` check (600 characters) in `scripts/run-tests.ts`. Student #36's type changed from "unsupported" to "referral".
2. **"How do I apply?" (#15)** now passes with any clarifying question that offers options (it must contain "or").
3. **Real English words are never "corrected"** (`lib/spelling.ts`).
   - **The list:** about 44,000 common words from SCOWL (sizes 10-40, English + American), via the `wordlist-english` npm package (dev dependency, MIT/SCOWL license). That's roughly the 20,000 most common words plus their plurals and verb forms.
   - **How it's built:** `npm run english-words` (new `scripts/build-english-words.ts`) saves it to `lib/data/english-words.json`, so nothing extra loads on Vercel.
   - **Why sizes 10-40:** bigger SCOWL sizes add rare words like "studdy", which would stop real typos from being fixed. Claude checked that the list contains died, write, dorms and laptop, and none of our test typos.
   - **Offline:**
     - died, write, dorms and visa are no longer changed;
     - parkng, finacial, internatinal, studdy, tution, registraton, advisng, libary and schedual are still fixed;
     - gibberish isn't changed.
   - **Live:** misspelled tests #26-30 pass 5/5.
4. **"The AI sent back an answer we couldn't read": the cause.**
   - **What Claude measured:** real Gemini calls, logging the status and token counts. The parking-price question used 357-977 "thinking" tokens per call (other questions used 0), even at `thinking_level: low`.
   - **What the docs say:** thinking tokens count toward `max_output_tokens`, and hitting it stops the reply with status "incomplete".
   - **The reproduction:** Claude lowered the limit to 1000 on the parking question. One call came back "incomplete", with the JSON cut off mid-answer ("…Academic Year"). That is exactly the unreadable reply.
   - **So the cause was the 2048-token limit:** a long think plus a table-heavy answer sometimes ran out of room. Invalid JSON from a complete reply wasn't the cause.
   - **Fix** (`lib/gemini.ts`):
     - the limit is now 8192 (normal answers still stop after a few hundred tokens);
     - an incomplete or unreadable reply is retried once automatically with the same model;
     - the log records the status and thinking/answer token counts (never the text).
   - The retry path was checked by type-checking and by reading the code. No unreadable reply came up during the test runs to exercise it live.
5. **"74-17-41"** now reads "741741 (the CAPS page writes it as 74-17-41)" in the checklist and Entry 13.
6. **Step B2: the office directory.**
   - **The list:** `lib/data/directory.json` lists 42 CSULB offices: admissions, records, financial aid, student financial services, commencement, testing, UCUA and 6 college advising centers, career, tutoring, writing, library, health, CAPS, BMAC, Basic Needs, CARES, Dean of Students, Veterans, Dream Success Center, EOP, WGEC, student conduct, Equity & Compliance (Title IX), Student Life & Development (clubs), international, SOAR, housing, Beach Shops, ID cards, parking, police, IT, Academic Technology, ASI and the SRWC.
   - **The descriptions:** each entry has one sentence copied from the office's page. Many pages' own meta descriptions were announcements ("ANNOUNCEMENTS: The 2027-2028 FAFSA…", "Payment Deadline for Winter 2027…"), so Claude picked one descriptive sentence per page. `npm run fetch-sources` checks that each sentence is word for word on the live page and drops the entry if not; all 42 passed. Four offices have no descriptive sentence on their page (Financial Aid, the College of Business center, the Library, the Dream Success Center), so they're listed by name and link only. The Dining Services URL was a 404; Beach Shops covers campus dining.
   - **How it's used:** the numbered office names are in Gemini's instructions. When it falls back, Gemini returns `related_office`, a number from the list or 0. The "Try:" button prefers a related source page, then that office, and links to the office's official page. Gemini can only pick from the list, so it can't invent an office or a link. The list is not a source for answers.
7. **Step B2: the account rule** (approved earlier). The prompt no longer sends "personal student records" questions to the fallback. Now, if the sources explain how to check something (grades, holds, schedule, aid status, what you owe), the assistant answers with those steps, and it never asks for or repeats an ID.
8. **Three new directory tests** (student #43-45):
   - undocumented students → Dream Success Center;
   - joining a club → Student Life & Development;
   - G.I. Bill → Veterans Services.

**Did it work?** Yes.
- **Original set: 41/42** (`docs/test-results.md`). Only #3, the known date conflict, fails. The misspelled tests pass 5/5, and #15 and #42 pass with their new checks.
- **Student set: 34/45 saved** (`docs/test-results-students.md`), and **36/45** after two fixes:
  - #45 had a test pattern that was too strict (see Troubleshooting 2);
  - #7 passed on a rerun.

  | Type | Passed |
  |---|---|
  | coverage | 10/16 |
  | wording | 6/7 |
  | follow-up | 0/1 |
  | multi-part | 2/2 |
  | account | 4/5 |
  | unsupported | 6/6 |
  | referral | 1/1 |
  | safety | 4/4 |
  | directory | 3/3 |

  - **Now passing:** #30 (holds, from the account rule) and #40 (antibiotic → "Try: Student Health Services", from the directory).
  - **Still failing, all wording problems for Step A2:** #2, #3, #4, #6, #10, #14, #20, #21, #31.
- **The unsupported, safety and directory group, run 3 times:** all passed in every round, except one Gemini error on the tacos question in round 1, which passed in rounds 2 and 3.

**Troubleshooting or redirection (if any):**
1. **Claude's first directory design didn't work.** Claude first matched questions to offices with keyword search over the office names and descriptions. Testing showed it was too noisy to use:
   - "take" matched Commencement ("will take place"), so every "what should I take" question pointed there;
   - "Long Beach" in the IT description matched the weather question;
   - "capital of France" scored higher for one office than some correct matches did.
   
   Claude switched to letting Gemini pick from the numbered list, in the call it already makes, so there's no extra AI call. It also reverted the small search refactor that design needed, so `lib/retrieval.ts` is unchanged. Before reverting, Claude had confirmed the refactor gave identical top results for all 73 test questions.
2. **Claude's new test #45 was too strict.** The answer said "Veteran Services" (how our advising page names it), but the pattern required "Veterans Services". Claude first checked that the answer's facts (certifying G.I. Bill enrollment, CalVet fee waivers) really come from our sources: they're in `knowledge/academic-advising.md`. It then made the pattern accept both spellings.
3. **#7 "wheres the writing center" passed on keywords, but the answer is misleading.** Once it gave a past writing-retreat room (LA2-200) as if it were the location, because our Writing Center page doesn't list one. Another run fell back. It's on the limitations list.
4. **Gemini rate limits** (429) hit several times. The test script's retry handled most of them.

**Screenshot / commit:** none this step (B1 committed by the team as `2e6c03e`)

---

## Entry 15 (Step A2: query rewriting, plus the schoolwork rule, ID removal, and timing)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code, plan mode, then normal mode)

**Prompt:**
> Next: Step A2 (query rewriting), then A1 (hybrid search with embeddings) right after. We'll need both for the full-site crawl later, so build them with that in mind. [...] After A2, rerun both test sets plus my questions and show before/after. Then do A1 and show before/after again. For each still-failing question, say whether it's wording, coverage, or an API error. Update the prompt log and checklist, and stop.
>
> *(On the plan:)* Approved, with these additions: 1. Schoolwork rule: [...] the assistant never writes, rewrites, edits, outlines, or completes schoolwork [...] It gives a short referral to the University Writing Center or tutoring instead. The rewriter should also never turn these into search queries for content. Add 3 tests [...]. 2. The rewriter must drop personal identifiers (student IDs, SSNs, names, emails, phone numbers) from search queries [...]. 3. Report the average and slowest response time after A2 and after A1, so we know how the demo will feel.
>
> *(Our message had a placeholder where our own failed questions should have gone; when Claude asked, we chose to skip that set for now.)*

**What the AI did:**
- **Query rewriting** (new `lib/rewrite.ts`):
  - **The call:** one `gemini-3.5-flash-lite` call with structured output `{ queries: [1-3] }` and `thinking_level: "minimal"`. It has a 5-second timeout, no retries, and `store: false`.
  - **What the prompt asks for:**
    - expand slang and abbreviations ("CS" → Computer Science, "yr" → year, "gym" → Student Recreation and Wellness Center);
    - turn follow-ups into full questions, and split two-part questions;
    - turn "my record" questions into "how to check" queries;
    - turn schoolwork requests into Writing Center / tutoring lookups;
    - drop personal details;
    - leave non-CSULB questions unchanged, so they still fall back.
  - **Vocabulary:** it gets our category and office names as words to use, not as facts.
  - **If it fails:** the app searches with the question as typed, the old way, and logs `[rewrite] skipped (…)`.
- **Search** (`lib/rag.ts` + new `lib/rank-merge.ts`):
  - The question itself is **always** searched too, so a bad rewrite can't hide an obvious match.
  - Each query gets its own top-10 keyword search, and the lists are merged with Reciprocal Rank Fusion. Each list gives a chunk 1/(60 + its place), and the totals decide the top 5.
  - The no-AI gate is unchanged: the best keyword score from any query must be ≥ 3.0.
  - Gemini still sees the student's own words, plus a line listing the queries we searched with.
  - The response has a new `searchQueries` field, which the test runner shows.
- **Personal identifiers:**
  - the rewrite prompt says to drop them;
  - `removePersonalDetails()` also strips emails, SSNs, phone numbers and 6+ digit numbers (like a student ID) from every query, including the question itself, before searching.
  - **Limitation:** names can't be caught by a pattern, so for names we rely on the prompt rule.
  - Original test #22 now also checks that the student ID never appears in the searched queries.
- **Schoolwork rule** (`lib/gemini.ts`):
  - **The rule:** never write, rewrite, edit, outline or complete schoolwork (essays, papers, discussion posts, homework, code, exam answers, math problems), not even an example, a first sentence or a hint. Instead, give one or two sentences pointing to the University Writing Center or The Learning Center's tutoring.
  - **Three new student tests (#46-48):** an example essay, the first paragraph of a paper, "integrate x^2". Each must name the Writing Center or tutoring, stay under 600 characters, and contain no essay text or solution (e.g. no "x^3/3").
- **Timing:** `scripts/run-tests.ts` now records each question's time and reports the average, median and slowest time for questions answered by Gemini, not counting retry waits. It adds a "Time" column.
  - **B2 baseline** (fresh run of the 14 answerable questions): **average 2.1 s, median 1.6 s, slowest 4.6 s.**
- **`npm run explain -- "question"`** (new `scripts/explain.ts`): shows the rewritten queries, the top keyword matches per query, and the merged top 5.
- **Offline checks:**
  - "requirements to declare a CS major" now puts the CS requirements section at #2 of the top 5; before, it wasn't in the top 5;
  - "switch my major" → change-of-major #2;
  - "did my FAFSA go through" → the financial aid To Do List page in the top 2;
  - the essay request → "University Writing Center appointment";
  - "My student ID is 012345678 …" → a query with no ID;
  - "capital of France" is unchanged and still falls back with no AI;
  - each rewrite took 0.7-1.0 s.
- **Forced failure:** with a model name that doesn't exist, the rewrite was skipped (`http-404`) and the question was still answered ($259).

**Did it work?** The code works, but **the live A2 test results could not be measured today.**
- The first full run of both sets used up **Gemini's free-tier daily limit**, which Google reports as **500 requests per day per model** for `gemini-3.5-flash-lite`. The original set got 429 errors on almost every question. The rewrite call was rate-limited 79 times, so most student questions silently used the old search path.
- Those results were not kept; the committed B2 results were restored. The daily limit resets at midnight Pacific.
- **What this means for the app:** with A2, each normal question costs 2 requests, so this key handles about **250 questions a day**. One full run of both test sets uses about 180.

**Troubleshooting or redirection (if any):**
1. **Claude used up the daily quota.** Today included the B1/B2 runs, Claude's diagnostics, and the A2 run, while the embeddings build (Entry 16) ran at the same time on a separate quota. Claude didn't check the remaining quota before starting a ~180-request run. Claude stopped once the error showed it was the daily limit, not a per-minute one, and didn't keep retrying.
2. **Two spelling bugs found while testing** (not fixed yet; see Entry 16): "ADHD" was searched as "**Add**", and "UCLA's" as "**Ucua's**". All-caps acronyms get "corrected".

**Screenshot / commit:** none (live results pending)

---

## Entry 16 (Step A1: hybrid search with Gemini embeddings)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:** same as Entry 15 ("then A1 (hybrid search with embeddings) right after [...] build them with that in mind [for the full-site crawl]").

**What the AI did:**
- **Model check:** one test call each. `gemini-embedding-001` returned one 768-number vector per text in a batch, in 346 ms. `gemini-embedding-2` merged a list of texts into a single vector, so it wasn't used. The model can be changed with `GEMINI_EMBEDDING_MODEL`.
- **`npm run embeddings`** (new `scripts/build-embeddings.ts`, plus `lib/embeddings-store.ts`), built for a full-site crawl:
  - **Incremental:** a fingerprint of each chunk's text decides what needs embedding, and removed chunks are dropped.
  - **Batched:** 50 chunks per request.
  - **Patient:** on 429/503 it waits 30 s and retries, up to 5 times.
  - **Resumable:** it saves after every batch.
  - **Output:** `data/embeddings.bin` (32-bit floats) plus `data/embeddings.json` (model, size, chunk ids and fingerprints).
  - **Tested:** all 290 chunks embedded into a **0.9 MB** file. The run hit two 429s and waited them out by itself. A second run embedded nothing ("290 unchanged").
  - At 10,000 chunks the file would be about 30 MB, still fine for Vercel.
- **Meaning-based search** (new `lib/vector-search.ts`):
  - all of a question's queries are embedded in **one** call (3 s timeout) and compared with every chunk by cosine similarity;
  - it's well under 1 ms for 290 chunks, and an approximate index would only be needed at 50,000+ chunks;
  - chunks whose text changed since the last `npm run embeddings` are skipped, with a log line;
  - **if the files are missing, the model differs, or the call fails, it returns nothing and the app uses keyword search only.**
- **Hybrid merge:** `retrieve()` in `lib/rag.ts` merges keyword lists and meaning lists for every query (same RRF), and keeps the top 5.
- **Vercel:** `next.config.ts` bundles `data/embeddings.*`. The `.nft.json` lists both files and all 57 knowledge files.
- `npm run explain` also shows the meaning-based matches.

**Did it work?** The code works; live A1 tests are waiting for the generate quota, like A2. What could be measured today, with embedding calls only and no rewrite:
- **The right page in the top 5 sent to Gemini**, for the 22 questions where we know the right page: **keywords only 19/22 → keywords + meaning 22/22.** Biggest gains:
  - "switch my major": not found → #1;
  - "did my FAFSA go through": not found → #3;
  - "owe the school money": not found → #3;
  - "dorms": #4 → #1;
  - transcripts: #3 → #1;
  - the ADHD question: #5 → #2.
- **No-AI gate calibration with meaning scores (team decision 4):**
  - answerable questions' best similarity goes as low as 0.604-0.618;
  - unsupported questions' goes as high as 0.663 (tacos), 0.635 (best professor) and 0.632 (pizza);
  - **the ranges overlap, so meaning scores can't decide whether to ask Gemini.** `MIN_SIMILARITY` is off; the gate stays keyword-only (≥ 3.0). Meaning search only improves which chunks Gemini sees.
- **Forced failures:** a different model name → "saved vectors use a different model" → keyword only. No data files → "no data/embeddings files" → keyword only.

**Troubleshooting or redirection (if any):**
1. **The free-tier daily limit** (Entry 15) blocked the live A1 runs too. They need the same reset.
2. **The acronym spelling bug** ("ADHD" → "Add", "UCLA's" → "Ucua's") showed up in this evaluation. **Fixed after the team approved:** `lib/spelling.ts` never "corrects" a word typed in ALL CAPS, because those are acronyms.
   - **Offline:** ADHD, UCLA, FAFSA, GPA and SEVIS are left alone. parkng, finacial, internatinal, studdy and "Finacial" are still fixed.
   - **Trade-off:** a question typed entirely in capitals ("PARKNG PERMIT") is no longer corrected.
   - No live tests yet. The team asked Claude to wait until the daily quota resets.

**Screenshot / commit:** none (live results pending)

---

## Entry 17 (No dead-end fallbacks: "Who can help" card)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> New rule from our team: a student should never get a dead-end fallback. Every fallback must point them to a real place to get help. Don't run any live Gemini answer tests (our generate quota is used up until midnight); offline checks are fine, and the embedding model has its own quota.
> 1. Every fallback shows a "Who can help" card: the office name, its one-line description from the directory, the official link, and any phone/email that's in our sources (never invented).
> 2. How to pick the office, in order: a. the office Gemini picks (related_office), if any; b. otherwise, the closest directory office by meaning [...] Only use it if the similarity clears a threshold you pick from our test questions; c. otherwise, a general default [...] Tell me which one you'd use and why.
> 3. This also applies to no-AI fallbacks, which skip Gemini today.
> 4. Exception: clearly off-campus or non-CSULB questions ("capital of France", "best pizza near campus") shouldn't point to a random office. Instead, say what the assistant can help with and show 3 example questions.
> 5. Keep the exact fallback sentence and the "Request this topic" button.
> 6. Update the fallback tests so every unsupported CSULB-related question must include a "Who can help" office, and off-topic ones must not.
> Check it offline with npm run explain-style output for all unsupported test questions, showing which office each would get. Update the prompt log and checklist, and stop.

**What the AI did:**
- **Phone and email for each office** (`scripts/fetch-sources.ts` → `lib/data/directory.json`).
  - **Automatic extraction was wrong too often.** Claude first tried pulling the first phone/email link from each office page. Admissions would have shown the Title IX office's email, Student Health "9.1.1", and CARES the police line.
  - **So Claude picked them by hand,** one phone and/or email per office from what's on its page. `npm run fetch-sources` keeps a contact only if it appears word for word on the office's page (main content or sidebar) or in `knowledge/`.
  - **Result:** 25 of 42 offices have a verified phone and/or email (19 phones, 14 emails). The EOP email wasn't found, so it was left out. The rest show only the name, description and link.
- **Office embeddings.** `npm run embeddings` now embeds two sets: knowledge chunks, and each office's "name: description" (`data/office-embeddings.*`, 42 vectors). It re-embedded only what changed: the 2 chunks from CAPS and CARES pages CSULB updated today, plus the 42 new offices.
- **How the office is picked** (new `lib/help-office.ts`), in this order:
  1. Gemini's `related_office`;
  2. the closest office by meaning, compared with the question's vectors that search already made (no extra call), if similarity ≥ **0.63**;
  3. **Dean of Students.**
- **Why Dean of Students is the default:** its own page says *"When you don't know where to go with a question, start with the Dean of Students team - We promise we will help you identify the department/person who has the answers to your questions."* Claude also considered CARES, which is for crisis and case support, and Enrollment Services, which only covers records and registration; neither is a general "start here" office.
- **Choosing the 0.63 threshold** from the test questions:
  - **Right offices scored 0.51-0.72.** Examples: harassment → Title IX office 0.723; Veterans 0.669; Library 0.644; ID Card Services 0.644; Student Health 0.51-0.54.
  - **Wrong offices scored 0.58-0.66.** Examples: "best professor" → College of Business center 0.620; "undocumented" → Basic Needs 0.656, when it should be the Dream Success Center, whose page has no description to embed.
  - **Off-topic questions reached 0.596.**
  - **There's no clean gap,** so Claude chose precision: a wrong office is worse than the general one. At 0.63, Library, Veterans, the Title IX office, ID cards and Financial Aid get through, and so does the known wrong pick (undocumented → Basic Needs). Everything below goes to Dean of Students.
- **Off-topic questions** (no office; instead the sentence "I can answer questions about CSULB student services…" plus 3 example questions):
  - **When Gemini is asked:** a new `about_csulb` field in Gemini's reply. It's false for general knowledge, weather, other universities and places off campus.
  - **When Gemini is skipped (no-AI fallbacks):** off-topic if the closest knowledge chunk by meaning is below **0.6** and there's no strong office match. France scored 0.505 and gibberish 0.590; real CSULB questions in our tests scored 0.60+.
  - The strong-office check was added after Claude found that "harassment" alone (0.590) would otherwise get examples instead of the Title IX office.
  - **If meaning search is unavailable,** a no-AI fallback gets Dean of Students, the safe direction.
- **The fallback sentence, the "Try:" related page and "Request this topic" are all unchanged.** The new card is in `components/chat/assistant-message.tsx`. It shows "Who can help", the office name linked to its official page, the one-line description, and tel:/mailto: links. Nothing in it is written by the AI.
- **Tests.** New `helpOffice` check in `scripts/run-tests.ts`: if the reply is a fallback, true means it must show an office, and false means no office and 3 example questions.
  - **Must show an office (18 tests):** original #18-22, #29 and #42; student #23, #35, #36, #39, #40 and #43-48.
  - **Must not (7 tests):** original #17 (tacos), #30 (gibberish) and #41 (France); student #33 (France), #34 (pizza), #37 (weather) and #38 (UCLA).
- **`npm run explain`** now ends with a "Who can help" preview.

**Did it work?** Offline, yes. Live Gemini runs were not done (daily quota).
- **The preview for all 25 fallback-check questions** (no rewrite, since that needs the generate quota):
  - **Not reaching Gemini:** France ×2 and gibberish → example questions, which is correct.
  - **Reaching Gemini:** the office comes from Gemini's pick first. If Gemini picks none, the backup is the Library for the study room questions, Financial Aid for #22, Veterans for #45, Basic Needs for #43 (a known wrong pick), and Dean of Students for the rest. So **every CSULB question gets an office.**
  - **What can't be checked offline:** tacos, pizza, weather and UCLA reach Gemini, so whether they get example questions depends on Gemini answering `about_csulb: false`. That's checked in the next live run.
- **Through the real app** (only questions that never reach Gemini's answer step; the rewrite attempt was just rate-limited):
  - original #30 and #41 pass (example questions, no office);
  - "undocumented" → Dean of Students;
  - "harassment" → Office of Equity & Compliance with OEC@csulb.edu.
- **Screenshots** (desktop and mobile; no console errors, no sideways scrolling):
  - `docs/screenshots/*-12-fallback-who-can-help.png`: harassment;
  - `docs/screenshots/*-13-fallback-not-csulb.png`: France.
- `npm run build` passes, and the Vercel bundle includes `office-embeddings.*`.

**Troubleshooting or redirection (if any):**
1. **Automatic contact extraction picked other offices' details** (above). It was replaced with hand-picked contacts that the fetch script verifies.
2. **The contact check first read only each page's main content,** so 7 real contacts in page sidebars were dropped. It now also reads the sidebar, the same part our knowledge files include.
3. **"harassment" would have been called off-topic** on the no-AI path. Fixed by letting a strong office match win first.
4. **CSULB updated two pages today** (new CAPS quick links and a CARES self-referral link). They were picked up by the re-fetch and re-embedded; nothing else changed.

**Screenshot / commit:** `docs/screenshots/{desktop,mobile}-12-fallback-who-can-help.png`, `{desktop,mobile}-13-fallback-not-csulb.png`

---

## Entry 18 (Search keywords for offices with no matchable description)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> For offices whose pages have no matchable description, add a short list of search keywords to directory.json (used only for matching the office, never shown as facts). Start with the Dream Success Center: undocumented, DACA, AB 540, Dream Act, CA Dream Act. Check the others that are listed by name only (Financial Aid, College of Business center, Library) and add keywords if they need them. Re-run the office matching offline and show me the 25 fallback questions again. No live tests.

**What the AI did:**
- **New optional `keywords` field** for directory entries in `scripts/fetch-sources.ts`, saved to `lib/data/directory.json`.
  - These are our own matching hints, not page text, so the fetch script doesn't check them against the page.
  - **Where they're used:** in the text embedded for each office ("name: description. Handles: …", `lib/embeddings-store.ts`), and in Gemini's numbered office list, so Gemini can pick the office too.
  - **Never shown to students:** the "Who can help" card shows only the name, description, link and verified contacts.
- **Dream Success Center:** undocumented, DACA, AB 540, Dream Act, CA Dream Act.
- **The other name-only offices**, tested with keywords and then without:
  - **College of Business center: kept.** Keywords: business major advising, accounting, finance, marketing, management, information systems, College of Business. By name alone it was wrongly the top match for "best professor for CECS 326" (0.620). With keywords it isn't.
  - **Library and Financial Aid: removed.** Keywords made them *worse*. Study room fell from 0.644 to 0.616, and the private-loan question from 0.609 to 0.552. Their names already match well, and the extra words diluted that. So they don't need keywords.
- `npm run embeddings` re-embedded only the changed offices.

**Did it work?** Yes, offline (no live tests, as asked).
- **Changes from Entry 17's preview:**
  - "I'm undocumented, is there support for me?" now goes to the **Dream Success Center (0.723)** instead of Basic Needs;
  - the single word "undocumented" (a no-AI fallback) → Dream Success Center;
  - "DACA renewal help" → Dream Success Center;
  - "AB 540 affidavit" → Dream Success Center;
  - "best professor" no longer matches the College of Business center.
- **The 25 fallback questions:**
  - **Above the 0.63 threshold, all correct:** Library ×2 (study room), Financial Aid (#22), Dream Success Center (#43), Veterans (#45).
  - **Everything else about CSULB → Dean of Students** (if Gemini doesn't pick an office first).
  - **France ×2 and gibberish → example questions.**
  - **No wrong office is shown anymore.**

**Troubleshooting or redirection (if any):**
1. **Claude first added keywords to all four name-only offices.** Re-running the match showed that hurt Library and Financial Aid (above), so Claude removed theirs. Only offices whose matching was actually wrong got keywords.

**Screenshot / commit:** none

---

## Entry 19 (UI bug: chat bubble breaking words in the middle)

**Date:** 2026-11-12
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> UI bug: short messages in the student's chat bubble break in the middle of words. "hello" shows as "he" / "llo" on two lines.
> 1. Fix the user bubble so words never split mid-word. Use overflow-wrap: break-word (Tailwind break-words) instead of break-all / overflow-wrap: anywhere, and give the bubble a sensible width (w-fit with a max width around 80%) so short messages stay on one line.
> 2. Check every other text container (assistant answers, source chips, the Who can help card, clarifying buttons, the input box) for the same problem.
> 3. Long URLs and long unbroken strings should still wrap instead of overflowing.
> Take Playwright screenshots (desktop and mobile) of: "hello", a one-word message, a long message, and a message containing a long URL. Show me, then update the prompt log and stop. Don't call Gemini.

**What the AI did:**
- **Found the real cause first.** The bubble already used `overflow-wrap: break-word` (Tailwind v4's name for it is `wrap-break-word`), `w-fit` and `max-w-[80%]`, so the classes the prompt suggested were already there.
  - **The problem was the bubble's row,** which was only as wide as its contents (the bubble plus the edit pencil).
  - **The pencil only shows on the latest question, and not while a reply is loading.** Without it, the row was exactly as wide as "hello", and the bubble's 80% limit became 80% of "hello". That is too narrow for the word, so it broke mid-word.
  - **That's why it showed up while the answer loaded and on every earlier question,** but not in our old screenshots, which were all taken after the answer, with the pencil showing.
- **The fix (`components/chat/chat-app.tsx`):** the row is now full width (`w-full`), so 80% means 80% of the chat column.
- **Checked every other text container** with a Playwright audit. It filled them with a long URL and a 90-character unbroken word, then listed anything wider than its box:
  - **Already fine:** assistant answers (including links), the source panel, source chips (long titles end in "…" on purpose), and the input box.
  - **Clipped at the bubble edge** (the same root cause: text in a flex row can't shrink below its longest word):
    - the clarifying question and fallback sentence;
    - the Who can help office name and email;
    - the "Try:" page button;
    - clarifying option buttons;
    - example question buttons.
  - **The fix (`components/chat/assistant-message.tsx`):** one shared `WRAP` class (`min-w-0 wrap-break-word`) on that text, plus `max-w-full` and normal wrapping on those buttons. Clarifying options used to be fixed at one line tall and now grow if the option is long.
- **Screenshots** used a fake `/api/chat` reply, so Gemini was never called.

**Did it work?** Yes.
- **"hello" before the fix:** 2 lines ("he / llo") while loading and as an earlier question.
- **After the fix:** 1 line in both cases, on desktop and mobile.
- **Also checked in Firefox and WebKit (Safari's engine).**
- **The audit after the fix:** nothing sticks out or is cut off, and the page never scrolls sideways.
- **Long URLs and long words** wrap only where they have to; normal words always wrap whole.
- tsc, eslint and `npm run build` pass.

**Troubleshooting or redirection (if any):**
1. **The first screenshots didn't show the bug** in Chrome, Firefox or WebKit, because they were all taken after the reply, when the pencil keeps the row wide. Asking twice showed the first question split, and that led to the cause.
2. **In WebKit the test typed before the page was ready,** so the message was never sent. The script now waits for the page to finish loading. That was a test-timing problem, not an app bug.
3. **Not fixed (not a wrapping issue):** the send button's container sticks out 4px past the input box border. It's invisible padding, and nothing looks wrong.

**Screenshot / commit:** `docs/screenshots/mobile-14-wrap-hello-before.png` (the bug), `{desktop,mobile}-14-wrap-hello[-loading].png`, `-15-wrap-one-word[-loading].png`, `-16-wrap-long-message[-loading].png`, `-17-wrap-long-url[-loading|-input].png`

---

## Entry 20 (Scope rule + preset questions that always answer; first live A2/A1 runs)

**Date:** 2026-11-22
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt (summary):**
> 1. Add a standing rule to CLAUDE.md: check every change against the assignment and the design brief, say whether it's in scope, flag anything beyond it, and wait for approval.
> 2. Fix the preset questions: some sidebar and welcome questions ("Where can I eat on campus?", "Is the rec center free for students?") don't get answered. Plan first:
>    - gather every preset;
>    - run each one live, counting Gemini requests;
>    - classify each failure: API error, missing page, page didn't reach Gemini, or Gemini fell back anyway;
>    - propose fixes with a scope check;
>    - report the A2/A1 state.
>
> After approval: fix, rerun, make every preset a permanent test, and replace any preset our sources can't answer.
>
> **Team changes to the plan:** don't re-add the conference campus-map page (removed on purpose in Phase 1). Try https://www.csulb.edu/maps, or reword the preset. After the presets pass twice, run both full test sets live, staying under ~400 requests, and show B2 → now.

**What the AI did:**
- **Scope rule:**
  - Created `CLAUDE.md` with the team's rule word for word. It also loads `AGENTS.md`.
  - The rule names `docs/is300_capstone.docx`, which doesn't exist; the repo has `docs/is300 capstone.pdf`. CLAUDE.md points to the real files.
- **Scope check, flagged in the plan:**
  - **Sources:** the brief lists 14 approved sources, and we have 57 official pages. **Confirm with the instructor or update the brief.**
  - **A2/A1 (rewriting + embeddings):** this is more machinery than the brief's "built-in similarity search", and it doubles quota use. It's explainable in plain words, though.
- **Investigation:** 22 unique presets (the 6 welcome examples and the greeting/fallback buttons are a subset of the 22 sidebar starters).
  - **Live:** every preset answered, including eat and rec center 4 of 4 times. The one failure was a 503 ("Gemini is busy") on the advising preset.
  - **The dev server log showed what the team saw on Nov 12:** right after the daily quota ran out, the main model returned 429, then the backup returned 503/429, so the student got "Gemini is busy".
  - **Diagnosis: (a) API errors.** Not a missing page, and not retrieval: even keyword-only search ranks the right page first.
- **Fixes:**
  1. **`lib/gemini.ts` (changes Gemini logic; the team approved it first):** on a "busy" reply (503 or another 500-range error), wait 2 seconds and ask the main model once more before switching to the backup.
     - **No retry on 429** (it would waste quota) **or on a timeout** (the student has already waited 20s).
     - **In today's runs it recovered 15 busy replies.**
  2. **`lib/rag.ts`:** preset questions skip the rewrite call. They're already clear and find the right page as written. This halves their Gemini use and removes one thing that can fail.
  3. **Campus map preset:**
     - https://www.csulb.edu/maps has no text we can use (the main content is 18 characters: "Maps Image Image"; it's an interactive map).
     - Our closest official source is Building Names & Codes (csulb.edu/maps/building-names-codes).
     - **New preset:** "What building does the code ECS stand for?" (answer: Engineering and Computer Science).
  4. **Permanent tests:**
     - **`tests/preset-questions.json`:** all 22 presets, each required to be answered with the right source and never fall back.
     - **`npm run check:presets`** (offline): fails if a preset in `lib/categories.ts` has no test.

**Did it work?**
- **Presets: 22/22, twice** (`docs/test-results-presets.md`; average 4.6s and 5.1s).
- **First live runs of A2+A1:**

| Test set | B2 (before A2/A1) | Now (A2 + A1) |
|---|---|---|
| Original (`test-questions.json`) | 41/42 | 39/42 |
| Real student (`student-questions.json`) | 36/45 (best after reruns) | **46/48** (3 schoolwork tests added since B2) |
| Presets (new) | not tested | 22/22, twice |
| Response time, original set | avg 2.1s, median 1.6s, slowest 4.6s (B2 sample) | avg 6.1s, median 6.3s, slowest 11.6s |
| Response time, student set | (not timed) | avg 5.4s, median 4.8s, slowest 11.1s |

- **Fixed by A2/A1:** student questions that had been failing all pass now: CS major, switch major, transcripts, dorms, rec center gym, "$$ for the whole yr", the "what about for a year?" follow-up, "did my FAFSA go through", and the GI Bill question.
- **Fixed since B2:** original #3 (the date conflict) passes.
- **Still failing (shown to the team, not fixed yet):**
  - **Original #4 "How do I check my financial aid status?" and #27 "finacial aid status":** the right page reached Gemini, but the answer also mentioned the SAP section, which these tests forbid. (#4 is the same question as preset #2. The preset test checks for an answer and a source, not the SAP rule.)
  - **Original #21 "What medicine should I take for a headache?":** Gemini answered "not about CSULB", so the student got example questions instead of Student Health. This comes from Entry 17's use of `about_csulb`.
  - **Student #4 "what GE classes do i need to take":** the chunk with "34 lower-division GE units" didn't reach the top 5 (the page reached Gemini, but not that section), so the answer covered other GE topics.
  - **Student #7 "wheres the writing center":** the Writing Center's contact section didn't reach the top 5, and the page doesn't give a location, so Gemini fell back (with the Writing Center card).
- **Slower answers:** the rewrite adds a request and the busy retries add waits, so answers now take about 5-6s on average, against about 2s at B2.
- **Gemini requests today:** about 330 of the ~400 budget.

**Troubleshooting or redirection (if any):**
1. **The reported failures didn't reproduce.** Instead of guessing at a fix, Claude checked the dev server log. It showed quota (429) and busy (503) errors at the exact time the team tried the presets, so the fix went into handling busy errors, not retrieval.
2. **The team redirected the campus-map fix:** don't re-add the conference page removed in Phase 1. The official maps page had no text, so the preset was reworded instead.
3. **The first preset run crashed while writing the results file:** the new tests don't have an `expected_fact` field. `scripts/run-tests.ts` now allows it to be missing. All 22 answers were fine.

**Screenshot / commit:** none (results in `docs/test-results-presets.md`, `docs/test-results.md`, `docs/test-results-students.md`)

---

<!-- Copy an entry block above for each new prompt -->
