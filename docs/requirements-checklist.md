# Requirements Checklist: CSULB Services RAG Assistant

Built from the assignment handout (`docs/is300 capstone.pdf`) and our Solution Design Brief (`docs/IS300 – Solution Design Brief.pdf`). Updated at the end of every phase, together with `docs/prompt-log.md`.

**Last updated:** 2026-11-11, after Phase 2 (commit `00cae20`)

**Legend:** `[x]` done (with where) · `[ ]` not done yet. Items that are partly done stay unchecked, with a "Partly:" note saying what's left.

---

## 1. Prototype (assignment: Required Prototype Capabilities)

- [ ] **Browser-based chat / Q&A interface.** Planned for Phase 3.
- [x] **Knowledge base with at least 5 official CSULB sources.** 17 pages in `knowledge/`, copied word for word from csulb.edu and asicsulb.org by `scripts/fetch-sources.ts` (commits `8df0c0a`, `dcd1b5b`).
- [x] **Sources cover multiple student-service areas.** 13 categories: Enrollment, Financial Aid, Tuition, Academic Advising, Parking & Transportation, Career, Library, Tech Help Desk, Health, Food, International, Bookstore, Orientation (`knowledge/*.md` headers).
- [x] **Retrieval happens before the AI generates an answer.** `lib/rag.ts` step 2 (BM25 search in `lib/retrieval.ts`) runs before `askGemini` (commit `00cae20`).
- [x] **Retrieved passages are given to the LLM as context.** `buildInput()` in `lib/rag.ts`; Gemini is told to use only those sources (`lib/gemini.ts`, commit `00cae20`).
- [ ] **Source name, citation, or excerpt shown to the user.** Partly: the API returns `sources` (title, url, excerpt) and the answers use [1] citations (commit `00cae20`). The source chips in the UI are planned for Phase 3.
- [ ] **Clear "not enough information" fallback.** Partly: the API returns exactly "I do not have enough information in the provided CSULB sources." (`lib/gemini.ts` `FALLBACK_SENTENCE`; tested in prompt log Entry 3). It still needs to be shown in the UI (Phase 3).
- [ ] **At least 10 test questions: answerable, ambiguous, and unsupported.** Partly: 6 were tested by hand from the terminal (prompt log Entry 3). `tests/test-questions.json` (12+ questions) and the test script are planned for Phase 4.
- [ ] **At least one meaningful error or invalid-case demo.** Partly: the API returns friendly errors for an empty question, a question over 500 characters, a missing API key, Gemini rate limits, and Gemini outages (`app/api/chat/route.ts`, `lib/gemini.ts`; tested in Entry 3). It still needs to be demo-able in the UI (Phases 3 and 4).
- [x] **API key not in source code or GitHub.** The key lives only in `.env.local`, which git ignores (`.gitignore` line 34). A scan of every commit found no key. The key is read only on the server, in `lib/gemini.ts`, and is never logged.
- [ ] **Deployed web app (Vercel) for the live demo.** Not started. `next.config.ts` already bundles `knowledge/` for Vercel (commit `00cae20`). `GEMINI_API_KEY` must be added in the Vercel project settings.

## 2. Prompt log (assignment: Vibe Coding Expectations)

- [ ] **At least 5 meaningful prompt iterations.** Partly: 3 so far (`docs/prompt-log.md` Entries 1-3).
- [x] **At least 2 cases where the AI's solution didn't work, and how we fixed or redirected it.** Entry 3: Gemini overload (fixed with a backup model) and an invented email address (fixed with a contact-detail check), plus four more. Entry 2: our redirection on the incomplete Advising page and the swapped map source.
- [ ] **"Who" filled in on every entry.** Team to fill in.
- [ ] **Screenshot / commit filled in on every entry.** Team to fill in (commits: Entry 1 = `8df0c0a`, Entry 2 = `dcd1b5b`, Entry 3 = `00cae20`).

## 3. Design brief features

### Chat experience
- [ ] **Welcome message with clickable example questions** (brief: Onboarding, "Should"). Phase 3.
- [ ] **Sidebar with service categories as quick-select buttons** (brief: UI Sketch). Phase 3. The category names already exist in the `knowledge/` headers.
- [ ] **Source chips under every answer; clicking one shows the excerpt and a link to the CSULB page** (brief: Display source, "Must"). Partly: the API provides the data (commit `00cae20`); UI in Phase 3.
- [ ] **Loading state, mobile-friendly layout, CSULB black and gold look.** Phase 3.
- [ ] **Follow-up after a clarifying question works** (e.g., "How do I apply?" then "graduation"). Partly: the API accepts `history` (`lib/rag.ts`). The UI needs to send it (Phase 3), and it hasn't been tested yet.

### Answer behavior
- [x] **Clarifying question for ambiguous asks** ("How do I apply?" -> "Do you mean admission, scholarships, graduation, financial aid, or something else?"). Rule in `lib/gemini.ts`; passed test 3 in Entry 3.
- [x] **Unsupported questions get the fallback and point to the right department page.** `lib/rag.ts` `fallback()`; passed tests 4-6 in Entry 3 (tacos -> Eat and Shop, study room -> Library Services).
- [x] **Map / "getting around" questions point to https://www.csulb.edu/maps.** `lib/gemini.ts` and `lib/rag.ts`; tested in Entry 3.
- [x] **Advising: name the center and give its Contact & Location link; never make up phone numbers or emails.** Prompt rule plus the contact-detail check (`removeUnverifiedDetails` in `lib/rag.ts`); tested in Entry 3.
- [ ] **Conflicting sources: show both values and say to confirm with the office.** Partly: prompt rule in `lib/gemini.ts`. It works for "When is the add/drop deadline for spring?" but not for "last day to drop without a W" (Entry 3, issue 6). Retest on `gemini-3.8-flash`.
- [ ] **No medical, legal, or financial advice.** Partly: rule in the system prompt (`lib/gemini.ts`). Not tested yet; add a test question in Phase 4.
- [ ] **Never asks for personal information.** Partly: rule in the system prompt (`lib/gemini.ts`). Not tested yet; add a test question in Phase 4.

### Privacy (brief: Privacy & Appropriate Use)
- [x] **Index only public, official university information.** `knowledge/` holds only the approved public CSULB/ASI pages.
- [x] **Don't store student data; keep logs anonymous.** `store: false` on every Gemini call (`lib/gemini.ts`). Server logs record only error types and status codes, never the question text.

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
- [ ] **Basic Student Support.** No dedicated source yet; Basic Needs is only mentioned in passing on the food and parking pages. Decide: add a source (e.g., the CSULB Basic Needs page) or drop it from the list.
- Extra areas from our user stories: Tuition / Payments, International Students, Bookstore (Day 1), Orientation (SOAR) are covered. Instructor ratings are intentionally unanswerable.

### Brief items that need a team decision
- [ ] **"Option to write a claim"** (brief: Handling Unsupported Questions). Not planned yet. Decide whether to build it (e.g., a "Suggest this question" button) or remove it from the brief and slides.
- [ ] **"Integration of student experiences and reviews where relevant"** (brief: workflow step 4b and CSULB Sources). Not planned. It conflicts with "official sources only". Decide whether to drop it or describe it as future work.

## 4. Accuracy

- [ ] **Answers match the live CSULB pages.** Partly: the knowledge base was copied word for word from the live pages on 2026-11-11, and every answer cites its source. Before the presentation, re-run `npm run fetch-sources` and check `git diff knowledge/` for any page changes.
- [x] **Contact details in answers are checked against the sources.** `removeUnverifiedDetails` in `lib/rag.ts` (added after the invented-email bug, Entry 3).
- [ ] **Every test question has an expected fact that the test script checks** (e.g., "$259", "Ignacio Castor", the exact fallback sentence). Phase 4.
- [ ] **100% of unsupported test questions get the fallback** (brief: Success Measures). Partly: 3 of 3 passed in the manual test (Entry 3); the full suite comes in Phase 4.
- [ ] **Test results recorded as a table** (question, type, expected, actual, pass/fail) for the presentation. Phase 4.
- [ ] **Known source quirks handled or explained:** the Feb. 2 vs Feb. 3 drop date, the Motorcycle permit price ($129 -> $140 despite the fee freeze), and outdated Spring 2026 dates on the Day 1 page.

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
- [ ] **Team can explain each major component in plain language** (knowledge base, retrieval, fallback, Gemini prompt, contact check). The plain-language explanations are in the prompt log entries.
