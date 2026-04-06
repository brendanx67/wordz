# Wordz Refactor Plan (v1.0 → v2.0)

## Problem Summary

The codebase has grown organically with significant duplication and oversized files:

| File | Lines | Problem |
|------|-------|---------|
| `src/pages/GamePage.tsx` | 1612 | God component — state, handlers, computed values, all rendering |
| `supabase/functions/game-api/index.ts` | 1495 | Monolith — Trie, scoring, move gen, all API routes |
| `mcp-server/index.ts` | 1204 | Monolith — types, API client, all MCP tools |
| `supabase/functions/computer-turn/index.ts` | 724 | Copy-paste of Trie + move gen from game-api |

**Duplication inventory:**
- **Trie**: `_shared/trie.ts` (58 lines, never imported), copy in `game-api/index.ts`, copy in `computer-turn/index.ts`
- **Types** (`Tile`, `BoardCell`): defined in `src/lib/gameConstants.ts`, `_shared/gameConstants.ts` (never imported), `game-api/index.ts`, `computer-turn/index.ts`, `mcp-server/index.ts`
- **Scoring/constants** (`LETTER_VALUES`, `TILE_DISTRIBUTION`, `PREMIUM_SQUARES`): in `src/lib/gameConstants.ts`, `src/lib/scoring.ts`, `_shared/gameConstants.ts`, `game-api/index.ts`
- **Move generation** (~200 lines): identical in `game-api/index.ts` and `computer-turn/index.ts`, plus `_shared/moveGenerator.ts` (unused)

## Phase 1: Fix `_shared/` imports in Edge Functions

**Why first**: This unblocks deduplication of all server-side code. Supabase Edge Functions support relative imports within the `supabase/functions/` tree.

**Steps:**
1. Verify `_shared/` imports work with `import { X } from "../_shared/trie.ts"` in a test deploy
2. Update `_shared/trie.ts` to be the canonical Trie implementation
3. Update `_shared/gameConstants.ts` to be the canonical types + constants for server side
4. Create `_shared/moveGenerator.ts` as canonical move generation (already exists, verify it works)
5. Create `_shared/scoring.ts` for server-side scoring logic
6. Refactor `game-api/index.ts` to import from `_shared/`
7. Refactor `computer-turn/index.ts` to import from `_shared/`
8. Deploy both functions and verify they work

**Expected impact**: ~400 lines removed from game-api, ~300 from computer-turn.

## Phase 2: Break up `GamePage.tsx`

**Strategy**: Extract logical groups into custom hooks and sub-components. Keep GamePage as an orchestrator.

### New hooks:
- **`useGameState(gameId, userId)`** — Derives all the computed game state: `isMyTurn`, `isActive`, `isSpectatingApi`, `board`, `players`, `rackTiles`, etc. Returns a single object.
- **`useTilePlacement(board, rackTiles)`** — Manages `placedTiles`, `selectedSquare`, `direction`, `blankTileTarget`. Exposes `handleSquareClick`, `placeTileOnBoard`, `handleDrop`, `handlePickupTile`, `handleRecall`, `handleBlankLetterChoice`.
- **`useSuggestionMode(gameId, spectatingApiPlayer)`** — Manages `suggestionTiles`, `suggestionSquare`, `suggestionDirection`, `suggestionSent`. Exposes `handleSuggestionSquareClick`, `handleSuggestionTileClick`, `saveSuggestion`, `clearSuggestion`.
- **`useReviewMode(moveHistory)`** — Manages `reviewMode`, `reviewMoveIndex`, `reviewBoard`, `reviewHighlightTiles`, `reviewScores`, `reviewTilesRemaining`, navigation.
- **`useTurnTimer(game)`** — The turn elapsed timer logic.

### New components:
- **`GameControls`** — The action buttons section (Submit, Pass, Exchange, Challenge, Recall)
- **`SuggestionControls`** — The suggestion UI panel (send, clear, LLM preview indicator)
- **`ReviewControls`** — The review mode navigation bar
- **`Scoreboard`** — Player scores sidebar/panel
- **`BlankTileDialog`** — The letter picker for blank tiles
- **`GameHeader`** — Top bar with game info, turn indicator, timer

**Expected impact**: GamePage.tsx goes from ~1600 to ~300-400 lines (orchestration + layout).

## Phase 3: Break up `game-api/index.ts`

**Strategy**: Split into route handler modules, keep index.ts as router.

### New files under `supabase/functions/game-api/`:
- `index.ts` — Router only (~80 lines): parse path, dispatch to handler
- `handlers/get-game.ts` — handleGetGame
- `handlers/play-move.ts` — handlePlayMove (biggest handler)
- `handlers/validate-move.ts` — handleValidateMove
- `handlers/exchange.ts` — handleExchange
- `handlers/pass.ts` — handlePass
- `handlers/create-game.ts` — handleCreateGame
- `handlers/list-games.ts` — handleListGames
- `handlers/suggest-move.ts` — handleSuggestMove
- `handlers/find-words.ts` — handleFindWords
- `handlers/preview-move.ts` — handlePreviewMove

All handlers import types, scoring, Trie, move gen from `_shared/`.

**Expected impact**: index.ts drops from ~1500 to ~80 lines. Each handler is self-contained and testable.

## Phase 4: Clean up `mcp-server/index.ts`

**Strategy**: Extract tool implementations into separate files.

### New structure:
```
mcp-server/
  index.ts          — MCP server setup, tool registration (~100 lines)
  api-client.ts     — WordzApiClient class
  tools/
    get-game.ts
    play-move.ts
    suggest-move.ts
    validate-move.ts
    list-games.ts
    ...
  types.ts          — Shared MCP-side types
```

**Expected impact**: index.ts drops from ~1200 to ~100 lines.

## Execution Order

1. **Phase 1** first — unblocks server-side dedup, lowest risk
2. **Phase 2** next — biggest user-facing code quality win
3. **Phase 3** — server cleanup, lower priority
4. **Phase 4** — MCP cleanup, lowest priority (it's a separate package)

Each phase ends with a full build check + deploy verification. Tag after each phase.
