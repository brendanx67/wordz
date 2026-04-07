# Wordz

A multiplayer Scrabble-style word game where humans, LLM agents, and adaptive computer opponents share the same board.

Wordz is the first word game designed around the idea that a language model is just another kind of player. Humans sign in with Supabase Auth; LLMs connect through an MCP server that exposes the board as tools; and a built-in computer opponent plays at five difficulty tiers driven by a real move-generation engine. They all sit in the same game, on the same rack queue, with the same rules.

Live at [word-z.com](https://word-z.com). Source code is MIT-licensed — see [LICENSE](./LICENSE).

## What makes it interesting

- **Three kinds of player, one game model.** Every seat at the board is a row in `game_players` or `computer_players`. A game can be all humans, all computers, one human versus an LLM, or any mix. The turn loop doesn't care who's on the clock.
- **Real move generation, not random plays.** The computer opponent uses the [Appel & Jacobson (1988)](https://doi.org/10.1145/42411.42420) anchor-based algorithm (*Communications of the ACM* 31(5), 572–578). A plain forward trie is walked from each anchor square using cross-check sets for each column, generating every legal move on the board in milliseconds. It's simpler than a DAWG or GADDAG — Wordz trades a little per-move work for a much smaller dictionary structure — and it's more than fast enough for a 15×15 board. Difficulty is a percentile cutoff over the sorted move list, not a handicap on the search itself.
- **LLMs get the same engine as a tool.** The MCP server exposes `find_words`, which runs the full Appel & Jacobson search from the model's current rack and returns the top legal moves. Claude, with that tool available, plays noticeably faster and stronger than Claude without it. Use it or don't — the interesting experiment is "does access to a good search help, and by how much."
- **Suggestion mode for co-play.** Humans can stage a move on their own rack and board, then hand it to their LLM teammate as a starting point. The LLM sees the suggestion, decides whether to play it verbatim, modify it, or reject it, and explains why in the game log.

## Architecture

Wordz is a three-tier system. Each tier owns a clearly separated concern.

```
┌─────────────────────┐   ┌──────────────────────┐   ┌───────────────────┐
│  React frontend     │   │  Supabase Edge Fns   │   │  MCP server       │
│  (src/)             │──▶│  (supabase/...)      │◀──│  (mcp-server/)    │
│                     │   │                      │   │                   │
│  - Auth, lobby, UI  │   │  - game-api (router) │   │  - stdio MCP      │
│  - Board, rack      │   │  - computer-turn     │   │  - 12 tools       │
│  - Suggestion mode  │   │  - validate-word     │   │  - LLM-facing     │
└─────────┬───────────┘   └──────────┬───────────┘   └─────────┬─────────┘
          │                          │                         │
          └──────────┬───────────────┴────────────┬────────────┘
                     │                            │
                     ▼                            ▼
              ┌─────────────┐              ┌─────────────┐
              │  Postgres   │              │  Realtime   │
              │  + RLS      │              │  channel    │
              └─────────────┘              └─────────────┘
```

**Frontend (`src/`).** React 18 + TypeScript + Vite + Tailwind + shadcn/ui. TanStack Query for data fetching, Supabase Realtime for cross-player sync. Entry point is `src/App.tsx`; the three pages are `AuthPage`, `LobbyPage`, and `GamePage`. Game logic lives in hooks under `src/hooks/` — notably `useComputerPlayer` (turn trigger), `useGameRealtime` (subscription), `useSuggestionMode` (co-play staging).

**Edge Functions (`supabase/functions/`).** Deno runtime, three functions:
- **`game-api/`** — the main router. Handlers in `game-api/handlers/` cover `play-move`, `preview-move`, `validate-move`, `suggest-move`, `find-words`, `get-game`, `list-games`. Authenticates either a Supabase user JWT or an `X-Api-Key` header for API players.
- **`computer-turn/`** — runs a single computer move. Called from the frontend when the current turn belongs to a computer player, or by the watchdog when a turn stalls.
- **`validate-word/`** — cheap dictionary lookup used by the suggestion UI for instant feedback.

The shared engine code lives in `supabase/functions/_shared/`:
- `trie.ts` — compact prefix trie (58 lines).
- `moveGenerator.ts` — Appel & Jacobson anchor-based move generation with cross-check sets (283 lines).
- `gameConstants.ts` — `LETTER_VALUES`, `TILE_DISTRIBUTION`, `PREMIUM_SQUARES`, board size.

The shared engine code at `supabase/functions/_shared/` is consumed by all three Edge Functions through symlinks: `computer-turn/_shared`, `game-api/_shared`, and `validate-word/_shared` all point at `../_shared`. The Supabase CLI follows these symlinks during `supabase functions deploy` and bundles the linked files into each function's deploy artifact, so the engine code is authored once and ships to every function.

**MCP server (`mcp-server/`).** A Node/Bun stdio MCP server that wraps `game-api`. Each tool is one file under `mcp-server/tools/`:

| Tool | What it does |
|------|---|
| `list_games` | List games the API player is seated in |
| `get_game_state` | Full board, rack, scores, turn |
| `wait_for_turn` | Block until it's the agent's turn |
| `find_words` | Run Appel & Jacobson from the current rack, return top legal moves |
| `preview_move` | Score a candidate move without committing |
| `validate_move` | Legality check before play |
| `play_word` | Commit a move |
| `pass_turn` | Pass |
| `exchange_tiles` | Swap tiles |
| `play_suggestion` | Play the human's staged suggestion verbatim |
| `validate_suggestion` | Inspect the suggestion before deciding |
| `game_context` | One-shot briefing: rules, board state, history |

Connect with:

```bash
claude mcp add wordz -- npx tsx ~/.wordz-mcp/index.ts
```

See [`mcp-server/README.md`](./mcp-server/README.md) for the full setup.

## Player model

Three kinds of seat, one turn loop:

- **Human players** — rows in `game_players`, authenticated via Supabase Auth. Identified by `user_id`.
- **API players** — also rows in `game_players`, but authenticated by an `api_key` owned by a human (`owner_id`). The MCP server passes this key on every request. API players are how LLMs (Claude, GPT, any agent with MCP) join a game.
- **Computer players** — rows in `computer_players` (separate table because they don't auth, they're advanced server-side). Five difficulty tiers from Easy through Grandmaster. Difficulty is a percentile over the sorted legal-move list: Easy plays around the 25th percentile, Grandmaster plays the best legal move. `computer_delay` controls thinking time for feel.

The three kinds never collide at the schema level but share the `current_turn` pointer on `games`. `current_turn` is either a `game_players.id` or a `computer_players.id`; the frontend resolves it, checks whose turn it is, and either waits for user input or fires the computer-turn / MCP tool path.

## Local development

**Prerequisites:** [Bun](https://bun.sh) 1.1+ and a Supabase project.

```bash
# Clone
git clone https://github.com/brendanx67/wordz.git
cd wordz

# Install
bun install

# Configure
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY

# Run
bun run dev      # frontend on http://localhost:3000
bun run build    # typecheck + production build (use this before pushing)
```

The frontend expects an Edge Function deployment at `${VITE_SUPABASE_URL}/functions/v1/game-api`. Deploy with the Supabase CLI:

```bash
supabase functions deploy game-api
supabase functions deploy computer-turn
supabase functions deploy validate-word
```

## MCP server setup

The MCP server is packaged as a standalone Node project. The canonical install is to download `wordz-mcp.zip` from [word-z.com](https://word-z.com), extract it to `~/.wordz-mcp/`, and point Claude at it:

```bash
cd ~/.wordz-mcp && npm install
claude mcp add wordz -- npx tsx ~/.wordz-mcp/index.ts
```

Create an API key from the "Connect an AI" section of [word-z.com](https://word-z.com) and put it in `~/.wordz-mcp/credentials.json` (or pass via `WORDZ_API_URL` / `WORDZ_API_KEY` env vars). See [`mcp-server/README.md`](./mcp-server/README.md) for the full setup.

**Running from this repo (for MCP server development):**

```bash
cd mcp-server
bun install
cp .env.example .env
# Fill in WORDZ_API_URL and WORDZ_API_KEY
claude mcp add wordz-dev -- bun /absolute/path/to/wordz/mcp-server/index.ts
```

## Release history

All four phases of the v1 → v2 modular restructure shipped. Tags:

- **`v1.0`** — initial playable version, pre-refactor.
- **`v1.1-phase1`** — Edge Function dedup via `_shared/`.
- **`v1.2-phase2`** — `GamePage.tsx` split into hooks + components.
- **`v1.3-phase3`** — `game-api` split into router + per-route handlers.
- **`v1.4-phase4`** — MCP server split into per-tool modules.

The archived plan is at [`todos/completed/PLAN-2026-04-06_modular_restructure.md`](./todos/completed/PLAN-2026-04-06_modular_restructure.md).

## License

MIT — see [LICENSE](./LICENSE).
