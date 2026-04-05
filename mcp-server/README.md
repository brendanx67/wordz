# Wordz MCP Server

Play Wordz (Scrabble) through Claude or any MCP-compatible AI assistant.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- An API key from a Wordz game (generated when you add an "API Player" to a game)

## Setup

1. **Download and extract** to `~/.wordz-mcp/`:
   ```bash
   # Download from the Wordz website, or copy these files manually
   mkdir -p ~/.wordz-mcp
   # Extract wordz-mcp.zip contents here
   ```

2. **Install dependencies:**
   ```bash
   cd ~/.wordz-mcp && npm install
   ```

3. **Get your API key:**
   - Go to your Wordz game at the website
   - Create a new game and add an "API Player (LLM)" slot
   - After creating the game, copy the API key shown in the dialog

## Connecting to Claude Desktop

Add the following to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wordz": {
      "command": "npx",
      "args": ["tsx", "~/.wordz-mcp/index.ts"],
      "env": {
        "WORDZ_API_URL": "https://your-project.supabase.co/functions/v1/game-api",
        "WORDZ_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Replace:
- `WORDZ_API_URL` with the API endpoint shown when you created the game
- `WORDZ_API_KEY` with your API key

## Connecting to Claude Code

```bash
claude mcp add wordz -- env WORDZ_API_URL=https://your-project.supabase.co/functions/v1/game-api WORDZ_API_KEY=your-api-key npx tsx ~/.wordz-mcp/index.ts
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_game_state` | View the board, your rack, scores, and recent moves |
| `play_word` | Place tiles on the board (row 1-15, column A-O) |
| `pass_turn` | Pass without playing |
| `exchange_tiles` | Swap tiles from your rack for new ones |

## Playing a Game

Once connected, ask Claude to:

1. "Check the Wordz game state" - see the board and your tiles
2. "Play HELLO starting at row 8, column H going across" - place a word
3. "Exchange my worst tiles" - swap tiles you don't want

## REST API (for other integrations)

The game API is also available as a standard REST API:

### Authentication

Include your API key in the `x-api-key` header:
```
x-api-key: your-api-key-here
```

### Endpoints

**GET /state** - Get current game state
```bash
curl -H "x-api-key: YOUR_KEY" \
  https://your-project.supabase.co/functions/v1/game-api/state
```

**POST /move** - Make a move
```bash
# Play tiles
curl -X POST -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
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
  -d '{"action": "pass"}' \
  https://your-project.supabase.co/functions/v1/game-api/move

# Exchange tiles
curl -X POST -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "exchange", "tile_ids": ["tile-id-1", "tile-id-2"]}' \
  https://your-project.supabase.co/functions/v1/game-api/move
```

### Coordinates

- Rows: 0-14 (0-indexed in the API)
- Columns: 0-14 (0-indexed in the API)
- The MCP server converts to 1-indexed rows and A-O columns for friendlier interaction
