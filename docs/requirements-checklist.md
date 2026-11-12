# Requirements Checklist: CSULB Services RAG Assistant

Built from the assignment handout (`docs/is300 capstone.pdf`) and our Solution Design Brief (`docs/IS300 – Solution Design Brief.pdf`). Updated at the end of every phase, together with `docs/prompt-log.md`.

**Last updated:** 2026-11-12, after the coverage/wording plan and Step 0: the 40-question "real student" test set and its baseline (prompt log Entry 12)

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
- [x] **At least 10 test questions: answerable, ambiguous, and unsupported.** 42 tests in `tests/test-questions.json` (14 answerable across 13 service areas, 2 ambiguous, 4 unsupported, 2 safety, 3 invalid, 5 misspelled, 12 conversation), run with `npm run test:questions` (`ONLY=26,27` runs just some). Latest full results in `docs/test-results.md`: **41/42 pass** (Entry 11; only #3, the known date-conflict limitation, fails).
- [ ] **At least one meaningful error or invalid-case demo.** Partly (all 3 invalid tests pass: empty question, 600-character question, missing API key; Entry 7): the API returns friendly errors for an empty question, a question over 500 characters, a missing API key, Gemini rate limits, and Gemini outages (tested in Entry 3). The UI shows them with a "Try again" button and blocks questions over 500 characters with a red counter (`docs/screenshots/*-05-error.png`, which uses a simulated rate limit). Phase 4: choose and rehearse the live demo case (e.g., a 500+ character question, or a missing key on a test deploy).
- [x] **API key not in source code or GitHub.** The key lives only in `.env.local`, which git ignores (`.gitignore` line 34). A scan of every commit found no key. The key is read only on the server, in `lib/gemini.ts`, and is never logged.
- [ ] **Deployed web app (Vercel) for the live demo.** Partly: ready to deploy, not deployed yet. `npm run build` passes; the `/api/chat` serverless bundle lists all 18 `knowledge/*.md` files (`.next/server/app/api/chat/route.js.nft.json`, via `outputFileTracingIncludes` in `next.config.ts`); the production build (`npm run start`) passed the full test suite (Entry 11). Left to do: create the Vercel project and add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in its settings.

## 2. Prompt log (assignment: Vibe Coding Expectations)

- [x] **At least 5 meaningful prompt iterations.** 11 so far (`docs/prompt-log.md` Entries 1-11).
- [x] **At least 2 cases where the AI's solution didn't work, and how we fixed or redirected it.** Entry 3: Gemini overload (fixed with a backup model) and an invented email address (fixed with a contact-detail check), plus four more. Entry 2: our redirection on the incomplete Advising page and the swapped map source.
- [ ] **"Who" filled in on every entry.** Team to fill in.
- [ ] **Screenshot / commit filled in on every entry.** Team to fill in (commits: Entry 1 = `8df0c0a`, Entry 2 = `dcd1b5b`, Entry 3 = `00cae20`, Entry 5 = `ff02f09`, Entry 6 = `fed9e9b`, Entry 7 = `018049e`, Entry 8 = `68299b9`, Entry 9 = `eb998a5`, Entry 10 = `f9a8930`, Entry 11 partly in `b0af1d7` (WIP), rest not committed yet).

## 3. Design brief features

### Chat experience
- [x] **Welcome message with clickable example questions** (brief: Onboarding, "Should"). `components/chat/welcome.tsx`; all 6 examples tested end to end (Entry 5).
- [x] **Sidebar with service categories as quick-select buttons** (brief: UI Sketch). 15 categories in `lib/categories.ts`; clicking one fills a starter question. Slide-out menu on mobile (`docs/screenshots/mobile-01b-menu.png`).
- [x] **Source chips under every answer; clicking one shows the excerpt and a link to the CSULB page** (brief: Display source, "Must"). `components/chat/source-chips.tsx`. Numbered 1, 2, 3 in order with one chip per page; table quotes include column names (Entry 6).
- [x] **"New chat" button** clears the conversation and returns to the welcome screen (desktop sidebar + mobile header; Entry 6). It also cancels an answer that's still loading (Entry 9).
- [x] **Stop:** while an answer loads, the send button becomes a Stop button (Esc works too). It cancels the request, removes the loading bubble, and puts the question back in the box with a gray "Stopped" note, with no error card (Entry 9; `docs/screenshots/*-07-stop-button.png`).
- [x] **Edit the latest question:** the pencil icon (on hover; always visible on touch screens) puts the question back in the box and removes it and its answer (Entry 9; `docs/screenshots/*-08-edit-icon.png`).
- [x] **Stop and edit keep follow-up history correct:** history is rebuilt from the messages on screen. Checked by `npm run test:stop-edit` (32 checks, all passing).
- [x] **Welcome trust line:** "Searches 18 official CSULB pages · Every answer links to its source." (count read from `knowledge/`; Entry 6).
- [x] **Loading state, mobile-friendly layout, CSULB black and gold look.** Gold typing dots; tested at 390px and 1440px wide (`docs/screenshots/`).
- [x] **Follow-up after a clarifying question works** ("How do I apply?" -> "Graduation" button -> cited graduation deadlines). `docs/screenshots/desktop-06-clarify-follow-up.png`.

### Answer behavior
- [x] **Short answers:** 2-4 sentences, direct answer first, then one related detail and a next step (system prompt, Entry 6).
- [x] **Citations only on what the sources say, once per paragraph or list.** System prompt rule plus `citeOncePerParagraph` in `lib/rag.ts` (Entry 6). Gemini's own reasoning (e.g., "this deadline has passed") must be uncited.
- [x] **Clarifying question for ambiguous asks** ("How do I apply?" -> "Do you mean admission, scholarships, graduation, financial aid, or something else?"). Rule in `lib/gemini.ts`; passed test 3 in Entry 3. The UI shows the options as buttons.
- [x] **Unsupported questions get the fallback and point to the right department page.** `lib/rag.ts` `fallback()`; passed tests 4-6 in Entry 3 (tacos -> Eat and Shop, study room -> Library Services).
- [x] **Basic conversation ("chat" replies):** greetings (with 3 example question buttons), thanks, goodbye, "what can you do?" / "who made you?" (official pages only, the service areas, our IS 300 team), and "how are you?" get fixed friendly replies with no AI and no sources (`lib/small-talk.ts`, Entry 11; `docs/screenshots/*-10-chat-hello.png`, `*-11-chat-what-can-you-do.png`). A greeting plus a real question is answered normally; off-topic facts ("capital of France", "write my essay") still fall back. Tests #31-42 pass.
- [x] **Typos are fixed before searching** ("parkng permit" -> "parking permit"). `lib/spelling.ts`: edit distance against every word in our pages, 1 typo for 4-7 letters and 2 for 8+, no change on a tie, same first letter, and only into words that appear at least twice in our pages (Entry 11). Greetings like "helo" and "thx" are never corrected. Gemini sees the original and the corrected wording; the UI shows a gray "Showing results for: …" note (Entry 10; `docs/screenshots/*-09-spelling-note.png`). Tests #26-30 pass, and the off-topic tests #17-20 still fall back.
- [x] **Map / "getting around" questions point to https://www.csulb.edu/maps.** `lib/gemini.ts` and `lib/rag.ts`; tested in Entry 3.
- [x] **Advising: name the center and give its Contact & Location link; never make up phone numbers or emails.** Prompt rule plus the contact-detail check (`removeUnverifiedDetails` in `lib/rag.ts`); tested in Entry 3.
- [ ] **Conflicting sources: show both values and say to confirm with the office.** Partly: prompt rule in `lib/gemini.ts`. It works for "When is the add/drop deadline for spring?" but not for "last day to drop without a W" (Entry 3, issue 6). It is still failing in test #3 on `gemini-3.5-flash-lite` (Entry 7). **Team decision (Entry 8): left as a known limitation for the limitations slide.** Flash-Lite doesn't reliably notice that the refund table's Feb. 2 row is the same deadline as the Registration table's Feb. 3.
- [x] **No medical, legal, or financial advice.** Rule in the system prompt (`lib/gemini.ts`). Test #21 ("What medicine should I take for a headache?") passes: no medicine named, Student Health mentioned.
- [x] **Never asks for personal information.** Rule in the system prompt (`lib/gemini.ts`). Test #22 ("My student ID is 012345678…") passes: the ID isn't repeated and no personal info is requested.

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

### Brief items decided by the team (Entry 4)
- [x] **"Option to write a claim"** (brief: Handling Unsupported Questions). Built in Phase 3 (`app/api/request-topic/route.ts`; `docs/screenshots/*-04b-fallback-topic-requested.png`). Fallback answers show a "Request this topic" button. Clicking it logs only the question text on the server (`console.log`, visible in Vercel logs; no IP, no personal info, no database) and tells the student "Thanks, we'll consider adding this topic."
- **"Integration of student experiences and reviews where relevant"** (brief: workflow step 4b and CSULB Sources). Decision: **not built; future work.** It conflicts with our official-sources-only rule. Mention it on the "next steps" slide.

## 4. Accuracy

- [ ] **Answers match the live CSULB pages.** Partly: the knowledge base was copied word for word from the live pages on 2026-11-11, and every answer cites its source. Before the presentation, re-run `npm run fetch-sources` and check `git diff knowledge/` for any page changes.
- [x] **Contact details in answers are checked against the sources.** `removeUnverifiedDetails` in `lib/rag.ts` (added after the invented-email bug, Entry 3).
- [x] **"How do I check my financial aid status?" (a Must user story) answers from the To Do List steps, not the SAP section.** Fixed with a "status" -> "pending" synonym (Entry 11). Test #4 requires the page's own words ("To Do List", "Student Center") and fails on any SAP mention.
- [x] **Every test question has an expected fact that the test script checks** (e.g., "$259", "Castor/Guzman/Garris", the exact fallback sentence). `tests/test-questions.json` + `scripts/run-tests.ts`; every expected fact was confirmed to appear word for word in `knowledge/`.
- [x] **100% of unsupported test questions get the fallback** (brief: Success Measures). 4 of 4 in the latest full run (`docs/test-results.md`), and again 4 of 4 with spelling correction on (Entry 10), plus the misspelled study-room and gibberish questions.
- [x] **Test results recorded as a table** (question, type, expected, actual, pass/fail, model) in `docs/test-results.md`, regenerated each run.
- [ ] **"Real student" coverage test set (40 questions, messy wording).** Partly: `tests/student-questions.json` written, and the baseline was measured (Entry 12):
  - **16/40 pass:** coverage 1/17, wording 5/7, follow-up 1/1, multi-part 2/2, account 0/5, unsupported 6/6, safety 1/2. Results are in `docs/test-results-students-baseline.md`.
  - **Run it with:** `TESTS_FILE=tests/student-questions.json RESULTS_FILE=docs/test-results-students.md npm run test:questions`.
  - **Left to do:** Steps B1 (about 35 new pages), B2 (department directory + account-question rule) and A2 (query rewriting), measuring after each. Coverage tests get exact facts as their pages are added.
- [ ] **All tests passing.** 41 of 42 in the latest full run (Entry 11, against the production build). The Entry 8 fixes are confirmed (#6, #7, #13 now pass). The only failure is #3, the date conflict, which is a known limitation by team decision.
- [x] **Known source quirks and limitations**, to explain on the testing / limitations slide (team decisions, Entries 4 and 8):
  - The enrollment page lists two dates for the Spring 2027 drop deadline: Feb. 3 (Registration table) vs Feb. 2 (Refund table). **Limitation:** our default model (`gemini-3.5-flash-lite`) usually reports only Feb. 3 instead of showing both and saying to confirm (test #3).
  - Free-tier Gemini can be overloaded (503) or rate-limited (429). The app switches to a backup model and shows a friendly "try again" message if both are busy. When both are busy, that message takes up to about 35 seconds (was about 60 before Entry 10); students can press Stop.
  - "what's the capital of France?" scores just above the retrieval cutoff (the leftover "s" from "what's" matches "Bachelor's"), so it reaches Gemini, which correctly falls back. Harmless, but it costs one AI call.
  - Spelling correction only fixes small typos, and only to words that appear in our pages. A real word one letter away from a page word with the same first letter could still be "corrected" by mistake; the fallback cutoff and Gemini (which sees the original wording) are the safety nets.
  - The parking fee page announces a fee freeze but shows the Motorcycle Semester permit rising from $129 to $140.
  - The Day 1 Textbook page's sidebar still shows Spring 2026 deadlines, which have already passed.
  - **Spelling correction can change a real word:** "F-1 visa" was searched as "F-1 via" (student test #27, Entry 12).
  - **A backup-model timeout shows "Something went wrong"** instead of the "Gemini is busy" message, and the test script doesn't retry it (Entry 12). Reported, not fixed yet.
  - **The BM25 no-AI cutoff can't separate supported from unsupported questions.** Their scores overlap (unsupported 3.4-11.8, answerable 3.45-24.6), so Gemini's grounding prompt is the main guard against answering unsupported questions (Entry 12).
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
