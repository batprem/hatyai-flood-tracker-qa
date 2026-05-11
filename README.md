# QA Workspace

This directory is the working area for the `QA` agent.

Use it for validation tooling that should not live in `frontend/` or `backend/`, such as Playwright checks, acceptance-test scripts, fixtures, and temporary QA reports.

## Guidelines

- Validate Jira cards that are in `Review`.
- Add a Jira comment with validation evidence before moving a card.
- Move a card from `Review` to `Done` only when the acceptance criteria pass.
- Move a card from `Review` to `Blocked` after commenting with the blocking evidence.
- Keep generated reports, traces, screenshots, videos, and `node_modules/` out of git.

## Current Tooling

- `playwright` + `@playwright/test` for browser-based validation.
- `playwright.config.ts` + `tests/dashboard.smoke.spec.ts` — public dashboard smoke test (HFT-20).
- `hft13_*.mjs` — older one-off Playwright harnesses kept for evidence reproduction.

## Smoke Test (HFT-20)

The dashboard smoke test loads the public alert view and validates three signals:

1. Rainfall layer renders on the BasinMap (`data-testid="basin-map"` resolves a numeric `data-rainfall-frame-count` and the MapLibre canvas mounts).
2. Freshness chip inside `forecast-rainfall-sidebar` is not in the `failed` state.
3. The Thai/English toggle swaps the page heading copy.

### Install browsers (one-off)

```bash
bun install
bunx playwright install chromium
```

### Local run

In one shell, start the frontend dev server in `frontend/`:

```bash
cd ../frontend
bun --hot src/index.tsx
```

In another shell, run the smoke test against the local server (default URL is `http://localhost:5173`):

```bash
cd ../qa
bunx playwright test
# or with an explicit URL
HFT_PUBLIC_URL=http://localhost:5173 bunx playwright test
```

### Staging run

After the Vercel deploy is reachable, point the smoke test at the deployed URL:

```bash
HFT_PUBLIC_URL=https://<vercel-url> bunx playwright test
```

The config reads `HFT_PUBLIC_URL` once at start-up and uses it as `use.baseURL`, so no other env wiring is required.
