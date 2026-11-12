/**
 * test-stop-edit.ts: browser tests for the Stop and Edit features, using Playwright + Chrome.
 *
 * 1. Start the app:  npm run dev
 * 2. Run:            npm run test:stop-edit
 *
 * What it checks:
 *   A. Stop mid-load (button and Esc): the request is cancelled, the loading bubble and the
 *      question disappear, no error card, the question is back in the box with the cursor at
 *      the end, and a gray "Stopped" note shows.
 *   B. Edit and resend (real Gemini): editing removes the last question + answer, puts it back
 *      in the box, and the resent question carries no stale history.
 *   C. Edit after a clarifying question (real Gemini): the follow-up is replaced, and the
 *      history sent with the new follow-up still has the original question + clarifying reply.
 * It also saves screenshots of the Stop button and the edit icon (desktop and mobile).
 */
import { chromium, type Page, type Request } from "playwright";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT_DIR = "docs/screenshots";
const ANSWER_TIMEOUT = 90_000;
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const box = (page: Page) => page.getByLabel("Ask a question about CSULB services");

async function send(page: Page, question: string) {
  await box(page).fill(question);
  await page.keyboard.press("Enter");
}

/** Wait for the answer. If Gemini was too busy to answer (error card), say so clearly and stop. */
async function waitForReply(page: Page) {
  await page.getByText("Checking official CSULB pages…").waitFor({ state: "detached", timeout: ANSWER_TIMEOUT });
  if (await page.getByText("No answer this time").count()) {
    console.log("STOPPED: Gemini was too busy to answer (rate-limited/overloaded). Wait a minute and rerun.");
    process.exit(2);
  }
}

/** Hold every /api/chat request open (never answer it), so there's time to press Stop. */
async function holdRequests(page: Page) {
  await page.route("**/api/chat", () => {
    /* never fulfilled: the browser cancels it when Stop is pressed */
  });
}

/** Everything the Stop tests check after stopping. */
async function checkStopped(page: Page, label: string, question: string, aborted: () => boolean) {
  await page.getByText(/^Stopped\./).waitFor({ timeout: 5000 }).catch(() => {});
  // The browser reports the cancelled request a moment after the screen updates, so wait up to 3s.
  for (let i = 0; i < 30 && !aborted(); i++) await page.waitForTimeout(100);
  check(`${label}: request was cancelled`, aborted());
  check(`${label}: loading bubble removed`, (await page.getByText("Checking official CSULB pages…").count()) === 0);
  check(`${label}: no error card`, (await page.getByText("No answer this time").count()) === 0);
  check(`${label}: question removed from chat (back to welcome screen)`, await page.getByRole("heading", { level: 1 }).isVisible());
  const value = await box(page).inputValue();
  check(`${label}: question is back in the box`, value === question, JSON.stringify(value));
  const cursor = await box(page).evaluate((el: HTMLTextAreaElement) => ({
    focused: el === document.activeElement,
    atEnd: el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
  }));
  check(`${label}: cursor is in the box, at the end`, cursor.focused && cursor.atEnd, JSON.stringify(cursor));
  check(`${label}: gray "Stopped" note shows`, await page.getByText(/^Stopped\./).isVisible());
  check(`${label}: send button is back`, await page.getByRole("button", { name: "Send question" }).isVisible());
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });

  // ---------------- Desktop ----------------
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await desktop.newPage();
  const sent: { question: string; history: { role: string; content: string }[] }[] = [];
  page.on("request", (req: Request) => {
    if (req.url().endsWith("/api/chat") && req.method() === "POST") sent.push(JSON.parse(req.postData() ?? "{}"));
  });
  let abortedCount = 0;
  page.on("requestfailed", (req) => {
    if (req.url().endsWith("/api/chat") && /abort/i.test(req.failure()?.errorText ?? "")) abortedCount++;
  });

  await page.goto(BASE_URL);
  await page.getByRole("heading", { level: 1 }).waitFor();

  // A1. Stop with the button
  const q1 = "How much is a semester student parking permit?";
  await holdRequests(page);
  await send(page, q1);
  const stopButton = page.getByRole("button", { name: "Stop" });
  await stopButton.waitFor();
  check("A1: send button turned into a Stop button", await stopButton.isVisible());
  await page.screenshot({ path: `${OUT_DIR}/desktop-07-stop-button.png`, caret: "initial" });
  console.log(`      saved ${OUT_DIR}/desktop-07-stop-button.png`);
  let before = abortedCount;
  await stopButton.click();
  await checkStopped(page, "A1 (Stop button)", q1, () => abortedCount > before);

  // A2. Stop with Esc
  await page.keyboard.press("Enter"); // resend what's in the box
  await stopButton.waitFor();
  before = abortedCount;
  await page.keyboard.press("Escape");
  await checkStopped(page, "A2 (Esc key)", q1, () => abortedCount > before);
  await page.unroute("**/api/chat");

  // B. Edit and resend (real answers)
  sent.length = 0;
  await page.keyboard.press("Enter"); // send the stopped question for real
  await waitForReply(page);
  check("B: first real request has no history (stopped questions were not sent)", sent[0]?.history.length === 0, JSON.stringify(sent[0]?.history));
  const edit = page.getByRole("button", { name: "Edit this question" });
  check("B: exactly one edit button (on the latest question)", (await edit.count()) === 1);
  const hiddenBefore = await edit.evaluate((el) => getComputedStyle(el).opacity);
  await page.locator('[data-slot="bubble-content"]', { hasText: q1 }).hover();
  await page.waitForTimeout(250);
  const shownOnHover = await edit.evaluate((el) => getComputedStyle(el).opacity);
  check("B: edit icon hidden until hover on desktop", hiddenBefore === "0" && shownOnHover === "1", `opacity ${hiddenBefore} -> ${shownOnHover}`);
  await page.screenshot({ path: `${OUT_DIR}/desktop-08-edit-icon.png`, caret: "initial" });
  console.log(`      saved ${OUT_DIR}/desktop-08-edit-icon.png`);
  await edit.click();
  check("B: edit removed the question and answer (back to welcome screen)", await page.getByRole("heading", { level: 1 }).isVisible());
  check("B: edited question is back in the box", (await box(page).inputValue()) === q1);
  sent.length = 0;
  await send(page, "How much is a monthly student parking permit?");
  await waitForReply(page);
  check("B: resent question has no stale history", sent[0]?.history.length === 0, JSON.stringify(sent[0]?.history));
  const monthly = await page.locator('[data-slot="message-scroller-item"]').last().innerText();
  check("B: resent question got its own answer ($57 monthly)", monthly.includes("$57"), monthly.replace(/\s+/g, " ").slice(0, 120));

  // C. Edit after a clarifying question (real answers)
  await page.getByRole("button", { name: "New chat" }).click();
  await send(page, "How do I apply?");
  await waitForReply(page);
  await page.getByRole("group", { name: "Choose one" }).getByRole("button", { name: /graduation/i }).click();
  await waitForReply(page);
  check("C: edit button only on the latest question", (await edit.count()) === 1);
  // Hover the student's "graduation" bubble (not the "Graduation" option button).
  await page.locator('[data-slot="bubble-content"]', { hasText: /^graduation$/ }).hover();
  await edit.click();
  check("C: follow-up is back in the box", (await box(page).inputValue()) === "graduation");
  const items = await page.locator('[data-slot="message-scroller-item"]').count();
  check("C: original question + clarifying reply kept (2 messages)", items === 2, `${items} messages`);
  sent.length = 0;
  await box(page).fill("scholarships");
  await page.keyboard.press("Enter");
  await waitForReply(page);
  const history = sent[0]?.history ?? [];
  const historyText = JSON.stringify(history);
  check("C: history still has 'How do I apply?' and the clarifying reply", history.length === 2 && historyText.includes("How do I apply?") && historyText.includes("Do you mean"), historyText.slice(0, 160));
  check("C: history does NOT contain the edited-away 'graduation' follow-up", !history.some((m) => m.role === "user" && m.content === "graduation"));
  const scholarship = await page.locator('[data-slot="message-scroller-item"]').last().innerText();
  check("C: new follow-up answered about scholarships", /scholarship/i.test(scholarship), scholarship.replace(/\s+/g, " ").slice(0, 120));
  await desktop.close();

  // ---------------- Mobile (mocked replies, to save Gemini quota) ----------------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const phone = await mobile.newPage();
  await phone.goto(BASE_URL);
  await phone.getByRole("heading", { level: 1 }).waitFor();
  await holdRequests(phone);
  await send(phone, "How much is a semester student parking permit?");
  await phone.getByRole("button", { name: "Stop" }).waitFor();
  await phone.screenshot({ path: `${OUT_DIR}/mobile-07-stop-button.png`, caret: "initial" });
  console.log(`      saved ${OUT_DIR}/mobile-07-stop-button.png`);
  await phone.getByRole("button", { name: "Stop" }).tap();
  await phone.unroute("**/api/chat");
  await phone.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        type: "answer",
        answer: "A student semester parking permit is $259 [1].",
        sources: [{ id: 1, title: "Permit Fee Schedule (2026-27)", url: "https://www.csulb.edu/parking-and-transportation-services/permit-fee-schedule-2026-27", category: "Parking & Transportation", excerpt: "Student Semester, FY26/27: $259" }],
        suggestion: null,
        model: "mocked",
      }),
    }),
  );
  await phone.keyboard.press("Enter");
  await waitForReply(phone);
  const phoneEdit = phone.getByRole("button", { name: "Edit this question" });
  const phoneOpacity = await phoneEdit.evaluate((el) => getComputedStyle(el).opacity);
  check("Mobile: edit icon always visible on touch screens", phoneOpacity === "1", `opacity ${phoneOpacity}`);
  await phone.screenshot({ path: `${OUT_DIR}/mobile-08-edit-icon.png`, caret: "initial" });
  console.log(`      saved ${OUT_DIR}/mobile-08-edit-icon.png`);
  await mobile.close();

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
