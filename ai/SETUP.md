# Developer Setup Guide

This guide gets a new Windows machine ready to work on Wordz. It assumes Git, Node, and a terminal (Windows Terminal + PowerShell 7) are already installed.

The steps are organized by what you need them for. **Most contributors only need Tier 1.**

For the day-to-day workflow once you're set up, see [WORKFLOW.md](./WORKFLOW.md).

---

## Tier 1: Run the app locally

Required to run the dev server and build the frontend.

### 1.1 Clone the repo

```powershell
git clone git@github.com:brendanx67/wordz.git C:\proj\wordz
cd C:\proj\wordz
```

`C:\proj\wordz` is the convention — many docs reference this exact path.

### 1.2 Install Bun

Bun is the package manager, dev-server runner, and unit-test runner.

```powershell
irm bun.sh/install.ps1 | iex
```

Restart your shell, then:

```powershell
bun --version           # confirm install
bun install --frozen-lockfile
```

### 1.3 Configure frontend env vars

The frontend reads its Supabase project URL and publishable key from a `.env` file (which Vite picks up automatically when you run `bun run dev`):

```powershell
copy .env.example .env
```

Then edit `.env` and fill in:

```
VITE_SUPABASE_URL=https://tgancohfwqyyjnnuyokh.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from Supabase Dashboard → Settings → API Keys>
```

The publishable key is safe to ship in browser code (real security comes from Row Level Security policies on every table). Never put the service-role key here — it belongs in Edge Function secrets only.

### 1.4 Enable git symlinks (Windows)

The repo uses git symlinks for shared engine code (`supabase/functions/*/_shared` → `../_shared`, and `src/lib/_shared` → `../../supabase/functions/_shared`). Without symlinks, builds and Edge Function deploys see them as empty 10-byte text files containing the target path.

Two steps, both one-time:

1. **Enable Windows Developer Mode** (or run as administrator). Settings → Privacy & Security → For developers → Developer Mode = On.
2. **Enable symlinks in this repo**:
   ```powershell
   git config core.symlinks true
   ```

If you cloned the repo before doing the above, the symlink files already checked out wrong. Re-materialize them:

```powershell
del supabase\functions\game-api\_shared
del supabase\functions\computer-turn\_shared
del supabase\functions\validate-word\_shared
git checkout -- supabase/functions/game-api/_shared supabase/functions/computer-turn/_shared supabase/functions/validate-word/_shared
```

You'll know it worked when `Get-Item supabase\functions\game-api\_shared` shows `LinkType: SymbolicLink`.

### 1.5 Run the dev server

```powershell
bun run dev
```

Opens on http://localhost:3000. Sign in (or sign up) and you should see the lobby.

### 1.6 Run unit tests

```powershell
bun run test
```

Excludes `tests/e2e` (those need the Tier 2 Playwright setup). ~300ms for ~90 tests.

### 1.7 Run the production build

```powershell
bun run build
```

Always run this before committing. The dev server doesn't run `tsc`, so TypeScript errors only surface in this step. CI runs the same command.

`bun run build` chains `bun run build:mcp` first (rebuilds `public/wordz-mcp.zip` from `mcp-server/`), then `tsc -b && vite build`. The MCP rebuild requires `zip` on PATH — see Tier 2 if you're on Windows and don't have it.

---

## Tier 2: Contribute back

Required if you'll push schema migrations, deploy Edge Functions, file issues, or run Playwright e2e tests.

### 2.1 Install scoop

Scoop is the user-level package manager we use for Windows tools that aren't on winget/choco (Supabase CLI, zip).

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

Open a fresh terminal so the new PATH takes effect.

### 2.2 Install zip

`bun run build:mcp` (chained into `bun run build`) uses the Unix `zip` tool. On Linux / Mac it's pre-installed; on Windows it isn't:

```powershell
scoop install zip
```

### 2.3 Install Supabase CLI

```powershell
scoop install supabase
```

Then authenticate and link to the project:

```powershell
supabase login
supabase link --project-ref tgancohfwqyyjnnuyokh
```

`supabase link` will prompt for the database password (used for `supabase db push`). The credentials live in `supabase/.temp/` (gitignored, per-machine).

### 2.4 Apply migrations / deploy functions

```powershell
supabase db push                         # apply pending migrations
supabase functions deploy                # deploy all functions
supabase functions deploy game-api       # deploy a single function
```

`supabase/config.toml` pins `verify_jwt = false` for `game-api` (MCP clients don't send a Supabase JWT), so the CLI preserves that on every deploy. Don't pass `--no-verify-jwt` manually — the config does it.

### 2.5 Install GitHub CLI

For filing issues, posting verification comments, opening PRs:

```powershell
winget install GitHub.cli
gh auth login
```

### 2.6 Install Playwright (e2e tests)

Playwright isn't pinned in `package.json` — it's a per-developer install:

```powershell
bun add -d @playwright/test
npx playwright install chromium
```

For the auth-required tests, copy the credentials template:

```powershell
copy .env.test.example .env.test
```

Each spec has different credential expectations:

| Spec | Needs `.env.test`? | Notes |
|---|---|---|
| `smoke.spec.ts` | no | No auth at all. |
| `game-lifecycle.spec.ts` | no | Self-provisions a disposable account, deletes it at end. |
| `auth.spec.ts` | **yes** | Signs in as `TEST_USER_EMAIL`. **Account must already exist on the live site.** |
| `mobile-layout.spec.ts` | **yes** | Same. |

For the auth-required specs, sign up once at https://wordz-five.vercel.app with whatever credentials you put in `.env.test` — that's a one-time step. `playwright.config.ts` does not auto-load `.env.test`, so source it into your shell first:

```bash
# Bash / Git Bash
set -a; source .env.test; set +a
npx playwright test --project=desktop --headed
```

For more detail (run modes, CI behavior, selector conventions), see [TESTING.md](./TESTING.md).

---

## Tier 3: AI integration (optional)

If you want to use Claude (or any MCP-compatible AI client) as an API player in Wordz games, the canonical install path is documented in [`mcp-server/README.md`](../mcp-server/README.md) — sign in at the live site, create an API key from the "Connect an AI" panel, download `wordz-mcp.zip` from the same panel, extract to `~/.wordz-mcp/`, install deps with `npm install`, drop credentials into `~/.wordz-mcp/credentials.json`, and register with `claude mcp add wordz`.

The full tool reference (12 tools, REST endpoints, cell notation, suggestion mode) lives there too.

---

## Working directory: `ai/.tmp`

All temporary and working files go in `C:\proj\ai\.tmp\`:

- **Issue drafts**: `ai/.tmp/issue-N-body.md` — written to disk, filed via `gh issue create --body-file`
- **Verification comments**: `ai/.tmp/issue-N-close-comment.md` — posted via `gh issue comment --body-file`
- **Reports**: LOC audits, field reports, diagnostic dumps

This directory is gitignored. Don't use `ai/tmp` (no leading dot) or any other location.

## Quick reference

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server on port 3000 |
| `bun run test` | Unit tests (excludes Playwright) |
| `bun run build` | `build:mcp` + `tsc -b` + `vite build` (run before committing) |
| `bun run build:mcp` | Rebuild `public/wordz-mcp.zip` |
| `supabase db push` | Apply pending migrations to the linked project |
| `supabase functions deploy` | Deploy all Edge Functions |
| `npx playwright test --project=desktop` | Run desktop e2e suite |
| `gh issue create --body-file FILE` | File a GitHub issue |
| `claude mcp list` | Check MCP server connections |
