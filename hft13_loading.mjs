// Verify the loading state: provoke isFetching by intercepting the API with a delay
// and observe the loadingDetail text and disabled refresh button.
import { chromium } from "playwright";

const FRONTEND_URL = "http://localhost:3100/";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 414, height: 900 },
  isMobile: true,
});
const page = await context.newPage();

// Intercept the very first request with a 2-second delay so we can catch the
// loading phase between mount and first response.
await page.route("**/api/forecast/frames*", async (route) => {
  await new Promise((r) => setTimeout(r, 2000));
  return route.continue();
});

await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
// Wait for the root sidebar element so we know the panel mounted.
await page.waitForSelector('[data-testid="forecast-rainfall-sidebar"]');

// During the 2s wait, the overlay should show the "loading" badge.
const loadingThai = await page.getByText("กำลังโหลดข้อมูลฝนคาดการณ์").count();
const loadingThaiDetail = await page.getByText("เชื่อมต่อบริการพยากรณ์...").count();
console.log(`loading badge (TH overlay): ${loadingThai}`);
console.log(`loading detail (TH sidebar): ${loadingThaiDetail}`);

// Refresh button should be disabled while loading.
const refreshBtn = page.locator('button', { hasText: /รีเฟรช|^Refresh$/ }).first();
const disabled = await refreshBtn.isDisabled();
console.log(`refresh button disabled while loading: ${disabled}`);

await page.screenshot({ path: "/Users/premchotipanit/Documents/hatyai-flood-warning/qa/hft13-evidence/00-loading-th.png", fullPage: true });

await browser.close();
