import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE || "http://localhost:3210";
const OUT = "/tmp/scrappy-shots";
mkdirSync(OUT, { recursive: true });

const TRANSCRIPT =
  "two tomatoes, half a cabbage that's going bad, three eggs, a block of tofu that's going bad, some scallions, and a bowl of leftover rice";

const log = (...a) => console.log("•", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

// The typed-input path uses window.prompt(); answer it with the demo transcript.
page.on("dialog", (d) => d.accept(TRANSCRIPT));

let step = 0;
const shot = async (name) =>
  page.screenshot({ path: `${OUT}/${String(++step).padStart(2, "0")}-${name}.png` });

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByText("What's in your fridge right now?").waitFor();
  await shot("input");
  log("input screen rendered");

  // Type-it-instead → prompt → /api/ingredients (live Claude)
  await page.getByRole("button", { name: "or type it instead" }).click();
  await page.getByText("Sound about right?").waitFor({ timeout: 60000 });
  await shot("confirm");
  // innerText reflects CSS text-transform:uppercase on tags, so compare lower-cased.
  const confirmText = (await page.locator("body").innerText()).toLowerCase();
  log("confirm screen reached");
  for (const want of ["cabbage", "tofu", "going bad", "use soon", "leftover rice"]) {
    if (!confirmText.includes(want)) throw new Error(`confirm missing "${want}"`);
  }
  log("  ✓ ingredients + three-tier freshness present");

  // Generate recipes (live Claude, slower)
  await page.getByRole("button", { name: "Find me recipes" }).click();
  await page.getByText("Raiding your fridge…").waitFor({ timeout: 10000 }).catch(() => {});
  await page
    .getByRole("button", { name: "Let's cook these" })
    .waitFor({ timeout: 120000 });
  await shot("dishes");
  const dishText = (await page.locator("body").innerText()).toLowerCase();
  log("dishes screen reached");
  if (!dishText.includes("uses up")) throw new Error("no rescue tag on dishes");
  log("  ✓ recipe cards with 'Uses up' rescue tags present");

  // Cook
  await page.getByRole("button", { name: "Let's cook these" }).click();
  await page.getByText(/Step 1 of/).waitFor({ timeout: 15000 });
  await shot("cook-step1");
  log("cook screen reached");

  // Walk steps until the finish sheet appears.
  const nextRe = /Next step|Next dish|done/i;
  for (let i = 0; i < 30; i++) {
    const finish = page.getByText("Dinner's handled.");
    if (await finish.isVisible().catch(() => false)) break;
    const btn = page.getByRole("button", { name: nextRe }).last();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await page.waitForTimeout(400);
  }
  await page.getByText("Dinner's handled.").waitFor({ timeout: 15000 });
  await shot("finish");
  log("finish sheet reached");

  console.log("\nRESULT: PASS");
  if (consoleErrors.length) {
    console.log("console errors during run:");
    for (const e of consoleErrors.slice(0, 20)) console.log("  -", e);
  }
} catch (err) {
  await shot("FAILURE");
  console.log("\nRESULT: FAIL —", err.message);
  if (consoleErrors.length) {
    console.log("console errors:");
    for (const e of consoleErrors.slice(0, 20)) console.log("  -", e);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
