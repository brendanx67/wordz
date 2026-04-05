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
  "game_context",
  "CALL THIS FIRST. Get strategic context, rules, and competitive briefing for playing Wordz. This primes you with expert Scrabble strategy that will dramatically improve your play.",
  {},
  async () => {
    const text = [
      `=== WORDZ: STRATEGIC BRIEFING ===`,
      ``,
      `You are playing Wordz, a competitive word game on a 15×15 board with bonus squares.`,
      `You may be competing against other AI models, human players, or a brute-force`,
      `algorithm that uses the Appel & Jacobson (1988) anchor-based move generation`,
      `to find the highest-scoring move every turn.`,
      ``,
      `=== YOUR COMPETITIVE ADVANTAGE ===`,
      ``,
      `The brute-force algorithm is greedy — it always plays the highest-scoring move`,
      `available RIGHT NOW. It has zero concept of strategy. You can beat it by thinking`,
      `ahead, just as expert Scrabble players beat raw computation with superior strategy.`,
      ``,
      `=== EXPERT SCRABBLE STRATEGY ===`,
      ``,
      `1. RACK MANAGEMENT (most important)`,
      `   - Keep a balanced rack: mix of vowels and consonants (ideal: 3 consonants, 2 vowels + flexible tiles)`,
      `   - RETAIN high-synergy tiles: S, blank, E, R, N, T, A, I (the "NASTIER" letters)`,
      `   - DUMP low-synergy tiles: V, C, Q, U (when Q), duplicate vowels, duplicate consonants`,
      `   - Sacrifice 10-20 points NOW to keep a strong rack leave for NEXT turn`,
      `   - A blank tile is worth ~30 points in future potential — don't waste it on a low-scoring play`,
      `   - The S tile adds ~8-10 points of value — save it to pluralize AND form a parallel word`,
      ``,
      `2. BOARD CONTROL`,
      `   - BLOCK triple word squares (corners, edges) when your opponent could exploit them`,
      `   - OPEN bonus squares only when YOU can use them next turn`,
      `   - Play PARALLEL to existing words — they form multiple cross-words, each scoring bonus multipliers`,
      `   - Short words near the center keep the board tight and limit opponent options`,
      `   - DON'T open the triple-triple lanes (rows/columns that connect two triple word squares)`,
      ``,
      `3. TILE TRACKING`,
      `   - There are 100 tiles total. Track what's been played to estimate what's left.`,
      `   - Key distributions: E×12, A×9, I×9, O×8, N×6, R×6, T×6, S×4, blank×2`,
      `   - Late game: if all S tiles are played, your opponent can't pluralize your words`,
      `   - If blanks are gone, high-scoring plays become much harder`,
      ``,
      `4. BINGO STRATEGY (using all 7 tiles = +50 bonus)`,
      `   - Keep common bingo-friendly leaves: -ING, -TION, -ER, -ED, -EST, RE-, UN-`,
      `   - 7-letter and 8-letter words are your biggest scoring opportunity`,
      `   - Holding 5-6 good tiles? Consider exchanging 1-2 bad ones instead of a mediocre play`,
      ``,
      `5. ENDGAME`,
      `   - When the bag is empty, you can see exactly what tiles your opponent holds`,
      `   - Go out first (play all your tiles) to get the bonus of opponent's remaining tile values`,
      `   - Sometimes passing is better than playing if it forces the opponent to open a scoring lane`,
      ``,
      `6. DEFENSIVE PLAY`,
      `   - If ahead: close the board, play short words, protect leads`,
      `   - If behind: open the board, take risks, seek bingos and triple word scores`,
      `   - Track the score differential — adjust strategy based on whether you're winning or losing`,
      ``,
      `=== WORD KNOWLEDGE ===`,
      ``,
      `The game uses the TWL06 (Tournament Word List) dictionary. Key high-value words:`,
      `- Two-letter words are critical for parallel plays: QI, ZA, JO, XI, XU, AX, EX, OX`,
      `- Q without U: QI, QOPH, QADI, QAID, QANAT, QINTAR, QINDAR, QWERTY, SUQ, TRANQ`,
      `- High-scoring short words: ZA, ZO, ZAX, ZEP, ZAG, JO, JIN, JAB, JAG, KA, KI`,
      `- Common bingos with -ING: SEATING,EARING, STARING, DEALING, LEADING`,
      `- Common bingos with -TION: STATION, ERATION, INATION`,
      ``,
      `=== HOW TO PLAY ===`,
      ``,
      `1. Call get_game_state to see the board and your rack`,
      `2. Think strategically about rack leave, not just the highest score`,
      `3. Call play_word with tiles placed at specific positions`,
      `4. Coordinates: row 1-15, column A-O`,
      `5. All played tiles must form a straight line (horizontal or vertical)`,
      `6. First move must cross the center square (row 8, col H)`,
      `7. All words formed (including cross-words) must be valid`,
      ``,
      `=== COMPETITIVE MINDSET ===`,
      ``,
      `Think like a tournament Scrabble player, not a casual one. Every turn, ask yourself:`,
      `- "What's my rack leave after this play?"`,
      `- "Am I opening a bonus square my opponent can exploit?"`,
      `- "Should I sacrifice points now for a better rack next turn?"`,
      `- "Am I ahead or behind? Should I play offensively or defensively?"`,
      ``,
      `The brute-force algorithm WILL outscore you on any given turn.`,
      `You win by outscoring it over 15-20 turns through superior strategy.`,
      ``,
      `Good luck. Play like a champion.`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

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

    // Score differential for strategic context
    const myScore = state.your_score;
    const opponentScores = state.players.filter(p => p.score !== myScore || p.name !== "You");
    const maxOpponentScore = Math.max(...state.players.map(p => p.score), 0);
    const scoreDiff = myScore - maxOpponentScore;
    const positionHint = scoreDiff > 30
      ? "You're ahead — consider defensive play (short words, close the board)."
      : scoreDiff < -30
        ? "You're behind — play aggressively (open the board, seek bingos and bonus squares)."
        : "Game is close — balance scoring with rack management.";

    // Rack quality assessment
    const vowels = state.your_rack.filter(t => "AEIOU".includes(t.letter)).length;
    const blanks = state.your_rack.filter(t => t.isBlank).length;
    const sCount = state.your_rack.filter(t => t.letter === "S").length;
    const highValue = state.your_rack.filter(t => t.value >= 4);
    const rackHints: string[] = [];
    if (blanks > 0) rackHints.push(`You have ${blanks} blank(s) — save for bingo or high-value play`);
    if (sCount > 0) rackHints.push(`You have ${sCount} S tile(s) — use to pluralize AND form cross-words`);
    if (vowels >= 5) rackHints.push("Too many vowels — consider exchanging some");
    if (vowels <= 1) rackHints.push("Low on vowels — consider exchanging consonants");
    if (highValue.length >= 3) rackHints.push(`High-value tiles (${highValue.map(t => t.letter).join(",")}) — try to place on bonus squares`);

    void opponentScores;

    const text = [
      `=== WORDZ GAME STATE ===`,
      `Status: ${statusText}`,
      `Scores: ${scoreText}`,
      `Score differential: ${scoreDiff >= 0 ? "+" : ""}${scoreDiff} | ${positionHint}`,
      `Tiles remaining in bag: ${state.tiles_remaining}`,
      ``,
      `Board:`,
      boardText,
      ``,
      `Your rack: ${rackText}`,
      ...(rackHints.length > 0 ? [`Rack notes: ${rackHints.join(". ")}`] : []),
      ``,
      `Recent moves:`,
      movesText,
      ``,
      `--- REMEMBER ---`,
      `Think about RACK LEAVE — what tiles remain after your play matters as much as the score.`,
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
