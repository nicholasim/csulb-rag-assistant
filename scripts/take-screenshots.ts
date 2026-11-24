/**
 * take-screenshots.ts: opens the running app in Chrome and saves screenshots of each
 * chat state to docs/screenshots/ (desktop and mobile).
 *
 * Run the app first (npm run dev), then:  npm run screenshots
 *
 * The answer, clarifying-question, and fallback screenshots use real Gemini answers.
 * The error screenshot fakes ONE thing: the /api/chat response is replaced with the exact
 * error our API returns when Gemini is rate-limited, because a real outage can't be
 * triggered on demand. Everything else in that screenshot is the real app.
 */
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT_DIR = "docs/screenshots";
const ANSWER_TIMEOUT = 45_000;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, scale: 1, mobile: false },
  { name: "mobile", width: 390, height: 844, scale: 2, mobile: true },
];

async function ask(page: Page, question: string) {
  await page.getByLabel("Ask a question about CSULB services").fill(question);
  await page.keyboard.press("Enter");
}

/** Wait until the assistant finishes (an answer, clarifying question, fallback, or error). */
async function waitForReply(page: Page) {
  await page.locator("[data-slot=progress-steps]").waitFor({ state: "detached", timeout: ANSWER_TIMEOUT });
}

async function shot(page: Page, viewport: string, name: string) {
  const path = `${OUT_DIR}/${viewport}-${name}.png`;
  // caret "initial": don't let Playwright inject a style that hides the text cursor
  // (it caused a harmless hydration warning badge to appear in the dev overlay).
  await page.screenshot({ path, caret: "initial" });
  console.log(`saved ${path}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    // 1. Welcome screen
    await page.goto(BASE_URL);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await shot(page, vp.name, "01-welcome");

    // 1b. Mobile only: the slide-out service menu
    if (vp.mobile) {
      await page.getByRole("button", { name: "Browse services" }).click();
      const sheet = page.locator('[data-slot="sheet-content"]');
      await sheet.waitFor();
      // Wait for the slide-in animation to actually finish (a fixed delay caught it half-way).
      await sheet.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
      await shot(page, vp.name, "01b-menu");
      await page.keyboard.press("Escape");
    }

    // 2. A normal answer with the first source chip opened
    await page.goto(BASE_URL);
    await page.getByRole("button", { name: "How much is a semester student parking permit?" }).click();
    await waitForReply(page);
    const chips = page.getByRole("list", { name: "Sources for this answer" }).getByRole("button");
    if ((await chips.count()) > 0) {
      await chips.first().click();
      await page.getByRole("region", { name: /^Source \d+/ }).waitFor();
      await page.getByRole("region", { name: /^Source \d+/ }).scrollIntoViewIfNeeded();
    } else {
      console.warn(`[${vp.name}] the parking question didn't return sources (Gemini may be down)`);
    }
    await shot(page, vp.name, "02-answer-with-source");

    // 3. Clarifying question
    await page.goto(BASE_URL);
    await ask(page, "How do I apply?");
    await waitForReply(page);
    await shot(page, vp.name, "03-clarifying-question");

    // 4. Fallback, then the "Request this topic" confirmation
    await page.goto(BASE_URL);
    await ask(page, "Where are the nearest taco spots near campus?");
    await waitForReply(page);
    await shot(page, vp.name, "04-fallback");
    const request = page.getByRole("button", { name: "Request this topic" });
    if (await request.count()) {
      await request.click();
      await page.getByText("Thanks, we'll consider adding this topic.").waitFor();
      await shot(page, vp.name, "04b-fallback-topic-requested");
    }

    // 6. Desktop only: answer a clarifying question by clicking an option, then start a new chat
    if (!vp.mobile) {
      await page.goto(BASE_URL);
      await ask(page, "How do I apply?");
      await waitForReply(page);
      const option = page.getByRole("group", { name: "Choose one" }).getByRole("button", { name: /graduation/i });
      if (await option.count()) {
        await option.click();
        await waitForReply(page);
        await shot(page, vp.name, "06-clarify-follow-up");
      }
      await page.getByRole("button", { name: "New chat" }).click();
      await page.getByRole("heading", { level: 1 }).waitFor();
      console.log(`[${vp.name}] "New chat" returned to the welcome screen`);
    }

    // 5. Error (simulated rate limit, see note at the top)
    await page.goto(BASE_URL);
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "rate_limited",
            message: "The assistant is getting too many questions right now. Please wait a minute and try again.",
          },
        }),
      }),
    );
    await ask(page, "When is the add/drop deadline for spring?");
    await waitForReply(page);
    await shot(page, vp.name, "05-error");
    await page.unroute("**/api/chat");

    await context.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
