# Wordz — Project Guide for Claude

This file is the operating guide for any Claude session working on Wordz. Read it before touching code. The README is the public-facing entry point; this file is the developer-facing one.

## Project overview

Wordz is a multiplayer Scrabble-style word game where humans, LLM agents, and adaptive computer opponents share the same board. It's a three-tier system:

1. **React frontend** (`src/`) — what the user sees in the browser.
2. **Supabase Edge Functions** (`supabase/functions/`) — the game server. Handles moves, scoring, computer-turn execution, dictionary lookups.
3. **MCP server** (`mcp-server/`) — a stdio MCP wrapper around the Edge Function API so LLM clients (Claude, GPT, anything MCP-compatible) can join games as API players.

A Postgres database (Supabase-managed) holds games, players, moves, and the trie-loaded dictionary. Realtime channels broadcast turn changes to seated clients.

For the high-level "what is this and why" pitch, see [README.md](./README.md).

## Architecture map

```
src/                              # React frontend
├── App.tsx                       # Router root
├── pages/
│   ├── AuthPage.tsx              # Sign in / sign up
│   ├── LobbyPage.tsx             # Game list, create game, API key management
│   └── GamePage.tsx              # The board (large — see "Known oversized files")
├── components/
│   ├── GameBoard.tsx             # 15×15 grid + drag/drop
│   ├── TileRack.tsx              # The 7-tile rack
│   ├── BlankTileDialog.tsx       # Letter prompt for blanks
│   ├── SuggestionControls.tsx    # Co-play staging UI
│   ├── Scoreboard.tsx
│   ├── GameControls.tsx          # Submit/pass/exchange/shuffle
│   ├── GameHistoryViewer.tsx     # Move-by-move replay
│   └── ui/                       # shadcn/ui components (don't edit these by hand)
├── hooks/
│   ├── useAuth.ts                # Supabase Auth wrapper
│   ├── useGames.ts               # TanStack Query hooks for game CRUD (large)
│   ├── useGameRealtime.ts        # Supabase Realtime subscription
│   ├── useComputerPlayer.ts      # Triggers computer-turn Edge Function
│   ├── useSuggestionMode.ts      # Co-play staging state
│   ├── useReviewMode.ts          # Post-game replay state
│   └── useTurnTimer.ts           # Per-turn countdown
└── lib/
    ├── supabase.ts               # Browser Supabase client
    ├── scoring.ts                # Pure scoring functions (good first test target)
    ├── gameConstants.ts          # LETTER_VALUES, TILE_DISTRIBUTION, PREMIUM_SQUARES
    ├── database.types.ts         # Generated from Supabase schema — don't hand-edit
    └── queryClient.ts            # TanStack Query client

supabase/functions/               # Deno Edge Functions
├── _shared/                      # Shared engine — single source of truth
│   ├── trie.ts                   # Compact prefix trie
│   ├── moveGenerator.ts          # Appel & Jacobson move generation
│   └── gameConstants.ts          # Mirror of src/lib/gameConstants.ts
├── game-api/                     # Main router
│   ├── index.ts                  # Router shell (~30 lines after Phase 3)
│   ├── api-helpers.ts            # Auth, error wrappers
│   ├── scoring.ts                # Server-side scoring (diverged from src/lib/scoring.ts — see "Known incomplete refactors")
│   ├── _shared -> ../_shared     # Symlink → ../_shared
│   └── handlers/
│       ├── play-move.ts          # Commit a move (includes endgame rack penalty)
│       ├── preview-move.ts       # Score without committing
│       ├── validate-move.ts
│       ├── suggest-move.ts       # Stage a suggestion for an LLM teammate
│       ├── find-words.ts         # Run move generator from a rack
│       ├── get-game.ts
│       └── list-games.ts
├── computer-turn/                # Single-shot computer-turn execution
│   ├── index.ts                  # Auth-gated; runs the move generator
│   └── _shared -> ../_shared     # Symlink → ../_shared
└── validate-word/                # Cheap dictionary lookup for the suggestion UI
    ├── index.ts
    └── _shared -> ../_shared     # Symlink → ../_shared

mcp-server/                       # Stdio MCP server, one tool per file
├── index.ts                      # Server wiring (~40 lines after Phase 4)
├── api-client.ts                 # HTTP client for game-api
├── board.ts                      # Board rendering for tool descriptions
├── context-briefing.ts           # game_context tool body
└── tools/                        # 12 tools, each in its own file
```

## Key concepts

**Three player types, one turn loop.** Every seat is either a `game_players` row (humans + API players, distinguished by `api_key_id` being null or not) or a `computer_players` row (built-in opponents). The `games.current_turn` column points at one of these IDs. The frontend resolves whose turn it is and either waits for input, fires `computer-turn`, or waits for an MCP client to call `play_word`.

**Appel & Jacobson move generation.** The computer engine and the `find_words` MCP tool both use the same code in `supabase/functions/_shared/moveGenerator.ts`. It walks anchor squares with cross-check sets and generates every legal play in milliseconds. Computer difficulty is a percentile cutoff over the sorted move list, not a search handicap — Easy plays around the 25th-percentile move, Grandmaster plays the top move.

**Suggestion mode.** A human can stage a move in their UI (`useSuggestionMode`) and persist it on the game row. An LLM teammate's MCP client can then call `validate_suggestion` and either `play_suggestion` (commit verbatim) or play something else and explain why. The suggestion clears on the next move.

**Endgame scoring.** When a player goes out (rack empty, bag empty), every other player's remaining rack value is subtracted from their own score and added to the player who went out. This must be applied to **both** `game_players` rows and `computer_players` JSON in the `games` row — see `play-move.ts`. This was a real bug; if you touch endgame logic, write a regression test.

**Computer-turn watchdog.** All-computer games used to deadlock when a refetch raced the trigger effect. The fix in `useComputerPlayer.ts` is a per-turn dedup key (`${playerId}:${moveCount}`) plus a 15s watchdog in `GamePage.tsx` that refires `computer-turn` if the turn hasn't advanced. Don't simplify this back to a boolean `isThinking` flag.

## Repo conventions

- **Stack:** Bun, React 18, TypeScript (strict), Vite, Tailwind, shadcn/ui, lucide-react, react-router-dom, react-hook-form + zod, TanStack Query, Supabase, sonner. Don't introduce alternatives.
- **Imports:** `@/` is `./src/`. Use it for all frontend imports.
- **Colors:** Use semantic Tailwind tokens (`bg-background`, `text-foreground`, `bg-primary`, etc.) — never raw `bg-zinc-950`. Dark mode is the `.dark` class on `<html>`.
- **Components:** Function components + hooks only. No class components. Components over ~300 lines should be split (see "Known oversized files").
- **Data fetching:** Always TanStack Query, always wrapped in a custom hook in `src/hooks/`. Never put Supabase calls directly in component bodies.
- **TypeScript:** Strict mode. `noUnusedLocals` and `noUnusedParameters` are on — prefix unused params with `_`.
- **Backend:** Every Supabase table has RLS enabled with explicit policies. Schema changes go through `supabase migration` files, not ad-hoc SQL.
- **Don't hand-edit:** `src/lib/database.types.ts` (generated), `src/components/ui/*` (shadcn), `baku-inspector-plugin.{mjs,d.mts}` (sandbox tooling).

## Local dev commands

| Command | What it does |
|---------|---|
| `bun install` | Install dependencies |
| `bun run dev` | Vite dev server on port 3000 |
| `bun run build` | `tsc -b && vite build` — **always run before committing** |
| `bun run build:mcp` | Rebuild `public/wordz-mcp.zip` from `mcp-server/` (run when MCP server source changes before publishing) |

**Run `bun run build` before committing.** The dev server doesn't run `tsc`, so type errors only surface here. CI also runs this — if it fails locally, it'll fail in CI.

## Shared engine via symlinks

The trie, move generator, and game constants live in `supabase/functions/_shared/`. Each Edge Function that needs them has a symlink — `game-api/_shared`, `computer-turn/_shared`, and `validate-word/_shared` all point at `../_shared`. The Supabase CLI follows these symlinks during `supabase functions deploy` and bundles the linked files into each function's deploy artifact, so the engine code ships once at the source level but ends up in every function's runtime.

If you edit anything under `_shared/`, every function picks it up automatically — no manual sync. Don't replace any of these symlinks with copies; deploys would still work, but you'd reintroduce the duplication that Phase 1 of the refactor removed.

## Known incomplete refactors

**Scoring dedup never landed.** The Phase-1 plan called for a single scoring module shared between the frontend and Edge Functions, but `supabase/functions/game-api/scoring.ts` (138 lines) and `src/lib/scoring.ts` (170 lines) have drifted independently — different function names (`scoreMove` vs `validateAndScoreMove`), different imported types (`Tile` vs `PlacedTile`), and different internal details. Any scoring bug fix currently has to be applied to both files by hand. A future refactor cycle should pull scoring into `_shared/` like the trie and move generator, so both sides consume one source. Until then: **when you touch one scoring file, check the other**, and write a regression test that exercises the same input on both paths.

## Known oversized files

These are over the 300-line target from the modular restructure. Lower priority than features and bugs, but worth splitting eventually:

- `src/pages/GamePage.tsx` — 1162 lines
- `src/hooks/useGames.ts` — 490 lines
- `supabase/functions/computer-turn/index.ts` — 393 lines

Don't make them bigger.

## Things never to do

- Force-rebase, squash, or amend any commit that's already on `master`. The history is shared with downstream tooling and a non-fast-forward push will lose work. Append-only.
- Put `DATABASE_URL`, the Supabase service role key, or any third-party API key in frontend code. Secrets live in Edge Function env (`Deno.env.get(...)`) only.
- Disable RLS on any table. Even for "public" data, write an explicit `for select to anon using (true)` policy.
- Inline Supabase queries inside components. Wrap them in a hook.
- Edit `src/lib/database.types.ts` by hand — regenerate it from the schema.
- Install alternative bundlers, CSS frameworks, or component libraries.

---

## Anthropic dev environment only

**The rest of this file applies only to Claude sessions running inside the Anthropic web sandbox at `/home/claude/project`.** None of it applies to local clones. If you're reading this in `~/proj/wordz` or on a CI runner, skip it.

### Dev server

Vite runs under supervisor on port 3000 and auto-restarts. Logs at `/tmp/vite-dev.log`. After every file change, `cat /tmp/vite-dev.log` and fix any errors before proceeding.

| Command | What it does |
|---|---|
| `cat /tmp/vite-dev.log` | View dev server output |
| `supervisorctl -s http://127.0.0.1:9199 status` | Check dev server status |
| `supervisorctl -s http://127.0.0.1:9199 restart vite-dev-server` | Restart dev server |

**Never force-kill processes on port 3000** (`fuser`, `lsof`, `kill -9`). Env-manager has a TCP connection to port 3000 as the preview proxy and `fuser`/`lsof` match client connections, not just listeners. Killing env-manager permanently breaks the preview. Use **only** `supervisorctl restart vite-dev-server`.

### Browser validation tools

Two tiers:

**`mcp__browser__*`** — drives the user's live preview iframe. Sequence: `take_control` → `screenshot` / `eval_js` / `get_console_logs` → `release_control`. Use `highlight(el)` before interacting so the user sees where. Only works while the user's browser tab is open.

**`mcp__playwright__*`** — headless chromium in the container. Use when Tier 1 fails. Navigate to `http://localhost:3000`.

### Sandbox-only MCP tools

- `mcp__supabase__provision_database` — must be the first Supabase call in a fresh project. Creates the project, writes `.env`. Don't call other `mcp__supabase__*` tools or `request_secret` until this finishes.
- `mcp__supabase__migrate` / `query` / `deploy_function` / `get_function_logs` — schema changes, ad-hoc SQL, function deploys, log inspection.
- `mcp__secrets__request_secret` — third-party API keys. Stored in Edge Function secrets, accessible via `Deno.env.get()` only. Never put `VITE_*` or `SUPABASE_*` names through this.

### Security scan agent

A `security-scan` subagent is available. Read-only, ~2–5 min. Checks dependency CVEs, hardcoded secrets, missing RLS, XSS sinks, unauthenticated Edge Functions. **Run only on explicit request.** The publish UI sends exactly `"Run the security-scan agent to audit my project before I deploy."` — when you see that, invoke `Agent` with `subagent_type: security-scan` and no preamble. The agent ends its report with a fenced ```` ```json ```` block containing `"_marker": "baku-security-scan-result"` — relay that JSON verbatim so the UI can parse it.

### Pre-publish

`bun run build` in the project directory. The dev server doesn't run `tsc`; type errors only surface here.
