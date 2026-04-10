# Developer Setup Guide

This guide covers everything needed to work on Wordz as a CC (local Claude Code) developer. It assumes you're starting from a clean machine with Git and Node.js already installed.

For the multi-agent workflow context (BS, CC, roles, conventions), see [WORKFLOW.md](./WORKFLOW.md).

---

## 1. Clone the repository

```bash
git clone git@github.com:brendanx67/wordz.git C:\proj\wordz
```

This is the **persistent working clone** — opened in VS Code for reading, kept in sync via `git pull --ff-only`. CC never commits directly to this clone (see WORKFLOW.md for the courier protocol).

## 2. Install Bun

Bun is the test runner (`bun test`) and package manager.

```powershell
# PowerShell
irm bun.sh/install.ps1 | iex
```

Restart your shell, then verify:

```bash
bun --version
```

Install project dependencies:

```bash
cd C:\proj\wordz
bun install --frozen-lockfile
```

Verify tests pass:

```bash
bun test
```

## 3. Install the Wordz MCP server

The Wordz MCP server gives CC access to the game's chat system (the BS↔CC coordination channel) and game state tools.

### Download and install

```bash
# Download the MCP server ZIP from the deployed app
curl -sL -o wordz-mcp.zip https://app-91d3764568581a338bf3.vercel.app/wordz-mcp.zip

# Extract to ~/.wordz-mcp
mkdir -p ~/.wordz-mcp
cd ~/.wordz-mcp
unzip -o /path/to/wordz-mcp.zip

# Install dependencies
npm install
```

### Configure credentials

Create `~/.wordz-mcp/credentials.json`:

```json
{
  "api_url": "https://lttodjtxcrgvwcwpqppe.supabase.co/functions/v1/game-api",
  "api_key": "YOUR_API_KEY_HERE"
}
```

The API key comes from the Wordz lobby UI → API Keys section. Sign in to the app, create an API key, and paste it here.

### Register with Claude Code

```bash
claude mcp add wordz --scope project \
  --command npx \
  --args tsx,C:/Users/YOUR_USERNAME/.wordz-mcp/index.ts
```

Or manually add to `~/.claude.json` under the project's `mcpServers`:

```json
{
  "wordz": {
    "type": "stdio",
    "command": "npx",
    "args": ["tsx", "C:/Users/YOUR_USERNAME/.wordz-mcp/index.ts"],
    "env": {}
  }
}
```

Verify the connection:

```bash
claude mcp list
# Should show: wordz · ✔ connected
```

### Key MCP tools for development

| Tool | Purpose |
|---|---|
| `mcp__wordz__post_chat_message` | Post to BS↔CC coordination channel |
| `mcp__wordz__read_chat_messages` | Read recent messages from BS |
| `mcp__wordz__list_chat_channels` | Discover available channels |
| `mcp__wordz__get_game_state` | Inspect a game's current state |
| `mcp__wordz__list_games` | List active/waiting games |

The `suggestions` channel is the primary coordination channel between BS and CC.

## 4. Install GitHub CLI

```bash
winget install GitHub.cli
gh auth login
```

Used for issue management (`gh issue create`, `gh issue comment`, `gh issue close`).

## 5. Install Playwright (for e2e tests)

```bash
cd C:\proj\wordz
bun add -d @playwright/test
npx playwright install chromium
```

### Configure test credentials

Copy the template and fill in a test account's credentials:

```bash
cp .env.test.example .env.test
# Edit .env.test with your test email/password
```

Run smoke tests (no auth needed):

```bash
npx playwright test tests/e2e/smoke.spec.ts --project=desktop
```

Run auth tests (needs `.env.test`):

```bash
npx playwright test --project=desktop
```

## 6. Working directory: `ai/.tmp`

All temporary and working files go in `C:\proj\ai\.tmp\`:

- **Incoming snapshots**: `ai/.tmp/snapN/` — extracted source ZIPs for verification before push
- **Issue drafts**: `ai/.tmp/issue-N-body.md` — written to disk, filed via `gh issue create --body-file`
- **Verification comments**: `ai/.tmp/issue-N-close-comment.md` — posted via `gh issue comment --body-file`
- **Reports**: LOC audits, field reports, etc.

This directory is gitignored and never committed.

## 7. The source ZIP workflow

When BS ships new code, the developer publishes it via the sandbox UI. CC downloads, verifies, and pushes:

```bash
# Download
curl -sSL -o ai/.tmp/wordz-snapshot-N.zip \
  "https://app-91d3764568581a338bf3.vercel.app/wordz-source.zip?v=$(date +%s)"

# Extract to marshalling directory
mkdir ai/.tmp/snapN && cd ai/.tmp/snapN && unzip -q ../wordz-snapshot-N.zip

# Verify .git/ is present and check new commits
ls .git/
git log --oneline LAST_PUSHED_SHA..HEAD

# Push BS's commits to GitHub (courier — preserve BS's SHAs)
git remote add github git@github.com:brendanx67/wordz.git
git push github master

# Sync persistent clone
cd C:\proj\wordz && git pull --ff-only origin master

# Clean up
rm -rf ai/.tmp/snapN ai/.tmp/wordz-snapshot-N.zip
```

**Critical**: never copy files from the snapshot into `C:\proj\wordz` and commit. That creates CC-authored commits instead of preserving BS's. See WORKFLOW.md.

## 8. The patch channel (CC → BS)

When CC needs to contribute code (tests, doc fixes, config changes):

```bash
cd C:\proj\wordz
git checkout -b cc/description-of-change
# make changes, commit
bun test  # verify tests pass locally
git push origin cc/description-of-change
```

Then post to the suggestions chat channel:

> BS — apply this patch:
> ```
> curl -sL https://github.com/brendanx67/wordz/compare/master...cc/description-of-change.patch | git apply
> ```
> Changed files: [list]. [short description].

After BS applies and the next ZIP is pushed, prune the branch:

```bash
git push origin --delete cc/description-of-change
git branch -D cc/description-of-change
```

## Quick reference

| Command | What it does |
|---|---|
| `bun test` | Run unit tests (85 tests, ~100ms) |
| `bun run build` | Typecheck + build (same as CI) |
| `npx playwright test --project=desktop` | Run Playwright e2e tests |
| `gh issue create --body-file FILE` | File a GitHub issue |
| `gh issue comment N --body-file FILE` | Post verification comment |
| `claude mcp list` | Check MCP server connections |
