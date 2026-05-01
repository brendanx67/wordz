# Testing

Two test layers: fast unit tests (Bun) and end-to-end browser tests (Playwright). Different setup, different audience.

## Unit tests — `bun run test`

```
bun run test
```

Runs `bun test --path-ignore-patterns tests/e2e`. Currently ~90 tests in ~300ms covering scoring, the move generator, the trie, endgame rules, tile normalization, and a handful of pure helpers. CI runs the same script (in `.github/workflows/ci.yml`) — note the indirection: CI invokes `bun run test`, **not** `bun test` directly, so the path-ignore on the script matters.

Don't add tests under `tests/e2e/` and expect this script to pick them up. It won't.

## End-to-end tests — Playwright

Specs live in `tests/e2e/`. Default base URL is `https://wordz-five.vercel.app` (from `playwright.config.ts`); override with `PLAYWRIGHT_BASE_URL=...` for local dev or preview deploys.

### Per-spec credential expectations

| Spec | Self-provisions account? | Reads `.env.test`? | Notes |
|---|---|---|---|
| `smoke.spec.ts` | n/a | no | No auth at all — landing page renders + title check. |
| `game-lifecycle.spec.ts` | **yes** | no | Hardcodes `playwright-lifecycle@wordz-test.example` / `TestPass123!`, signs up at the start, deletes the account at the end. ~1 minute headed. |
| `auth.spec.ts` | no | **yes** | Signs in as `TEST_USER_EMAIL` from `.env.test`. The account must already exist on the live deployment. |
| `mobile-layout.spec.ts` | no | **yes** | Same. |

Pre-creating the test account is a one-time step at https://wordz-five.vercel.app — sign up with whatever credentials you put in `.env.test`. The `game-lifecycle` test will not interfere with this account; it operates on its own disposable email.

### `.env.test` doesn't auto-load

`playwright.config.ts` does **not** read `.env.test`. The `auth` and `mobile-layout` specs read `process.env.TEST_USER_EMAIL` / `TEST_USER_PASSWORD` directly, so you have to populate the shell environment before invoking Playwright.

Bash (Git Bash works):

```bash
set -a; source .env.test; set +a
npx playwright test --project=desktop
```

PowerShell:

```powershell
Get-Content .env.test | ForEach-Object {
  $k, $v = $_ -split '=', 2
  if ($k -and $v) { [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process') }
}
npx playwright test --project=desktop
```

This is a known gap; eventually `playwright.config.ts` should load `.env.test` itself. Until then, sourcing manually is the workaround.

### Common run modes

```bash
# Headless desktop suite
npx playwright test --project=desktop

# Watch the browser as tests run
npx playwright test --project=desktop --headed

# Single spec
npx playwright test tests/e2e/smoke.spec.ts --project=desktop

# Mobile viewport (iPhone 15)
npx playwright test --project=mobile
```

### Selector convention

Form inputs in `AuthPage.tsx` are formally labeled (`<Label htmlFor="auth-email">` paired with `<Input id="auth-email">`), so `getByLabel(/email/i)` works in tests. If you add a new form, follow the same pattern — sibling `<Label>` + `<Input>` without `htmlFor`/`id` will not be picked up by `getByLabel`, and falling back to `getByPlaceholder` exercises a different DOM attribute than what assistive tech relies on. See `tests/e2e/helpers.ts` for the canonical sign-in helper.

## Local Playwright setup

Playwright isn't pinned in `package.json` — it's a per-developer install:

```bash
bun add -d @playwright/test
npx playwright install chromium
cp .env.test.example .env.test
# fill in TEST_USER_EMAIL and TEST_USER_PASSWORD
```

Full install context (including the `bun add -d` invocation, prerequisites, etc.) is in [SETUP.md](./SETUP.md) §2.6.

## CI

`.github/workflows/ci.yml` runs on every push to `master` and on pull requests:

1. `bun install --frozen-lockfile`
2. `bun run build` — typecheck + vite build (with chained `build:mcp`)
3. `bun run test` — unit tests, e2e excluded by the path-ignore

Playwright e2e specs **don't** run in CI today (would need pre-provisioned credentials and would race against Vercel's preview deploys). Run them locally before merging anything that touches the auth flow, lobby, or game page.
