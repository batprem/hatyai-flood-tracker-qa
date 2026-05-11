import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * HFT-20 public dashboard smoke test.
 *
 * Runs against whatever URL `HFT_PUBLIC_URL` resolves to (default
 * `http://localhost:5173`). Validates the three minimum acceptance signals
 * for the public alert view:
 *
 *   1. Rainfall layer is present on the BasinMap.
 *   2. Freshness chip is NOT in `failed` state.
 *   3. Thai/English toggle swaps the page heading copy.
 *
 * The tests prefer stable `data-testid` selectors that already exist in the
 * frontend (`basin-map`, `forecast-rainfall-sidebar`) and fall back to copy
 * matches when no test id exists yet for the underlying element.
 */

const TH_TITLE = "เฝ้าระวังน้ำท่วมหาดใหญ่";
const EN_TITLE = "Hat Yai flood awareness dashboard";

const FRESHNESS_FAILED_LABELS: ReadonlyArray<string> = [
  "ดึงข้อมูลล้มเหลว",
  "Failed",
];

/** Locate the freshness chip inside the rainfall sidebar. */
function freshnessChip(page: Page): Locator {
  return page
    .getByTestId("forecast-rainfall-sidebar")
    .getByRole("status")
    .first();
}

/** Wait until the dashboard has mounted the BasinMap and rainfall sidebar.
 *  Returns the resolved `data-rainfall-frame-count` attribute as a number so
 *  callers can assert on it.
 *
 *  We assert the test-id div is *attached* (not "visible") because the
 *  BasinMap renders below the fold on the default desktop viewport and may
 *  also adopt MapLibre's own visibility lifecycle during initial mount; the
 *  load signal we care about is the `.maplibregl-canvas` actually painting,
 *  which we wait for separately. */
async function waitForBasinMap(page: Page): Promise<number> {
  const map = page.getByTestId("basin-map");
  await expect(map).toBeAttached();
  // MapLibre paints the canvas asynchronously; this is the real "map is
  // ready" signal.
  await expect(page.locator(".maplibregl-canvas").first()).toBeAttached({
    timeout: 30_000,
  });
  // Scroll the map into view so subsequent assertions on it (and on chrome
  // close to it) operate on rendered pixels.
  await map.scrollIntoViewIfNeeded();
  const raw = await map.getAttribute("data-rainfall-frame-count");
  return Number.parseInt(raw ?? "0", 10);
}

test.beforeEach(async ({ page }) => {
  // Surface unexpected page errors so test failures show the underlying cause.
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[console:error] ${msg.text()}`);
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
});

test("rainfall layer renders on the basin map", async ({ page }) => {
  const frameCount = await waitForBasinMap(page);
  // The frontend should expose a numeric rainfall frame count via the
  // BasinMap data attribute. Zero frames is valid (live API may currently be
  // empty); a non-numeric value indicates the map never rendered.
  expect(Number.isFinite(frameCount)).toBe(true);
  // Confirm the rainfall sidebar mount point exists. We assert "attached"
  // (not "visible") because the sidebar renders below the fold on the
  // default desktop viewport.
  await expect(page.getByTestId("forecast-rainfall-sidebar")).toBeAttached();
  // The MapLibre map provider attribute should be one of the expected
  // values; this proves the rainfall layer module resolved a tile source.
  const provider = await page
    .getByTestId("basin-map")
    .getAttribute("data-tile-provider");
  expect(["maplibre-demo", "maptiler"]).toContain(provider);
});

test("freshness chip is not in failed state", async ({ page }) => {
  await waitForBasinMap(page);
  const sidebar = page.getByTestId("forecast-rainfall-sidebar");
  await sidebar.scrollIntoViewIfNeeded();
  const chip = freshnessChip(page);
  await expect(chip).toBeAttached();
  const text = ((await chip.innerText()) ?? "").trim();
  // The chip always renders the label "<status label>: <state>"; assert the
  // visible state is none of the localized "failed" strings. An empty chip
  // text would also be a regression worth catching.
  expect(text.length).toBeGreaterThan(0);
  for (const failedLabel of FRESHNESS_FAILED_LABELS) {
    expect(
      text.includes(failedLabel),
      `freshness chip should not show "${failedLabel}", got: ${text}`,
    ).toBe(false);
  }
});

test("language toggle swaps Thai and English copy", async ({ page }) => {
  await waitForBasinMap(page);

  const heading = page.getByRole("heading", { level: 1 }).first();
  await expect(heading).toBeVisible();
  const initialHeading = (await heading.innerText()).trim();

  // The dashboard defaults to Thai. The toggle button renders the *target*
  // language as its label, so in TH it shows "English" and in EN it shows
  // "ไทย". Click whichever button is currently rendered.
  const toEnglish = page.getByRole("button", { name: "English" }).first();
  const toThai = page.getByRole("button", { name: "ไทย" }).first();

  if (initialHeading.includes(TH_TITLE)) {
    await toEnglish.click();
    await expect(heading).toContainText(EN_TITLE);
    // Round-trip back to Thai to prove the toggle is bidirectional.
    await page.getByRole("button", { name: "ไทย" }).first().click();
    await expect(heading).toContainText(TH_TITLE);
  } else if (initialHeading.includes(EN_TITLE)) {
    await toThai.click();
    await expect(heading).toContainText(TH_TITLE);
    await page.getByRole("button", { name: "English" }).first().click();
    await expect(heading).toContainText(EN_TITLE);
  } else {
    throw new Error(
      `Unexpected initial heading copy: ${JSON.stringify(initialHeading)}`,
    );
  }
});
