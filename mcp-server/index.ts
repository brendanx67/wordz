#!/usr/bin/env npx tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
// Priority: env vars > credentials.json next to this script > ~/.wordz-mcp/credentials.json

interface Credentials {
  api_url?: string;
  api_key?: string;
  game_id?: string;
}

function loadCredentials(): Credentials {
  // Check next to the script first, then ~/.wordz-mcp/
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const paths = [
    join(scriptDir, "credentials.json"),
    join(homedir(), ".wordz-mcp", "credentials.json"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8")) as Credentials;
      } catch {
        // Ignore parse errors, try next
      }
    }
  }
  return {};
}

const creds = loadCredentials();
const API_URL = process.env.WORDZ_API_URL || creds.api_url || "";
const API_KEY = process.env.WORDZ_API_KEY || creds.api_key || "";
const DEFAULT_GAME_ID = process.env.WORDZ_GAME_ID || creds.game_id || "";

if (!API_URL || !API_KEY) {
  console.error(
    "Wordz MCP: No credentials found.\n\n" +
      "Create ~/.wordz-mcp/credentials.json:\n" +
      '  {\n' +
      '    "api_url": "https://your-project.supabase.co/functions/v1/game-api",\n' +
      '    "api_key": "your-api-key-here",\n' +
      '    "game_id": "optional-game-uuid"\n' +
      '  }\n\n' +
      "Or set environment variables: WORDZ_API_URL, WORDZ_API_KEY, WORDZ_GAME_ID"
  );
  process.exit(1);
}

function resolveGameId(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  if (!id) throw new Error("No game_id provided and WORDZ_GAME_ID not set. Pass game_id or set WORDZ_GAME_ID env var.");
  return id;
}

async function apiCall(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  gameId?: string,
): Promise<unknown> {
  const gid = resolveGameId(gameId);
  const url = method === "GET"
    ? `${API_URL}/${path}?game_id=${gid}`
    : `${API_URL}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify({ ...(body as Record<string, unknown>), game_id: gid }) : undefined,
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
  players: { id: string; name: string; score: number; type?: string; description?: string; difficulty?: string; strategy_level?: string }[];
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
  "CALL THIS FIRST. Get strategic context and briefing for playing Wordz. Use level 'master' for tournament-level expert strategy, 'club' for intermediate strategic guidance, or 'social' for a casual fun game. Default is 'master'.",
  {
    level: z
      .enum(["master", "club", "social"])
      .optional()
      .default("master")
      .describe("Strategy level: 'master' (tournament expert), 'club' (intermediate), or 'social' (casual fun)"),
  },
  async ({ level }) => {
    const text = buildContextBriefing(level);
    return { content: [{ type: "text", text }] };
  }
);

function buildContextBriefing(level: "master" | "club" | "social"): string {
  // === SOCIAL: light, friendly framing ===
  if (level === "social") {
    return [
      `=== WORDZ ===`,
      ``,
      `You're playing a friendly game of Wordz — a word game on a 15×15 board.`,
      `Place tiles from your rack to form words, crossword-style. Have fun with it!`,
      ``,
      `The board has bonus squares:`,
      `- 3W (triple word score) and 2W (double word score) multiply the whole word`,
      `- 3L (triple letter score) and 2L (double letter score) multiply individual tiles`,
      `- The center square (*) is a double word score`,
      ``,
      `A few tips:`,
      `- Try to use your high-value letters (Z, Q, X, J, K) on bonus squares`,
      `- Longer words generally score more`,
      `- Using all 7 tiles in one turn earns a 50-point bonus!`,
      `- The game uses the TWL06 dictionary — common Scrabble words are valid`,
      `- Some handy short words: QI, ZA, JO, XI, XU, AX, EX, OX`,
      ``,
      `=== HOW TO PLAY ===`,
      ``,
      `1. Call get_game_state to see the board and your rack`,
      `2. Find a good word you can make with your tiles`,
      `3. Call play_word with tiles placed at specific positions`,
      `4. Coordinates: row 1-15, column A-O`,
      `5. First move must cross the center square (row 8, col H)`,
      `6. All words formed (including cross-words) must be valid`,
      ``,
      `Enjoy the game!`,
    ].join("\n");
  }

  // === CLUB: moderate strategic guidance ===
  if (level === "club") {
    return [
      `=== WORDZ: STRATEGIC GUIDE ===`,
      ``,
      `You're playing Wordz, a competitive word game on a 15×15 board with bonus squares.`,
      `Play smart — good strategy beats raw vocabulary.`,
      ``,
      `=== KEY STRATEGIES ===`,
      ``,
      `1. RACK MANAGEMENT`,
      `   - Keep a balanced rack: mix of vowels and consonants`,
      `   - Hold onto S tiles and blanks — they're more valuable than their face value`,
      `   - If your rack is terrible (all vowels, all consonants), consider exchanging`,
      `   - Think about what tiles you'll have AFTER your play, not just the score`,
      ``,
      `2. BOARD AWARENESS`,
      `   - Use bonus squares when you can, especially with high-value tiles`,
      `   - Be careful about opening triple word squares for your opponent`,
      `   - Parallel plays (placing a word alongside an existing word) can score big`,
      `     because each overlapping column forms a separate scoring word`,
      ``,
      `3. WORD KNOWLEDGE`,
      `   - The game uses the TWL06 dictionary`,
      `   - Two-letter words are very useful: QI, ZA, JO, XI, XU, AX, EX, OX, KA`,
      `   - Q without U words: QI, QOPH, QADI, QAID, SUQ, TRANQ`,
      `   - Using all 7 tiles = 50 point bingo bonus — worth aiming for`,
      ``,
      `4. GAME SENSE`,
      `   - If you're ahead, play conservatively and keep the board tight`,
      `   - If you're behind, take risks — open up the board and go for big plays`,
      `   - In the endgame (bag empty), try to play out your tiles before your opponent`,
      ``,
      `=== HOW TO PLAY ===`,
      ``,
      `1. Call get_game_state to see the board and your rack`,
      `2. Think about both the score AND your rack leave`,
      `3. Call play_word with tiles placed at specific positions`,
      `4. Coordinates: row 1-15, column A-O`,
      `5. All played tiles must form a straight line (horizontal or vertical)`,
      `6. First move must cross the center square (row 8, col H)`,
      `7. All words formed (including cross-words) must be valid`,
      ``,
      `Play well!`,
    ].join("\n");
  }

  // === MASTER: full tournament-level expert briefing ===
  return [
    `=== WORDZ: TOURNAMENT BRIEFING ===`,
    ``,
    `You are playing Wordz at the highest competitive level. You may be facing other`,
    `AI models, expert human players, or a brute-force algorithm that uses Appel &`,
    `Jacobson (1988) anchor-based move generation to find the highest-scoring move`,
    `every single turn.`,
    ``,
    `=== KNOW YOUR OPPONENTS ===`,
    ``,
    `You may face several types of opponents:`,
    `- HARD (brute-force): Always plays the single highest-scoring move. Greedy, no strategy.`,
    `  Your edge: rack management and board control over 15-20 turns.`,
    `- COMPETITIVE (adaptive): Tries to match the leading player's score — conservative when`,
    `  ahead, aggressive when behind. Has positional awareness but no rack management.`,
    `  Your edge: superior long-term planning, bingo setups, and tile tracking.`,
    `- OTHER LLMs: Another AI model. Quality varies. Watch their move patterns.`,
    `- HUMANS: Can be unpredictable. May play strategically or casually.`,
    ``,
    `Check the "Opponents" section in get_game_state to see exactly who you're facing.`,
    ``,
    `=== MASTER-LEVEL STRATEGY ===`,
    ``,
    `1. RACK MANAGEMENT (the single most important skill)`,
    `   - Keep a balanced rack: 3 consonants, 2 vowels + flexible tiles is ideal`,
    `   - RETAIN high-synergy tiles: S, blank, E, R, N, T, A, I (the "NASTIER" letters)`,
    `   - DUMP low-synergy tiles: V, C, Q, U (when Q), duplicate vowels, duplicate consonants`,
    `   - Sacrifice 10-20 points NOW to keep a strong rack leave for NEXT turn`,
    `   - A blank tile is worth ~30 points in future potential — never waste it on a low-scoring play`,
    `   - The S tile adds ~8-10 points of strategic value — save it to pluralize AND form a parallel word`,
    `   - Evaluate every candidate move by: (points scored) + (quality of rack leave)`,
    `   - A 25-point play leaving ERST is BETTER than a 35-point play leaving VUU`,
    ``,
    `2. BOARD CONTROL`,
    `   - BLOCK triple word squares (corners, edges) when your opponent could exploit them`,
    `   - OPEN bonus squares only when YOU can use them next turn`,
    `   - Play PARALLEL to existing words — they form multiple cross-words, each scoring bonus multipliers`,
    `   - Short words near the center keep the board tight and limit opponent options`,
    `   - DON'T open the triple-triple lanes (rows/columns connecting two triple word squares)`,
    `   - A triple-triple (landing on two TWS at once) scores 9× the word — game-changing`,
    `   - Control the hot spots: columns A/O and rows 1/15 near corner TWS`,
    ``,
    `3. TILE TRACKING`,
    `   - There are 100 tiles total. Track what's been played to estimate what remains.`,
    `   - Key distributions: E×12, A×9, I×9, O×8, N×6, R×6, T×6, S×4, blank×2`,
    `   - Late game: if all S tiles are played, your opponent can't pluralize your words`,
    `   - If both blanks are gone, bingo probability drops dramatically`,
    `   - Count high-value tiles (J, Q, X, Z) — knowing they're gone changes your risk calculus`,
    `   - With ~20 tiles left in the bag, start inferring your opponent's likely rack`,
    ``,
    `4. BINGO STRATEGY (using all 7 tiles = +50 bonus)`,
    `   - Top players average 2-3 bingos per game. This is a major scoring edge.`,
    `   - Keep common bingo-friendly leaves: -ING, -TION, -ER, -ED, -EST, -IEST, RE-, UN-, OUT-`,
    `   - The letters SATIRE, RETINA, RETAIN are the most bingo-prone combinations`,
    `   - Holding 5-6 good tiles? Consider exchanging 1-2 bad ones instead of a mediocre play`,
    `   - An exchange that sets up a bingo next turn is worth more than a 20-point play now`,
    ``,
    `5. ENDGAME MASTERY`,
    `   - When the bag is empty, you can deduce exactly what tiles your opponent holds`,
    `   - Going out first earns you the sum of opponent's remaining tile values (added to your score, subtracted from theirs)`,
    `   - Sometimes passing strategically forces the opponent to open a scoring lane you need`,
    `   - In a close endgame, count every point — a 2-point swing on the last move decides games`,
    `   - Consider "stuck tile" scenarios — can your opponent even play their tiles?`,
    ``,
    `6. POSITIONAL PLAY`,
    `   - If ahead by 50+: close the board aggressively, play short words, deny bonus squares`,
    `   - If behind by 50+: open the board, take risks, seek bingos and triple word scores`,
    `   - If close: focus on rack management and incremental advantages`,
    `   - In the mid-game, the player who controls the tempo (open vs. closed board) usually wins`,
    ``,
    `=== CRITICAL WORD KNOWLEDGE ===`,
    ``,
    `The game uses the TWL06 (Tournament Word List) dictionary.`,
    ``,
    `Essential two-letter words (memorize these — they enable parallel plays):`,
    `  AA AB AD AE AG AH AI AL AM AN AR AS AT AW AX AY`,
    `  BA BE BI BO BY DA DE DO ED EF EH EL EM EN ER ES ET EX`,
    `  FA FE GO HA HE HI HM HO ID IF IN IS IT JO KA KI LA`,
    `  LI LO MA ME MI MM MO MU MY NA NE NO NU OD OE OF OH OI`,
    `  OM ON OP OR OS OW OX OY PA PE PI PO QI RE SH SI SO TA`,
    `  TI TO UH UM UN UP US UT WE WO XI XU YA YE ZA`,
    ``,
    `Q without U: QI, QOPH, QADI, QAID, QANAT, QINTAR, QINDAR, QWERTY, SUQ, TRANQ, FAQIR`,
    `High-value short words: ZA, ZAX, ZEP, ZAG, ZIT, JO, JIN, JAB, JAG, JAW, JEW, KA, KI`,
    ``,
    `=== HOW TO PLAY ===`,
    ``,
    `1. Call get_game_state to see the board and your rack`,
    `2. For EVERY candidate move, evaluate: score + rack leave quality + board implications`,
    `3. Call play_word with tiles placed at specific positions`,
    `4. Coordinates: row 1-15, column A-O`,
    `5. All played tiles must form a straight line (horizontal or vertical)`,
    `6. First move must cross the center square (row 8, col H)`,
    `7. All words formed (including cross-words) must be valid`,
    ``,
    `=== TOURNAMENT MINDSET ===`,
    ``,
    `You are a tournament Scrabble master. Every single turn, evaluate:`,
    `- "What are my top 3 candidate moves?"`,
    `- "What's my rack leave after each one?"`,
    `- "Am I opening a bonus square my opponent can exploit?"`,
    `- "What's the score differential? Should I play open or closed?"`,
    `- "Is a bingo possible? Is it worth exchanging to set one up?"`,
    `- "What tiles are left in the bag? What might my opponent have?"`,
    ``,
    `Against brute-force: it WILL outscore you on any given turn.`,
    `You win by outthinking it over the full game through rack management,`,
    `board control, and strategic sacrifice.`,
    `Against adaptive: it adjusts to the score — stay unpredictable and`,
    `build toward big plays it can't anticipate.`,
    `This is how masters play.`,
    ``,
    `Play like a champion.`,
  ].join("\n");
}

server.tool(
  "get_game_state",
  "Get the current state of the Wordz game: board, your rack, scores, whose turn it is, and recent moves",
  {
    game_id: z.string().optional().describe("Game ID (optional if WORDZ_GAME_ID env var is set)"),
  },
  async ({ game_id }) => {
    const state = (await apiCall("state", "GET", undefined, game_id)) as GameState;

    const boardText = renderBoard(state.tiles_on_board);
    const rackText = state.your_rack
      .map((t) => `${t.letter}(${t.value})`)
      .join(" ");

    const scoreText = state.players
      .map((p) => `${p.name}: ${p.score}`)
      .join(", ");

    // Describe opponents
    const opponents = state.players.filter(p => p.id !== "you");
    const opponentDescriptions = state.players
      .map((p) => {
        if (p.type === "computer") {
          const diffDesc = p.difficulty === "competitive"
            ? "ADAPTIVE ALGORITHM: Targets the top opponent's score each turn — plays conservatively when ahead, aggressively when behind. Has a crude sense of game position."
            : p.difficulty === "hard"
              ? "BRUTE-FORCE ALGORITHM: Exhaustively searches all legal moves and always plays the highest-scoring one. Pure greedy optimization, no strategic thinking."
              : p.difficulty === "medium"
                ? "ALGORITHM (medium): Picks a good but not always optimal move."
                : "ALGORITHM (easy): Plays simple, lower-scoring moves.";
          return `${p.name} — ${diffDesc}`;
        }
        if (p.type === "api") {
          return `${p.name} — LLM/AI PLAYER (strategy: ${p.strategy_level ?? "unknown"}): Another AI model playing via API.`;
        }
        if (p.type === "human") {
          return `${p.name} — HUMAN PLAYER: A person playing through the web interface.`;
        }
        return `${p.name} — Unknown player type`;
      })
      .join("\n");
    void opponents;

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
      `Opponents:`,
      opponentDescriptions,
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
    game_id: z.string().optional().describe("Game ID (optional if WORDZ_GAME_ID env var is set)"),
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
  async ({ game_id, tiles }) => {
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
      }, game_id)) as {
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
  {
    game_id: z.string().optional().describe("Game ID (optional if WORDZ_GAME_ID env var is set)"),
  },
  async ({ game_id }) => {
    try {
      const result = (await apiCall("move", "POST", {
        action: "pass",
      }, game_id)) as { success: boolean; message: string };
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
    game_id: z.string().optional().describe("Game ID (optional if WORDZ_GAME_ID env var is set)"),
    tile_ids: z
      .array(z.string())
      .min(1)
      .describe("IDs of tiles to exchange from your rack"),
  },
  async ({ game_id, tile_ids }) => {
    try {
      const result = (await apiCall("move", "POST", {
        action: "exchange",
        tile_ids,
      }, game_id)) as { success: boolean; message: string };
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
