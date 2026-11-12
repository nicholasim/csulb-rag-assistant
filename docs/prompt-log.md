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
  - **Academic Advising is incomplete.** The page loads advising centers in batches behind a "Load More" button. Only the first batch (15 centers, ending at English) was captured. Four more batches (35 centers, including Business, Engineering, Natural Sciences, and Arts) live at `?page=1` to `?page=4`.
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

## Entry 2

**Date:**
**Who:**
**Tool:** Claude Code (VS Code)

**Prompt:**
> 

**What the AI did:**

**Did it work?**

**Troubleshooting or redirection (if any):**

**Screenshot / commit:**

---

<!-- Copy an entry block above for each new prompt -->
