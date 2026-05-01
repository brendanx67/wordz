# Wordz MCP Server

Play Wordz (Scrabble) through Claude or any MCP-compatible AI assistant.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- An API key from your Wordz account — create one in the "Connect an AI" section at [wordz-five.vercel.app](https://wordz-five.vercel.app)

## Setup

1. **Download and extract** to `~/.wordz-mcp/`:
   ```bash
   # Download wordz-mcp.zip from https://wordz-five.vercel.app/wordz-mcp.zip
   # Extract contents to ~/.wordz-mcp/
   ```

2. **Install dependencies:**
   ```bash
   cd ~/.wordz-mcp && npm install
   ```
   This uses `npm` rather than `bun` so end-user setup works on any Node install — you don't need a second package manager just to run the MCP server.

3. **Create `~/.wordz-mcp/credentials.json`:**
   ```json
   {
     "api_url": "https://your-project-ref.supabase.co/functions/v1/game-api",
     "api_key": "your-api-key-here",
     "game_id": "optional-default-game-id"
   }
   ```
   - `api_url` — the API endpoint (shown on the website)
   - `api_key` — your API key (create in the "Connect an AI" section)
   - `game_id` — optional default game ID (can also pass per tool call)

## Connecting to Claude Code

```bash
claude mcp add wordz -- npx tsx ~/.wordz-mcp/index.ts
```

That's it! The server reads credentials from `~/.wordz-mcp/credentials.json` automatically.

## Connecting to Claude Desktop

Add to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wordz": {
      "command": "npx",
      "args": ["tsx", "~/.wordz-mcp/index.ts"]
    }
  }
}
```

No `env` block needed — credentials come from `credentials.json`.

## Available Tools

| Tool | Description |
|------|-------------|
| `game_context` | **Call first.** Strategic briefing (master/club/social level) |
| `list_games` | Discover your active games (no game_id needed) |
| `get_game_state` | View the board, your rack, scores, owner suggestions, and recent moves |
| `validate_move` | **Use before play_word.** Dry-run that shows all words formed (including cross-words) and whether each is valid |
| `play_word` | Place tiles on the board using cell notation (e.g. `H8`) |
| `find_words` | Search ALL legal moves using the A&J algorithm (filters: score, length, letter, cell) |
| `preview_move` | Show a candidate move to the owner on their board (purple highlight) |
| `validate_suggestion` | Inspect the owner's staged suggestion (and all words/cross-words it forms) before deciding whether to play it |
| `play_suggestion` | Play the move the owner suggested (tiles they placed on the board) |
| `wait_for_turn` | **Use after your move.** Blocks until opponent finishes (polls every 5s, 30min timeout) |
| `pass_turn` | Pass without playing |
| `exchange_tiles` | Swap tiles from your rack (pass letters, e.g. `["F", "H", "V"]`) |

All tools accept an optional `game_id` parameter. If omitted, uses the `game_id` from `credentials.json`.

### Cell Notation

All tile placements use Excel-style cell notation: column letter (A-O) + row number (1-15).
- `H8` = center square (column H, row 8)
- `A1` = top-left corner
- `O15` = bottom-right corner

Example: `tiles: [{cell: "H8", letter: "C"}, {cell: "I8", letter: "A"}, {cell: "J8", letter: "T"}]`

### Collaborative Features

**Owner → LLM (Suggestions):** When spectating your API player's game, you can place tiles from its rack onto the board and click "Send Suggestion." The LLM sees this in `get_game_state` and can validate/play it with `play_suggestion`.

**LLM → Owner (Previews):** The LLM can call `preview_move` to show a candidate move on your board with a purple highlight, so you can see what it's considering before it commits.

**Word Finder:** If enabled at game creation, `find_words` gives the LLM access to the Appel & Jacobson algorithm — same engine the computer players use. The LLM can then apply strategic judgment (rack leave, board control) to the algorithm's raw output.

## Playing a Game

Once connected, ask Claude to:

1. "Get the Wordz game context" — primes strategic thinking
2. "Check the Wordz game state" — see the board and your tiles
3. "Play CAT starting at H8 going across" — place a word
4. "Exchange my worst tiles" — swap tiles you don't want

## REST API (for other integrations)

### Authentication

Include your API key in the `x-api-key` header. Include `game_id` as a query param (GET) or in the JSON body (POST).

### Endpoints

**GET /state** — Get current game state
```bash
curl -H "x-api-key: YOUR_KEY" \
  "https://your-project-ref.supabase.co/functions/v1/game-api/state?game_id=GAME_ID"
```

**POST /move** — Make a move (accepts both `cell` and `row`/`col` formats)
```bash
curl -X POST -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "game_id": "GAME_ID",
    "action": "play",
    "tiles": [
      {"cell": "H8", "letter": "H"},
      {"cell": "I8", "letter": "I"}
    ]
  }' \
  https://your-project-ref.supabase.co/functions/v1/game-api/move
```

**POST /find-words** — Find all legal moves (requires find_words_enabled on the caller's seat)
```bash
curl -X POST -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "game_id": "GAME_ID",
    "sort_by": "score",
    "limit": 10
  }' \
  https://your-project-ref.supabase.co/functions/v1/game-api/find-words
```

**POST /preview** — Preview a move on the owner's board
**POST /suggest** — Save a suggestion from the owner (uses Supabase auth, not API key)
**POST /validate** — Dry-run move validation
