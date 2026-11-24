/**
 * check-copy-text.ts: offline check of the text the "Copy answer" button copies (Entry 32).
 *
 *   npm run check:copy
 */
import { plainTextForCopy } from "../lib/copy-text";

const answer =
  "A student semester parking permit is **$259** [1]. You can buy it online through the [Parking Portal](https://csulb.t2hosted.com/) [1, 2].\n\n- Daily permits are $15 [2].\n* Monthly permits are *$57* [2].";
const sources = [
  { title: "Permit Fee Schedule (2026-27)", url: "https://www.csulb.edu/parking-and-transportation-services/permit-fee-schedule-2026-27" },
  { title: "Permit Information & Regulations", url: "https://www.csulb.edu/parking-and-transportation-services/permit-information" },
];
const expected = [
  "A student semester parking permit is $259. You can buy it online through the Parking Portal (https://csulb.t2hosted.com/).",
  "",
  "- Daily permits are $15.",
  "- Monthly permits are $57.",
  "",
  "Sources:",
  "1. Permit Fee Schedule (2026-27) - https://www.csulb.edu/parking-and-transportation-services/permit-fee-schedule-2026-27",
  "2. Permit Information & Regulations - https://www.csulb.edu/parking-and-transportation-services/permit-information",
].join("\n");

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
};
const got = plainTextForCopy(answer, sources);
check("whole copied text matches", got === expected, got === expected ? "" : `\n---got---\n${got}\n---expected---\n${expected}`);
check("no [n] citation markers left", !/\[\d+(\s*,\s*\d+)*\]/.test(got));
check("no Markdown symbols left", !/\*\*|\]\(/.test(got));
check("inline link keeps its address", got.includes("Parking Portal (https://csulb.t2hosted.com/)"));
check("no sources means no Sources list", plainTextForCopy("Hello [1].", []) === "Hello.");

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: the copy button copies clean text plus a Sources list");
