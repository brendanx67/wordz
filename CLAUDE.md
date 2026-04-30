# Wordz — Project Guide for Claude

This file is the operating guide for any Claude session working on Wordz. Read it before touching code. The README is the public-facing entry point; this file is the developer-facing one.

## Project overview

Wordz is a multiplayer Scrabble-style word game where humans, LLM agents, and adaptive computer opponents share the same board. It's a three-tier system:

1. **React frontend** (`src/`) — what the user sees in the browser.
2. **Supabase Edge Functions** (`supabase/functions/`) — the game server. Handles moves, scoring, computer-turn execution, dictionary lookups.
3. **MCP server** (`mcp-server/`) — a stdio MCP wrapper around the Edge Function API so LLM clients (Claude, GPT, anything MCP-compatible) can join games as API players.

A Postgres database (Supabase-managed) holds games, players, moves, and the trie-loaded dictionary. Realtime channels broadcast turn changes to seated clients.

For the high-level "what is this and why" pitch, see [README.md](./README.md).

## Workflow

CC is the sole code author, working from the persistent local clone at `C:\proj\wordz`. Pushes to `master` trigger a Vercel deploy of the frontend; schema and Edge Function deploys are manual via `supabase db push` and `supabase functions deploy`. See **[ai/WORKFLOW.md](./ai/WORKFLOW.md)** for the full protocol and **[ai/SETUP.md](./ai/SETUP.md)** for one-time machine setup.

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
│   ├── GameStatusBanners.tsx     # Waiting/game-over/turn status banners
│   ├── ReviewControls.tsx        # Post-game review navigation
│   ├── GameHistoryViewer.tsx     # Move-by-move replay
│   └── ui/                       # shadcn/ui components (don't edit these by hand)
├── hooks/
│   ├── useAuth.ts                # Supabase Auth wrapper
│   ├── useGames.ts               # TanStack Query hooks for game CRUD (large)
│   ├── useGameRealtime.ts        # Supabase Realtime subscription
│   ├── useComputerPlayer.ts      # Triggers computer-turn Edge Function
│   ├── useMoveMutations.ts       # Move submit/pass/exchange/challenge logic
│   ├── useReviewAnalysis.ts      # Review-mode find-words analysis state
│   ├── useBoardInteractions.ts   # Board click/drop/keyboard handlers
│   ├── useMobileLayout.ts        # Media-query hook + mobile cell sizing
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
│   ├── api-helpers.ts            # Auth, error wrappers, formatMoveResult
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
| `bun run build` | `bun run build:mcp && tsc -b && vite build` — **always run before committing**. Vercel runs the same command on every push to `master`, so the MCP ZIP ships fresh with each deploy. |
| `bun run build:mcp` | Rebuild `public/wordz-mcp.zip` from `mcp-server/`. Already chained into `bun run build`; only invoke directly if you want to inspect the ZIP without a full frontend build. |
| `bun run build:source` | Vestigial — produced `public/wordz-source.zip` for the BS↔CC courier protocol, which no longer exists. The script and the lobby download link still work but should be removed in a follow-up. |

**Run `bun run build` before committing.** The dev server doesn't run `tsc`, so type errors only surface here. CI also runs this — if it fails locally, it'll fail in CI.

## Shared engine via symlinks

The trie, move generator, game constants, and scoring all live in `supabase/functions/_shared/`. Each Edge Function that needs them has a symlink — `game-api/_shared`, `computer-turn/_shared`, and `validate-word/_shared` all point at `../_shared`. The Supabase CLI follows these symlinks during `supabase functions deploy` and bundles the linked files into each function's deploy artifact, so the engine code ships once at the source level but ends up in every function's runtime.

The frontend reaches the same files via `src/lib/_shared`, another symlink pointing at `../../supabase/functions/_shared/`. Vite follows symlinks by default, so imports like `@/lib/_shared/scoring.ts` resolve to the same file the Edge Functions consume. This means the scoring module is literally one file shared across the whole three-tier system — fix a bug in `_shared/scoring.ts` and every caller picks it up.

If you edit anything under `_shared/`, every function and the frontend picks it up automatically — no manual sync. Don't replace any of these symlinks with copies; deploys would still work, but you'd reintroduce the duplication that Phase 1 of the refactor removed.

## Known incomplete refactors

(Nothing currently tracked here. #17 — scoring dedup — landed. If you spot something that drifted, add it back.)

## Known oversized files

These are over the 300-line target from the modular restructure. Lower priority than features and bugs, but worth splitting eventually:

- `src/pages/GamePage.tsx` — 743 lines (down from 1628 via #16: `useMoveMutations`, `useReviewAnalysis`, `useBoardInteractions`, `GameStatusBanners`)
- `src/hooks/useGames.ts` — 530 lines
- `src/hooks/useMoveMutations.ts` — 470 lines (extracted from GamePage)
- `supabase/functions/computer-turn/index.ts` — 395 lines

Don't make them bigger.

## Things never to do

- Force-rebase, squash, or amend any commit that's already on `master`. The history is shared with downstream tooling and a non-fast-forward push will lose work. Append-only.
- Put `DATABASE_URL`, the Supabase service role key, or any third-party API key in frontend code. Secrets live in Edge Function env (`Deno.env.get(...)`) only.
- Disable RLS on any table. Even for "public" data, write an explicit `for select to anon using (true)` policy.
- Inline Supabase queries inside components. Wrap them in a hook.
- Edit `src/lib/database.types.ts` by hand — regenerate it from the schema.
- Install alternative bundlers, CSS frameworks, or component libraries.
- Commit `public/wordz-source.zip` or `public/wordz-mcp.zip` to git. These are build artifacts listed in `.gitignore`. Committing them causes recursive bloat. `bun run build` chains `build:mcp` so Vercel deploys always ship a fresh MCP ZIP without anything entering git.
