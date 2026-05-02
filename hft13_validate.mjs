// HFT-13 browser validation harness using Playwright Chromium.
// Validates: fresh, stale (after backend stop), error (no prior data via fetch
// blocking), loading, plus mobile viewport, freshness chip, metadata, frame
// picker, and Thai/English copy toggle.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "hft13-evidence");

const FRONTEND_URL = "http://localhost:3100/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dumpSidebar(page, label) {
  const text = await page
    .locator('[data-testid="forecast-rainfall-sidebar"]')
    .innerText()
    .catch(() => "<missing>");
  console.log(`\n--- sidebar (${label}) ---\n${text}\n--- end ---\n`);
  return text;
}

async function dumpOverlayCellCount(page) {
  const cells = await page
    .locator('[data-testid="forecast-rainfall-overlay"] [aria-label*="rainfall"], [data-testid="forecast-rainfall-overlay"] [aria-label*="ฝนสะสม"]')
    .count();
  console.log(`overlay cell count: ${cells}`);
  return cells;
}

async function snap(page, name) {
  const out = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`screenshot: ${out}`);
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    viewport: { width: 414, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[console:${t}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

  // ============== 1. LOADING + FRESH ==============
  console.log("\n========== STATE: LOADING (initial nav) ==========");
  // First nav un-throttled to load the JS bundle quickly.
  await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Now intercept the API call with a delay so the loading state is observable
  // when we trigger Refresh.
  await page.unroute("**/api/forecast/frames*").catch(() => null);
  // Wait for the initial render to be done first (load real data).
  await page.waitForSelector('[data-testid="forecast-rainfall-sidebar"]', { timeout: 30000 });
  await page.waitForSelector('button[aria-pressed]', { timeout: 30000 });
  // Now add a 1.5s delay to API and click Refresh to provoke an isFetching state.
  let delayedFulfill = null;
  await page.route("**/api/forecast/frames*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    return route.continue();
  });
  // We rely on 'isFetching' via the spinning RefreshCw icon (animate-spin).
  await page.locator('button[aria-label], button', { hasText: /รีเฟรช|^Refresh$/ }).first().click();
  const spinning = await page
    .locator('.animate-spin')
    .count();
  console.log(`spinner present after refresh click: ${spinning > 0}`);
  await snap(page, "01-loading-refresh-spin");
  // Wait for refresh to complete.
  await page.waitForFunction(() => {
    const el = document.querySelector(".animate-spin");
    return !el;
  }, null, { timeout: 10000 }).catch(() => null);
  await page.unroute("**/api/forecast/frames*").catch(() => null);

  console.log("\n========== STATE: FRESH ==========");
  await page.waitForSelector('[data-testid="forecast-rainfall-sidebar"]', { timeout: 8000 });
  // Wait for at least one frame button to appear.
  await page.waitForSelector('button[aria-pressed]', { timeout: 8000 });
  const sidebarFresh = await dumpSidebar(page, "fresh-th");
  await dumpOverlayCellCount(page);
  await snap(page, "02-fresh-th");

  // Check freshness chip is "fresh" (Thai = "สด").
  const chipFreshTh = sidebarFresh.includes("สด") || sidebarFresh.toLowerCase().includes("fresh");
  console.log(`fresh freshness chip text present (TH/EN): ${chipFreshTh}`);

  // Check metadata shows model run, valid time, attribution, license, retrievedAt.
  const wantTh = ["เวลารันโมเดล", "เวลาที่พยากรณ์", "ผู้ให้ข้อมูล", "เครดิต", "สัญญาอนุญาต", "ดึงข้อมูลเมื่อ"];
  const missingTh = wantTh.filter((s) => !sidebarFresh.includes(s));
  console.log(`metadata fields missing (TH): ${JSON.stringify(missingTh)}`);

  // ============== 2. FRAME PICKER ==============
  console.log("\n========== FRAME PICKER ==========");
  const frameButtons = await page.locator('fieldset button[aria-pressed]').all();
  console.log(`frame picker buttons: ${frameButtons.length}`);
  for (const btn of frameButtons.slice(0, 4)) {
    const t = await btn.innerText();
    console.log(`  - frame button: ${t.replace(/\n/g, " | ")}`);
  }
  if (frameButtons.length >= 2) {
    await frameButtons[1].click();
    await sleep(300);
    const isPressed = await frameButtons[1].getAttribute("aria-pressed");
    console.log(`second-frame aria-pressed after click: ${isPressed}`);
    await snap(page, "03-frame-picker-second");
  }

  // ============== 3. LANGUAGE TOGGLE ==============
  console.log("\n========== LANGUAGE TOGGLE: EN ==========");
  // The header contains a "ไทย" button (when in EN) or "English" button (when in TH).
  await page.locator('button', { hasText: /^English$/ }).first().click();
  await page.waitForSelector('text=Forecast Rainfall (Live)', { timeout: 4000 });
  const sidebarEn = await dumpSidebar(page, "fresh-en");
  await snap(page, "04-fresh-en");
  const wantEn = ["Model run", "Valid time", "Provider", "Attribution", "License", "Retrieved at", "Fresh"];
  const missingEn = wantEn.filter((s) => !sidebarEn.includes(s));
  console.log(`metadata fields missing (EN): ${JSON.stringify(missingEn)}`);

  // ============== 4. STALE STATE ==============
  console.log("\n========== STATE: STALE (backend offline) ==========");
  // Block forecast frames endpoint to simulate backend down (without killing it).
  await page.route("**/api/forecast/frames*", (route) => route.abort("internetdisconnected"));
  // Click Refresh.
  await page.locator('button', { hasText: /^Refresh$/ }).first().click();
  await page.waitForSelector('text=Latest data is older', { timeout: 4000 }).catch(() => null);
  await sleep(500);
  const sidebarStale = await dumpSidebar(page, "stale-en");
  await snap(page, "05-stale-en");
  const staleHasBanner = sidebarStale.includes("Latest data is older") && sidebarStale.includes("Still showing the last successfully retrieved frame.");
  console.log(`stale banner present: ${staleHasBanner}`);
  // Confirm overlay still rendered (cells still visible from prior data).
  const cellsAfterStale = await dumpOverlayCellCount(page);
  console.log(`overlay cells after stale: ${cellsAfterStale}`);

  // ============== 5. ERROR STATE (fresh page load, backend blocked) ==============
  console.log("\n========== STATE: ERROR (no prior data) ==========");
  const page2 = await context.newPage();
  // Block forecast frames before nav so the very first request fails.
  await page2.route("**/api/forecast/frames*", (route) => route.abort("internetdisconnected"));
  await page2.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
  await page2.waitForSelector('[data-testid="forecast-rainfall-sidebar"]', { timeout: 8000 });
  await page2.waitForSelector('text=ไม่สามารถโหลดข้อมูลฝนคาดการณ์, text=Could not load forecast rainfall', { timeout: 4000 }).catch(() => null);
  await sleep(800);
  const sidebarError = await dumpSidebar(page2, "error-th");
  await snap(page2, "06-error-th");
  const errorHasTitle = sidebarError.includes("ไม่สามารถโหลดข้อมูลฝนคาดการณ์") || sidebarError.includes("Could not load forecast rainfall");
  const errorHasRetry = sidebarError.includes("ลองใหม่อีกครั้ง") || sidebarError.includes("Try again");
  console.log(`error title present: ${errorHasTitle}`);
  console.log(`error retry button present: ${errorHasRetry}`);
  // Legend should still be present.
  const legendStill = await page2.locator('text=ระดับความเสี่ยงจากฝนสะสม, text=Rainfall risk legend').count();
  console.log(`legend still rendered in error state: ${legendStill > 0}`);
  await page2.close();

  // ============== 6. SUMMARY ==============
  console.log("\n========== SUMMARY ==========");
  console.log(JSON.stringify({
    fresh: { freshnessChip: chipFreshTh, metadataMissingTH: missingTh, metadataMissingEN: missingEn, frameButtons: frameButtons.length },
    stale: { banner: staleHasBanner, overlayCells: cellsAfterStale },
    error: { title: errorHasTitle, retry: errorHasRetry, legendShown: legendStill > 0 },
  }, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error("HARNESS FAILED:", e);
  process.exit(1);
});
