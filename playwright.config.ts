import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Hat Yai flood warning public dashboard
 * smoke test.
 *
 * The target URL is taken from `HFT_PUBLIC_URL`. Local runs default to the
 * Bun dev server (`bun --hot src/index.tsx` in `frontend/`, port 5173).
 * Staging runs export `HFT_PUBLIC_URL=https://<vercel-url>` before invoking
 * `bunx playwright test`.
 *
 * Keep the config small so the QA agent can drop new specs into `qa/tests/`
 * without rewiring the harness.
 */
const baseURL: string =
  process.env.HFT_PUBLIC_URL?.trim() || "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
