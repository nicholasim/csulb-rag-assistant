# Requirements Checklist: CSULB Services RAG Assistant

Built from the assignment handout (`docs/is300 capstone.pdf`) and our Solution Design Brief (`docs/IS300 – Solution Design Brief.pdf`). Updated at the end of every phase, together with `docs/prompt-log.md`.

**Last updated:** 2026-11-22, after Entry 21: speed changes, the health rule, top 8 and the location rule are built and checked offline. **Live runs are waiting for the quota reset.**

**Legend:** `[x]` done (with where) · `[ ]` not done yet. Items that are partly done stay unchecked, with a "Partly:" note saying what's left.

---

## 1. Prototype (assignment: Required Prototype Capabilities)

- [x] **Browser-based chat / Q&A interface.** `app/page.tsx` + `components/chat/` (Phase 3, Entry 5). Screenshots in `docs/screenshots/`.
- [x] **Knowledge base with at least 5 official CSULB sources.** 18 pages in `knowledge/`, copied word for word from csulb.edu and asicsulb.org by `scripts/fetch-sources.ts` (commits `8df0c0a`, `dcd1b5b`; Basic Needs added in Entry 4).
- [x] **Sources cover multiple student-service areas.** 14 categories: Enrollment, Financial Aid, Tuition, Academic Advising, Parking & Transportation, Career, Library, Tech Help Desk, Health, Food, Basic Student Support, International, Bookstore, Orientation (`knowledge/*.md` headers).
- [x] **Retrieval happens before the AI generates an answer.** `lib/rag.ts` step 2 (BM25 search in `lib/retrieval.ts`) runs before `askGemini` (commit `00cae20`).
- [x] **Retrieved passages are given to the LLM as context.** `buildInput()` in `lib/rag.ts`; Gemini is told to use only those sources (`lib/gemini.ts`, commit `00cae20`).
- [x] **Source name, citation, or excerpt shown to the user.** Gold [1] citation tabs in the answer, plus numbered source chips that open the excerpt and a "View on csulb.edu" link (`components/chat/answer-text.tsx`, `source-chips.tsx`; `docs/screenshots/*-02-answer-with-source.png`).
- [x] **Clear "not enough information" fallback.** Exact sentence from `lib/gemini.ts` `FALLBACK_SENTENCE`, shown in a calm gray card with the related department page as a button (`docs/screenshots/*-04-fallback.png`).
- [x] **At least 10 test questions: answerable, ambiguous, and unsupported.** 42 tests in `tests/test-questions.json` (14 answerable across 13 service areas, 2 ambiguous, 4 unsupported, 2 safety, 3 invalid, 5 misspelled, 12 conversation), run with `npm run test:questions` (`ONLY=26,27` runs just some), plus the 45-question "real student" set (below). Latest full run of the original set (Entry 20, with A2/A1): **39/42** in `docs/test-results.md`. #4 and #27 mention the SAP section, and #21 (headache medicine) got example questions instead of Student Health. **Preset tests:** all 22 preset questions are permanent tests in `tests/preset-questions.json`. They passed **22/22 twice** (`docs/test-results-presets.md`), and `npm run check:presets` fails if a preset has no test.
- [ ] **At least one meaningful error or invalid-case demo.** Partly (all 3 invalid tests pass: empty question, 600-character question, missing API key; Entry 7): the API returns friendly errors for an empty question, a question over 500 characters, a missing API key, Gemini rate limits, and Gemini outages (tested in Entry 3). The UI shows them with a "Try again" button and blocks questions over 500 characters with a red counter (`docs/screenshots/*-05-error.png`, which uses a simulated rate limit). Phase 4: choose and rehearse the live demo case (e.g., a 500+ character question, or a missing key on a test deploy).
  - **"The AI sent back an answer we couldn't read"** (Entry 14). Cause: Gemini's hidden thinking counts toward its output limit (2048 tokens), and table-heavy questions used up to about 1,000 thinking tokens, so a long reply was sometimes cut off mid-JSON (status "incomplete"). Fix: the limit is now 8192, the server retries an unreadable reply once automatically, and the log records the status and token counts.
- [x] **API key not in source code or GitHub.** The key lives only in `.env.local`, which git ignores (`.gitignore` line 34). A scan of every commit found no key. The key is read only on the server, in `lib/gemini.ts`, and is never logged.
- [ ] **Deployed web app (Vercel) for the live demo.** Partly: ready to deploy, not deployed yet. `npm run build` passes; the `/api/chat` serverless bundle lists all 18 `knowledge/*.md` files (`.next/server/app/api/chat/route.js.nft.json`, via `outputFileTracingIncludes` in `next.config.ts`); the production build (`npm run start`) passed the full test suite (Entry 11). Left to do: create the Vercel project and add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in its settings.

## 2. Prompt log (assignment: Vibe Coding Expectations)

- [x] **At least 5 meaningful prompt iterations.** 11 so far (`docs/prompt-log.md` Entries 1-11).
- [x] **At least 2 cases where the AI's solution didn't work, and how we fixed or redirected it.** Entry 3: Gemini overload (fixed with a backup model) and an invented email address (fixed with a contact-detail check), plus four more. Entry 2: our redirection on the incomplete Advising page and the swapped map source.
- [ ] **"Who" filled in on every entry.** Team to fill in.
- [ ] **Screenshot / commit filled in on every entry.** Team to fill in (commits: Entry 1 = `8df0c0a`, Entry 2 = `dcd1b5b`, Entry 3 = `00cae20`, Entry 5 = `ff02f09`, Entry 6 = `fed9e9b`, Entry 7 = `018049e`, Entry 8 = `68299b9`, Entry 9 = `eb998a5`, Entry 10 = `f9a8930`, Entry 11 partly in `b0af1d7` (WIP), rest not committed yet).

## 3. Design brief features

### Chat experience
- [x] **Welcome message with clickable example questions** (brief: Onboarding, "Should"). `components/chat/welcome.tsx`; all 6 examples tested end to end (Entry 5). Every preset (22 sidebar starters, which include the 6 welcome examples) is a permanent live test, passing 22/22 twice (Entry 20). Presets skip the rewrite call, to save quota.
- [x] **Sidebar with service categories as quick-select buttons** (brief: UI Sketch). 15 categories in `lib/categories.ts`; clicking one fills a starter question. Slide-out menu on mobile (`docs/screenshots/mobile-01b-menu.png`).
- [x] **Source chips under every answer; clicking one shows the excerpt and a link to the CSULB page** (brief: Display source, "Must"). `components/chat/source-chips.tsx`. Numbered 1, 2, 3 in order with one chip per page; table quotes include column names (Entry 6).
- [x] **"New chat" button** clears the conversation and returns to the welcome screen (desktop sidebar + mobile header; Entry 6). It also cancels an answer that's still loading (Entry 9).
- [x] **Stop:** while an answer loads, the send button becomes a Stop button (Esc works too). It cancels the request, removes the loading bubble, and puts the question back in the box with a gray "Stopped" note, with no error card (Entry 9; `docs/screenshots/*-07-stop-button.png`).
- [x] **Edit the latest question:** the pencil icon (on hover; always visible on touch screens) puts the question back in the box and removes it and its answer (Entry 9; `docs/screenshots/*-08-edit-icon.png`).
- [x] **Stop and edit keep follow-up history correct:** history is rebuilt from the messages on screen. Checked by `npm run test:stop-edit` (32 checks, all passing).
- [x] **Welcome trust line:** "Searches 18 official CSULB pages · Every answer links to its source." (count read from `knowledge/`; Entry 6).
- [x] **Loading state, mobile-friendly layout, CSULB black and gold look.** Gold typing dots; tested at 390px and 1440px wide (`docs/screenshots/`). Text wraps at word boundaries everywhere; long URLs and long unbroken strings wrap inside their box instead of overflowing (Entry 19, `docs/screenshots/*-14..17-wrap-*.png`).
- [x] **Follow-up after a clarifying question works** ("How do I apply?" -> "Graduation" button -> cited graduation deadlines). `docs/screenshots/desktop-06-clarify-follow-up.png`.

### Answer behavior
- [x] **Short answers:** 2-4 sentences, direct answer first, then one related detail and a next step (system prompt, Entry 6).
- [x] **Citations only on what the sources say, once per paragraph or list.** System prompt rule plus `citeOncePerParagraph` in `lib/rag.ts` (Entry 6). Gemini's own reasoning (e.g., "this deadline has passed") must be uncited.
- [x] **Clarifying question for ambiguous asks** ("How do I apply?" -> "Do you mean admission, scholarships, graduation, financial aid, or something else?"). Rule in `lib/gemini.ts`; passed test 3 in Entry 3. The UI shows the options as buttons.
- [x] **Unsupported questions get the fallback and point to the right department page.** `lib/rag.ts` `fallback()`; passed tests 4-6 in Entry 3 (tacos -> Eat and Shop, study room -> Library Services). **Office directory (Step B2, Entry 14):** `lib/data/directory.json` lists 42 CSULB offices, each with its official page and one sentence copied word for word from that page. `npm run fetch-sources` checks each sentence is still on the live page. Gemini gets the numbered office names and, when it falls back, picks the office that handles that kind of question (`related_office`, or 0 for none), so it can't invent an office or a link. The "Try:" button prefers a related source page, then that office. Examples: the antibiotic question -> Student Health Services, a private loan -> Financial Aid. Student tests #39-40 and #43-45 pass, in 3 of 3 rounds for the group.
- [ ] **No dead-end fallbacks: every fallback about CSULB shows a "Who can help" office** (team rule, Entry 17). Partly: built and checked offline. Live check pending.
  - **The card:** office name, its one-line description, its official link, and a phone/email verified on its page or in `knowledge/` (25 of 42 offices have one).
  - **How the office is picked:** Gemini's pick → the closest office by meaning (≥ 0.63) → Dean of Students (its page says to start there when you don't know where to go).
  - **Non-CSULB questions** get the assistant's scope and 3 example questions instead. Gemini's `about_csulb` decides when Gemini is asked; meaning similarity below 0.6 decides when it isn't.
  - **Unchanged:** the exact fallback sentence and "Request this topic".
  - **Tests:** 18 tests require an office and 7 require none. Offline and through the app, the no-AI cases pass (France, gibberish, "undocumented", "harassment").
  - **Screenshots:** `docs/screenshots/*-12-fallback-who-can-help.png` and `*-13-fallback-not-csulb.png`.
- [x] **Basic conversation ("chat" replies):** greetings (with 3 example question buttons), thanks, goodbye, "what can you do?" / "who made you?" (official pages only, the service areas, our IS 300 team), and "how are you?" get fixed friendly replies with no AI and no sources (`lib/small-talk.ts`, Entry 11; `docs/screenshots/*-10-chat-hello.png`, `*-11-chat-what-can-you-do.png`). A greeting plus a real question is answered normally; off-topic facts ("capital of France", "write my essay") still fall back. Tests #31-42 pass.
- [x] **Typos are fixed before searching** ("parkng permit" -> "parking permit"). `lib/spelling.ts`: edit distance against every word in our pages, 1 typo for 4-7 letters and 2 for 8+, no change on a tie, same first letter, and only into words that appear at least twice in our pages (Entry 11). **Real English words are never changed** (Entry 14): about 44,000 common words from SCOWL (`lib/data/english-words.json`, made by `npm run english-words`), so "died", "write" and "dorms" stay as typed. Greetings like "helo" and "thx" are never corrected. Gemini sees the original and the corrected wording, and the UI shows a gray "Showing results for: …" note (Entry 10; `docs/screenshots/*-09-spelling-note.png`). Misspelled tests #26-30 pass (Entry 14).
- [x] **Understanding any wording: query rewriting (Step A2).** Built in Entry 15; first live runs in Entry 20.
  - `lib/rewrite.ts` turns each message into 1-3 search queries: slang, "CS" → Computer Science, follow-ups, two-part questions, "my record" → how to check it, schoolwork → Writing Center/tutoring.
  - The question itself is always searched too, and the results are merged with RRF (`lib/rank-merge.ts`).
  - If the rewrite fails, the app searches as before. This was tested with a model name that doesn't exist.
  - Personal details are removed from every query.
  - **Live (Entry 20, A2+A1 together):** student set **46/48** (B2: 36/45), original set 39/42 (B2: 41/42).
  - **Cost:** 2 Gemini requests per question instead of 1, so about 250 questions per day on the free tier. ⚠ This is beyond the brief's "built-in similarity search"; the team should be able to explain it in plain words.
- [x] **Understanding any wording: hybrid search with embeddings (Step A1).** Built in Entry 16; first live runs in Entry 20.
  - `npm run embeddings` saves 290 vectors (0.9 MB, `gemini-embedding-001`, 768 numbers each) to `data/`. It's incremental, batched, waits out 429s, and is resumable, for the future full-site crawl.
  - `lib/vector-search.ts` falls back to keyword search if the vectors are missing or stale, or the call fails (both tested).
  - Vercel bundles `data/embeddings.*`.
  - **Offline:** the right page is in the top 5 for 22/22 questions with known pages (19/22 with keywords only).
  - **Live:** see A2 above. No "[vectors] skipped" warnings in any live run.
- [x] **Schoolwork rule** (team decision, Entry 15). The prompt in `lib/gemini.ts` says never to write, rewrite, edit, outline or complete schoolwork, even indirectly. Instead the assistant refers the student to the University Writing Center or The Learning Center. Student tests #36 and #46-48 check for the referral, no content, and ≤ 600 characters. Live run pending.
- [x] **Map / "getting around" questions point to https://www.csulb.edu/maps.** (That page has no text we can use, so the "Campus Maps" preset is now "What building does the code ECS stand for?", answered from Building Names & Codes; Entry 20.) `lib/gemini.ts` and `lib/rag.ts`; tested in Entry 3.
- [x] **Advising: name the center and give its Contact & Location link; never make up phone numbers or emails.** Prompt rule plus the contact-detail check (`removeUnverifiedDetails` in `lib/rag.ts`); tested in Entry 3.
- [ ] **Conflicting sources: show both values and say to confirm with the office.** Partly: prompt rule in `lib/gemini.ts`. It works for "When is the add/drop deadline for spring?" but not for "last day to drop without a W" (Entry 3, issue 6). It is still failing in test #3 on `gemini-3.5-flash-lite` (Entry 7). **Team decision (Entry 8): left as a known limitation for the limitations slide.** Flash-Lite doesn't reliably notice that the refund table's Feb. 2 row is the same deadline as the Registration table's Feb. 3.
- [x] **No medical, legal, or financial advice.** Rule in the system prompt (`lib/gemini.ts`). Test #21 ("What medicine should I take for a headache?") passes: no medicine named, Student Health mentioned.
- [x] **Crisis messages always get crisis contacts, never the fallback** (team safety rule, Entry 13). `lib/crisis.ts` runs before small talk and search. It matches suicide, self-harm, "kill myself", "want to die", "crisis", "I feel unsafe" / "don't feel safe", and similar.
  - **The fixed, kind reply contains:**
    - 911;
    - CAPS at 562-985-4001 (Mon-Fri 8AM-5PM, Brotman Hall 226; after hours, follow the recorded message);
    - text BEACH to 741741 (the CAPS page writes it as 74-17-41);
    - **the 988 Suicide & Crisis Lifeline**.
  - **Sources:** every CSULB fact is copied from the CAPS Crisis Intervention page, which is cited as the source. The server checks that the page still contains them.
  - **The one exception to the sources-only rule:** 988 isn't on any CSULB page we use. The team added it on purpose, for safety, and it's shown without a citation.
  - **Tests:** student tests #41-42 pass, with no AI call.
- [x] **Never asks for personal information.** Rule in the system prompt (`lib/gemini.ts`). Test #22 ("My student ID is 012345678…") passes: the ID isn't repeated and no personal info is requested.
- [x] **Questions about a student's own record explain how to check it in MyCSULB** (team decision, Step B2, Entry 14). This is a prompt rule in `lib/gemini.ts`: the assistant can't see records, but if the sources explain how to check something (grades, holds, schedule, aid status, what you owe), it answers with those steps and never asks for or repeats an ID. Student account tests: 4/5 pass. #31 "did my FAFSA go through" still falls back, because search doesn't find the To Do List section for that wording (Step A2).

### Accessibility
- [x] **Keyboard navigation and visible focus.** Tab moves through the sidebar, examples, and input in order with a visible focus ring; Enter sends (checked with Playwright, Entry 5).
- [x] **Labels for screen readers.** Every button has a label (including the icon-only send and menu buttons), new messages are announced (`role="log"`), links that open a new tab say so, and decorative icons are hidden from screen readers.
- [x] **Contrast and motion.** Gold is used only behind black text (11:1); gold-colored text uses dark gold `#7A5600` (6.5:1); secondary text is `#52525B` (7.7:1); the input focus ring is `#B07D00` (3.6:1, Entry 7). The loading animation stops for people who prefer reduced motion.

### Privacy (brief: Privacy & Appropriate Use)
- [x] **Index only public, official university information.** `knowledge/` holds only the approved public CSULB/ASI pages.
- [x] **Don't store student data; keep logs anonymous.** `store: false` on every Gemini call (`lib/gemini.ts`). Server logs record only error types and status codes, never the question text. The one exception is "Request this topic", which the student clicks on purpose: it logs only the question text, with no IP and no other details.
- [x] **Footer note:** "Answers come only from official CSULB web pages. Don't enter personal information." shown under the input box.

### Service-area coverage (brief: Main Features, the ten core areas)
- [x] Academic Advising: `knowledge/academic-advising.md` (all 45 centers)
- [x] Financial Aid: `knowledge/financial-aid.md`, plus the dates in `knowledge/enrollment-key-dates.md`
- [x] Enrollment / Registration: `knowledge/enrollment-key-dates.md`
- [x] Career Development Center: `knowledge/career-development-center.md`
- [x] Student Health Services: `knowledge/student-health-services.md` (a list of services only, with no hours or phone)
- [x] Library Services: `knowledge/library-services.md`, `knowledge/library-study-spaces.md` (reserving a study room is intentionally unanswerable)
- [x] Parking & Transportation: `knowledge/parking-permit-fees.md`, `parking-permit-information.md`, `parking-shuttle.md`
- [x] Technology Help Desk: `knowledge/technology-help-desk.md`
- [x] Food Services: `knowledge/food-services.md`
- [x] Basic Student Support: `knowledge/basic-needs.md` (official Basic Needs page, added in Entry 4)
- Extra areas from our user stories: Tuition / Payments, International Students, Bookstore (Day 1), Orientation (SOAR) are covered. Instructor ratings are intentionally unanswerable.
- [x] **Step B1 coverage expansion (Entry 13): 39 more official pages, 57 in total (290 chunks).** The team approved the URL list before fetching. New sidebar areas:
  - **Campus Places:** Horn Center, computer labs, building codes, ASI Maps & Hours.
  - **Majors & Academics:** change/declare a major, Engineering major-specific requirements (incl. CS), the B.S. CS page, GE requirements, applying to graduate, academic standing.
  - **Housing:** applying, rates and meal plans.
  - **Wellness & Access:** CAPS, the CAPS FAQ, CAPS Crisis Intervention, BMAC, CARES, Dean of Students.
  - **Tutoring & Writing:** The Learning Center, University Writing Center, Supplemental Instruction.
  - **Safety:** University Police, Night Safety Escort, BeachALERT.
  - **Recreation:** SRWC membership, on asirecreation.org, ASI's own rec site (approved).
  
  Added to existing areas:
  - **Enrollment / Registration:** transcripts, dropping/withdrawing, Using Academics, Permission to Add, Holds and To Do Lists, grades, enrollment verification.
  - **Technology:** the BeachID password page and student technology resources.
  - **Library:** services for students, Research & Information Desk hours.
  - **Bookstore:** getting a student ID card, ID card FAQs.
  
  Every new file was checked against its live page (Entry 13).

### Brief items decided by the team (Entry 4)
- [x] **"Option to write a claim"** (brief: Handling Unsupported Questions). Built in Phase 3 (`app/api/request-topic/route.ts`; `docs/screenshots/*-04b-fallback-topic-requested.png`). Fallback answers show a "Request this topic" button. Clicking it logs only the question text on the server (`console.log`, visible in Vercel logs; no IP, no personal info, no database) and tells the student "Thanks, we'll consider adding this topic."
- **"Integration of student experiences and reviews where relevant"** (brief: workflow step 4b and CSULB Sources). Decision: **not built; future work.** It conflicts with our official-sources-only rule. Mention it on the "next steps" slide.

## 4. Accuracy

- [ ] **Answers match the live CSULB pages.** Partly: the knowledge base was copied word for word from the live pages on 2026-11-11, and every answer cites its source. Before the presentation, re-run `npm run fetch-sources` and check `git diff knowledge/` for any page changes.
- [x] **Contact details in answers are checked against the sources.** `removeUnverifiedDetails` in `lib/rag.ts` (added after the invented-email bug, Entry 3).
- [x] **"How do I check my financial aid status?" (a Must user story) answers from the To Do List steps, not the SAP section.** Fixed with a "status" -> "pending" synonym (Entry 11). Test #4 requires the page's own words ("To Do List", "Student Center") and fails on any SAP mention.
- [x] **Every test question has an expected fact that the test script checks** (e.g., "$259", "Castor/Guzman/Garris", the exact fallback sentence). `tests/test-questions.json` + `scripts/run-tests.ts`; every expected fact was confirmed to appear word for word in `knowledge/`.
- [x] **100% of unsupported test questions get the fallback** (brief: Success Measures). After Step B2 (Entry 14), the unsupported and safety group was run 3 times across both sets. Every truly unsupported question fell back in all 3 rounds, except one Gemini error on round 1 (tacos), which passed in rounds 2 and 3. **Team decision (Entry 14):** "write my essay" and "write my discussion post" correctly get a short referral to the University Writing Center. Their tests now require that referral and fail on any essay or post text (answers must be at most 600 characters).
- [x] **Test results recorded as a table** (question, type, expected, actual, pass/fail, model) in `docs/test-results.md`, regenerated each run.
- [ ] **"Real student" coverage test set (45 questions, messy wording).** Partly:
  - **Baseline** (Entry 12): 16/40 (`docs/test-results-students-baseline.md`).
  - **After B1** (Entry 13): 29/42.
  - **After B2** (Entry 14, plus 3 office-directory tests): **34/45** (`docs/test-results-students.md`). After fixing #45's too-strict pattern and rerunning #7, both pass, so 36/45:
    - coverage 10/16
    - wording 6/7
    - follow-up 0/1
    - multi-part 2/2
    - account 4/5
    - unsupported 6/6
    - referral 1/1
    - safety 4/4
    - directory 3/3
  - **Still failing, all wording problems for Step A2:**
    - #2 ("CS"), #3 ("switch"), #4 (GE units), #6 (transcripts), #10 (dorms: answered, but from the FAQ section), #14 ("gym free"), #20 ("yr"), #21 (follow-up), #31 ("FAFSA go through").
  - **Run:** `TESTS_FILE=tests/student-questions.json RESULTS_FILE=docs/test-results-students.md npm run test:questions`.
- [ ] **All tests passing.** Original set (Entry 14): **41/42**; only #3 (the date conflict, a known limitation) fails. #15 (any clarifying question with options) and #42 (Writing Center referral) were updated by team decision and pass.
- [x] **Known source quirks and limitations**, to explain on the testing / limitations slide (team decisions, Entries 4 and 8):
  - The enrollment page lists two dates for the Spring 2027 drop deadline: Feb. 3 (Registration table) vs Feb. 2 (Refund table). **Limitation:** our default model (`gemini-3.5-flash-lite`) usually reports only Feb. 3 instead of showing both and saying to confirm (test #3).
  - Free-tier Gemini can be overloaded (503) or rate-limited (429). The app switches to a backup model and shows a friendly "try again" message if both are busy. When both are busy, that message takes up to about 35 seconds (was about 60 before Entry 10); students can press Stop.
  - "what's the capital of France?" scores just above the retrieval cutoff (the leftover "s" from "what's" matches "Bachelor's"), so it reaches Gemini, which correctly falls back. Harmless, but it costs one AI call.
  - Spelling correction only fixes small typos, and only to words that appear in our pages. A real word one letter away from a page word with the same first letter could still be "corrected" by mistake; the fallback cutoff and Gemini (which sees the original wording) are the safety nets.
  - The parking fee page announces a fee freeze but shows the Motorcycle Semester permit rising from $129 to $140.
  - The Day 1 Textbook page's sidebar still shows Spring 2026 deadlines, which have already passed.
  - **Spelling correction can change a real word.**
    - "F-1 visa" was searched as "F-1 via" (student test #27, Entry 12). Fixed in Entry 13: visa, SEVIS and other international-student words are always known.
    - "my laptop **died**" was searched as "my laptop **did**" (Entry 13). Fixed in Entry 14: real English words are never changed.
  - **A backup-model timeout shows "Something went wrong"** instead of the "Gemini is busy" message, and the test script doesn't retry it (Entry 12). Reported, not fixed yet.
  - **The BM25 no-AI cutoff can't separate supported from unsupported questions.** Their scores overlap (unsupported 3.4-11.8, answerable 3.45-24.6), so Gemini's grounding prompt is the main guard against answering unsupported questions (Entry 12).
  - **The crisis rule uses keyword matching**, so indirect wording can be missed. Those messages go through the normal flow (Gemini answers or falls back). A broad list means false alarms (e.g. "financial crisis") also show the crisis contacts, which is the safe direction (Entry 13).
  - **Library building hours aren't in our sources.** They're only on a separate booking site (csulb.libcal.com), so we have the Research & Information Desk hours only. Laptop loans aren't covered either: CSULB says the Student Technology Loan Program is no longer available. Student test #23 is now an unsupported question (Entry 13).
  - **The catalog site (csulb.catalog.acalog.com) blocks scripted downloads.** We use the Student Records pages that list the same requirements, so only Engineering majors (incl. CS) have major-specific requirements in our sources.
  - **Information that conflicts across the wider CSULB site, though our own sources agree** (Entry 13). The conflict rule in `lib/gemini.ts` now also covers phone numbers and limits, so if two of our sources ever disagree, the answer shows both and says to confirm with the office.
    - Night escort hours: our page says Sun-Thu 6:30pm-12:00am and Fri-Sat 5:30pm-9:30pm, while a campus guide says every day 6 p.m.-2 a.m.
    - CAPS session limits: our FAQ says "no session limits", while an older page mentions a limit.
    - BMAC phone numbers: our BMAC page lists 562.985.5401, while a testing page lists (562) 985-4635.
  - **The University Student Union building is closed for construction**, per ASI Maps & Hours. The same page still shows a past "Rainy Day" notice for Oct. 12.
  - **The SRWC membership page hides its contact email** behind a script ("This email address is being protected from spambots"), so that email isn't in our sources.
  - **The Writing Center page doesn't give the center's location.** "wheres the writing center" (student #7) sometimes falls back, and once answered with a room from a past writing-retreat event (LA2-200), which could mislead. The test passed on keywords, but the answer isn't really right (Entry 14).
  - **The office directory relies on Gemini to pick the office** for a fallback. Plain keyword matching on office descriptions was tried first and was too noisy ("take" matched Commencement's "take place"), so it wasn't used. Gemini can only pick a number from our 42-office list or 0, so a wrong pick is possible, but an invented office or link isn't (Entry 14).
  - **Gemini free-tier daily limit: 500 requests per model per day** (`gemini-3.5-flash-lite`, reported by Google on 2026-11-12). With query rewriting, a normal question costs 2 requests, so the app handles about 250 questions a day on this key. One full run of both test sets uses about 180. When the limit is hit, the rewrite is skipped automatically, but answers then fail with "too many questions" until midnight Pacific (Entry 15).
  - **Neither keyword nor meaning scores can tell unsupported questions from answerable ones** (keywords: unsupported up to 12.87 vs answerable from 3.30; meaning: unsupported up to 0.663 vs answerable from 0.604). The no-AI gate only stops near-empty matches, and Gemini's grounding prompt is the main guard (Entries 13, 16).
  - **Names in a question can still reach the search queries.** Codes strip IDs, SSNs, emails and phone numbers, but names rely on the rewrite prompt (Entry 15).
  - **Words typed in ALL CAPS are never spell-corrected.** This stops acronyms from being "fixed" ("ADHD" was searched as "Add" and "UCLA's" as "Ucua's" before Entry 16), but a question typed entirely in capitals ("PARKNG PERMIT") isn't corrected either.
  - **The "Who can help" office is sometimes only the general default.** Meaning scores for offices are close together (right 0.51-0.72, wrong 0.58-0.66), so below 0.63 we show Dean of Students instead of guessing. Offices whose page has no matchable description can have our own search `keywords` (used only for matching, never shown). The Dream Success Center and the College of Business center have them (Entry 18), so "undocumented" now goes to the Dream Success Center. In the offline check of the 25 fallback test questions, no wrong office is shown. Gemini's own pick comes first when Gemini is asked.
  - **Whether off-campus questions that reach Gemini (tacos, pizza, weather, UCLA) get example questions instead of an office** depends on Gemini's `about_csulb` answer. This is untested until the quota resets (Entry 17).
  - The Basic Needs page lists screening questions about food, housing, and money. The assistant must not ask students these; it should point to the Referral Form.

## 5. Presentation (assignment: Deliverable 3)

- [ ] **10-12 slides following the suggested flow:**
  - [ ] 1. The student-service information problem / need
  - [ ] 2. Who experiences it and why it matters
  - [ ] 3. Current information-finding process and limitations
  - [ ] 4. Success measures for the RAG assistant
  - [ ] 5. Proposed CSULB Services RAG solution
  - [ ] 6. Users, user experience, and main features
  - [ ] 7. CSULB information sources and how the assistant uses them
  - [ ] 8. Testing approach, limitations, and key tradeoffs
  - [ ] 9. Expected value and success measures
  - [ ] 10. Live prototype demonstration
  - [ ] 11. Limitations and what production deployment would require
  - [ ] 12. Final recommendation / next steps
- [ ] **12-15 minute presentation.**
- [ ] **3-5 minute live prototype demo**, showing an answer with sources, a clarifying question, a fallback, and an error case.
- [ ] **Every team member speaks meaningfully.**
- [ ] **Presented as a product or consulting team to university decision-makers**, not as students reporting to a professor.
- [ ] **Team can explain each major component in plain language** (knowledge base, small talk, retrieval, spelling correction, fallback, Gemini prompt, contact check). The plain-language explanations are in the prompt log entries.
