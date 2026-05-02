// Follow-up: re-verify EN metadata (case-insensitive) + legend in error state.
import { chromium } from "playwright";

const FRONTEND_URL = "http://localhost:3100/";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 414, height: 900 },
  isMobile: true,
});
const page = await context.newPage();

await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="forecast-rainfall-sidebar"]');
await page.waitForSelector('button[aria-pressed]');

// Toggle EN.
await page.locator('button', { hasText: /^English$/ }).first().click();
await page.waitForSelector('text=Forecast Rainfall (Live)');

const sidebar = (await page.locator('[data-testid="forecast-rainfall-sidebar"]').innerText()).toLowerCase();
const wantEn = ["model run", "valid time", "provider", "attribution", "license", "retrieved at", "fresh"];
const missing = wantEn.filter((s) => !sidebar.includes(s));
console.log(`EN metadata missing (case-insensitive): ${JSON.stringify(missing)}`);

// Error-state legend check.
const page2 = await context.newPage();
await page2.route("**/api/forecast/frames*", (r) => r.abort("internetdisconnected"));
await page2.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
await page2.waitForSelector('[data-testid="forecast-rainfall-sidebar"]');
await new Promise((r) => setTimeout(r, 1500));
// Look for legend by Thai or English title text.
const legendThaiCount = await page2.getByText("ระดับความเสี่ยงจากฝนสะสม").count();
const legendEnglishCount = await page2.getByText("Rainfall risk legend").count();
console.log(`legend titles found: th=${legendThaiCount} en=${legendEnglishCount}`);

// Also check the error-state page sidebar contains the error title and legend block sibling.
const fullText = (await page2.locator("main").innerText()).toLowerCase();
console.log(`page contains 'ระดับความเสี่ยง' (legend Thai): ${fullText.includes("ระดับความเสี่ยงจากฝนสะสม")}`);
console.log(`page contains 'rainfall risk legend' (en fallback): ${fullText.includes("rainfall risk legend")}`);

await browser.close();
