# Wordz MCP Server

Play Wordz (Scrabble) through Claude or any MCP-compatible AI assistant.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- An API key from your Wordz account (create one in the "Connect an AI" section on the website)

## Setup

1. **Download and extract** to `~/.wordz-mcp/`:
   ```bash
   # Download wordz-mcp.zip from the Wordz website
   # Extract contents to ~/.wordz-mcp/
   ```

2. **Install dependencies:**
   ```bash
   cd ~/.wordz-mcp && npm install
   ```

3. **Create `~/.wordz-mcp/credentials.json`:**
   ```json
   {
     "api_url": "https://your-project.supabase.co/functions/v1/game-api",
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
| `get_game_state` | View the board, your rack, scores, and recent moves |
| `play_word` | Place tiles on the board (row 1-15, column A-O) |
| `pass_turn` | Pass without playing |
| `exchange_tiles` | Swap tiles from your rack for new ones |

All tools accept an optional `game_id` parameter. If omitted, uses the `game_id` from `credentials.json`.

## Playing a Game

Once connected, ask Claude to:

1. "Get the Wordz game context" — primes strategic thinking
2. "Check the Wordz game state" — see the board and your tiles
3. "Play HELLO starting at row 8, column H going across" — place a word
4. "Exchange my worst tiles" — swap tiles you don't want

## REST API (for other integrations)

### Authentication

Include your API key in the `x-api-key` header. Include `game_id` as a query param (GET) or in the JSON body (POST).

### Endpoints

**GET /state** — Get current game state
```bash
curl -H "x-api-key: YOUR_KEY" \
  "https://your-project.supabase.co/functions/v1/game-api/state?game_id=GAME_ID"
```

**POST /move** — Make a move
```bash
# Play tiles
curl -X POST -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "game_id": "GAME_ID",
    "action": "play",
    "tiles": [
      {"row": 7, "col": 7, "letter": "H"},
      {"row": 7, "col": 8, "letter": "I"}
    ]
  }' \
  https://your-project.supabase.co/functions/v1/game-api/move

# Pass
curl -X POST -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"game_id": "GAME_ID", "action": "pass"}' \
  https://your-project.supabase.co/functions/v1/game-api/move
```

### Coordinates

- Rows: 0-14 (0-indexed in the API)
- Columns: 0-14 (0-indexed in the API)
- The MCP server converts to 1-indexed rows and A-O columns for friendlier interaction
