#!/usr/bin/env npx tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Configuration — set via environment variables
const API_URL = process.env.WORDZ_API_URL || "";
const API_KEY = process.env.WORDZ_API_KEY || "";

if (!API_URL || !API_KEY) {
  console.error(
    "Missing WORDZ_API_URL or WORDZ_API_KEY environment variables.\n" +
      "Set them before starting:\n" +
      "  WORDZ_API_URL=https://your-project.supabase.co/functions/v1/game-api\n" +
      "  WORDZ_API_KEY=your-api-key-here"
  );
  process.exit(1);
}

async function apiCall(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${API_URL}/${path}`, {
    method,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data;
}

// ─── Board rendering helper ───────────────────────────────────────────────────

interface TileOnBoard {
  row: number;
  col: number;
  letter: string;
  value: number;
  isBlank: boolean;
}

interface RackTile {
  letter: string;
  value: number;
  isBlank: boolean;
  id: string;
}

interface GameState {
  game_id: string;
  status: string;
  is_your_turn: boolean;
  current_turn: string;
  your_rack: RackTile[];
  your_score: number;
  tiles_on_board: TileOnBoard[];
  tiles_remaining: number;
  players: { id: string; name: string; score: number }[];
  recent_moves: { player: string; type: string; words: string[]; score: number }[];
  winner: string | null;
}

// Bonus square positions for display
const TW = new Set(["0,0","0,7","0,14","7,0","7,14","14,0","14,7","14,14"]);
const DW = new Set([
  "1,1","2,2","3,3","4,4","10,10","11,11","12,12","13,13",
  "1,13","2,12","3,11","4,10","10,4","11,3","12,2","13,1",
]);
const TL = new Set([
  "1,5","1,9","5,1","5,5","5,9","5,13",
  "9,1","9,5","9,9","9,13","13,5","13,9",
]);
const DL = new Set([
  "0,3","0,11","2,6","2,8","3,0","3,7","3,14",
  "6,2","6,6","6,8","6,12","7,3","7,11",
  "8,2","8,6","8,8","8,12","11,0","11,7","11,14",
  "12,6","12,8","14,3","14,11",
]);

function renderBoard(tiles: TileOnBoard[]): string {
  const grid: string[][] = Array.from({ length: 15 }, () =>
    Array.from({ length: 15 }, () => ".")
  );

  // Place tiles
  const tileMap = new Map<string, TileOnBoard>();
  for (const t of tiles) {
    grid[t.row][t.col] = t.letter;
    tileMap.set(`${t.row},${t.col}`, t);
  }

  // Column headers
  const header = "    " + Array.from({ length: 15 }, (_, i) =>
    String.fromCharCode(65 + i).padStart(2)
  ).join(" ");

  const lines = [header];
  for (let r = 0; r < 15; r++) {
    const rowLabel = String(r + 1).padStart(2);
    const cells = grid[r].map((cell, c) => {
      if (cell !== ".") return ` ${cell} `;
      const key = `${r},${c}`;
      if (r === 7 && c === 7) return " * ";
      if (TW.has(key)) return "3W ";
      if (DW.has(key)) return "2W ";
      if (TL.has(key)) return "3L ";
      if (DL.has(key)) return "2L ";
      return " . ";
    });
    lines.push(`${rowLabel} ${cells.join("")}`);
  }

  return lines.join("\n");
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "wordz",
  version: "1.0.0",
});

server.tool(
  "get_game_state",
  "Get the current state of the Wordz game: board, your rack, scores, whose turn it is, and recent moves",
  {},
  async () => {
    const state = (await apiCall("state")) as GameState;

    const boardText = renderBoard(state.tiles_on_board);
    const rackText = state.your_rack
      .map((t) => `${t.letter}(${t.value})`)
      .join(" ");

    const scoreText = state.players
      .map((p) => `${p.name}: ${p.score}`)
      .join(", ");

    const movesText =
      state.recent_moves.length > 0
        ? state.recent_moves
            .map(
              (m) =>
                `${m.player} ${m.type === "play" ? `played ${m.words.join(", ")} for ${m.score} pts` : m.type === "pass" ? "passed" : "exchanged tiles"}`
            )
            .join("\n")
        : "No moves yet";

    const statusText =
      state.status === "finished"
        ? `Game over! Winner: ${state.winner}`
        : state.is_your_turn
          ? "IT IS YOUR TURN"
          : `Waiting for opponent to play`;

    const text = [
      `=== WORDZ GAME STATE ===`,
      `Status: ${statusText}`,
      `Scores: ${scoreText}`,
      `Tiles remaining in bag: ${state.tiles_remaining}`,
      ``,
      `Board:`,
      boardText,
      ``,
      `Your rack: ${rackText}`,
      ``,
      `Recent moves:`,
      movesText,
      ``,
      `--- HOW TO PLAY ---`,
      `Coordinates: row is 1-15, column is A-O (A=0, B=1, ... O=14)`,
      `To play a word, use the play_word tool with tiles placed at specific positions.`,
      `Each tile needs: row (1-15), col (A-O), letter.`,
      `Example: to play "CAT" horizontally starting at row 8 col H:`,
      `  tiles: [{row: 8, col: "H", letter: "C"}, {row: 8, col: "I", letter: "A"}, {row: 8, col: "J", letter: "T"}]`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "play_word",
  "Play tiles on the board. Each tile needs row (1-15), col (A-O), and letter. All words formed must be valid. The first move must cross the center square (row 8, col H).",
  {
    tiles: z
      .array(
        z.object({
          row: z.number().min(1).max(15).describe("Row number (1-15)"),
          col: z.string().length(1).describe("Column letter (A-O)"),
          letter: z.string().length(1).describe("The letter to play"),
          is_blank: z
            .boolean()
            .optional()
            .describe("Set to true if using a blank tile"),
        })
      )
      .min(1)
      .describe("Tiles to place on the board"),
  },
  async ({ tiles }) => {
    // Convert column letters to numbers (A=0, B=1, ... O=14)
    const apiTiles = tiles.map((t) => ({
      row: t.row - 1, // Convert 1-indexed to 0-indexed
      col: t.col.toUpperCase().charCodeAt(0) - 65,
      letter: t.letter.toUpperCase(),
      is_blank: t.is_blank || false,
    }));

    try {
      const result = (await apiCall("move", "POST", {
        action: "play",
        tiles: apiTiles,
      })) as {
        success: boolean;
        words: { word: string; score: number }[];
        total_score: number;
        new_rack: RackTile[];
        game_over: boolean;
        message: string;
      };

      const wordsText = result.words
        .map((w) => `${w.word} (${w.score} pts)`)
        .join(", ");
      const newRack = result.new_rack
        .map((t) => `${t.letter}(${t.value})`)
        .join(" ");

      return {
        content: [
          {
            type: "text",
            text: [
              `Move played successfully!`,
              `Words: ${wordsText}`,
              `Total score: ${result.total_score} points`,
              `New rack: ${newRack}`,
              result.game_over ? `GAME OVER!` : `Waiting for opponent...`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Move rejected: ${(err as Error).message}\n\nCheck that:\n- It's your turn\n- All letters are in your rack\n- Tiles form a valid word in a straight line\n- The word connects to existing tiles (or crosses center on first move)`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "pass_turn",
  "Pass your turn without playing any tiles",
  {},
  async () => {
    try {
      const result = (await apiCall("move", "POST", {
        action: "pass",
      })) as { success: boolean; message: string };
      return { content: [{ type: "text", text: result.message }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "exchange_tiles",
  "Exchange tiles from your rack for new ones from the bag. Specify the tile IDs to exchange (from get_game_state rack info).",
  {
    tile_ids: z
      .array(z.string())
      .min(1)
      .describe("IDs of tiles to exchange from your rack"),
  },
  async ({ tile_ids }) => {
    try {
      const result = (await apiCall("move", "POST", {
        action: "exchange",
        tile_ids,
      })) as { success: boolean; message: string };
      return { content: [{ type: "text", text: result.message }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
