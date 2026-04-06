import { createClient } from "jsr:@supabase/supabase-js@2";
import type { Tile, BoardCell } from "./_shared/gameConstants.ts";
import { BOARD_SIZE, RACK_SIZE, getBonusType } from "./_shared/gameConstants.ts";
import type { TrieNode } from "./_shared/trie.ts";
import { buildTrie, isWord } from "./_shared/trie.ts";
import type { GeneratedMove } from "./_shared/moveGenerator.ts";
import { generateAllMoves } from "./_shared/moveGenerator.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

interface ApiPlayer {
  id: string;
  name: string;
  rack: Tile[];
  score: number;
}

// ─── Dictionary loader (uses shared Trie with built-in cache) ────────────────
let wordListCache: string | null = null;

async function getWordList(): Promise<string> {
  if (wordListCache) return wordListCache;
  const res = await fetch(
    "https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt"
  );
  wordListCache = await res.text();
  return wordListCache;
}

async function getTrie(): Promise<TrieNode> {
  return buildTrie(await getWordList());
}

// ─── Cell notation support (accepts both "H8" cell format and {row, col} format) ───
interface RawTile {
  row?: number;
  col?: number;
  cell?: string;
  letter: string;
  is_blank?: boolean;
}

function normalizeTile(t: RawTile): { row: number; col: number; letter: string; is_blank: boolean } {
  let row: number;
  let col: number;
  if (t.cell) {
    const match = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/);
    if (!match) throw new Error(`Invalid cell "${t.cell}" — use format like H8`);
    col = match[1].charCodeAt(0) - 65;
    row = parseInt(match[2]) - 1;
    if (row < 0 || row > 14) throw new Error(`Invalid row in cell "${t.cell}"`);
  } else if (t.row !== undefined && t.col !== undefined) {
    row = t.row;
    col = t.col;
  } else {
    throw new Error("Each tile must have either 'cell' (e.g. 'H8') or 'row' and 'col'");
  }
  return { row, col, letter: t.letter.toUpperCase(), is_blank: t.is_blank || false };
}

// ─── SCORING ──────────────────────────────────────────────────────────────────
interface WordFound {
  word: string;
  score: number;
  cells: { row: number; col: number }[];
}

function scoreMove(
  board: BoardCell[][],
  placedTiles: { row: number; col: number; tile: Tile }[],
  isFirstMove: boolean
): { valid: boolean; words: WordFound[]; totalScore: number; error?: string } {
  if (placedTiles.length === 0) {
    return { valid: false, words: [], totalScore: 0, error: "No tiles placed" };
  }

  const rows = new Set(placedTiles.map((t) => t.row));
  const cols = new Set(placedTiles.map((t) => t.col));
  const isHorizontal = rows.size === 1;
  const isVertical = cols.size === 1;

  if (!isHorizontal && !isVertical) {
    return { valid: false, words: [], totalScore: 0, error: "Tiles must be in a single row or column" };
  }

  if (isFirstMove) {
    if (!placedTiles.some((t) => t.row === 7 && t.col === 7)) {
      return { valid: false, words: [], totalScore: 0, error: "First word must cover center square" };
    }
    if (placedTiles.length < 2) {
      return { valid: false, words: [], totalScore: 0, error: "First word must be at least 2 letters" };
    }
  }

  // Check tiles don't overlap existing tiles
  for (const pt of placedTiles) {
    if (board[pt.row]?.[pt.col]?.tile) {
      return { valid: false, words: [], totalScore: 0, error: `Square (${pt.row},${pt.col}) already occupied` };
    }
    if (pt.row < 0 || pt.row >= BOARD_SIZE || pt.col < 0 || pt.col >= BOARD_SIZE) {
      return { valid: false, words: [], totalScore: 0, error: `Position (${pt.row},${pt.col}) out of bounds` };
    }
  }

  const tempBoard: BoardCell[][] = board.map((row) => row.map((cell) => ({ ...cell })));
  for (const pt of placedTiles) {
    tempBoard[pt.row][pt.col] = { tile: pt.tile, bonus: getBonusType(pt.row, pt.col), isNew: true };
  }

  // Contiguity check
  if (isHorizontal) {
    const row = placedTiles[0].row;
    const minCol = Math.min(...placedTiles.map((t) => t.col));
    const maxCol = Math.max(...placedTiles.map((t) => t.col));
    for (let c = minCol; c <= maxCol; c++) {
      if (!tempBoard[row][c].tile) {
        return { valid: false, words: [], totalScore: 0, error: "Tiles must be contiguous" };
      }
    }
  } else {
    const col = placedTiles[0].col;
    const minRow = Math.min(...placedTiles.map((t) => t.row));
    const maxRow = Math.max(...placedTiles.map((t) => t.row));
    for (let r = minRow; r <= maxRow; r++) {
      if (!tempBoard[r][col].tile) {
        return { valid: false, words: [], totalScore: 0, error: "Tiles must be contiguous" };
      }
    }
  }

  // Adjacency check (must connect to existing tiles unless first move)
  if (!isFirstMove) {
    const connects = placedTiles.some((pt) => {
      return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
        const r = pt.row + dr, c = pt.col + dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
        return board[r][c].tile !== null;
      });
    });
    if (!connects) {
      return { valid: false, words: [], totalScore: 0, error: "Must connect to existing tiles" };
    }
  }

  const newPositions = new Set(placedTiles.map((t) => `${t.row},${t.col}`));
  const words: WordFound[] = [];

  const mainWord = getWordAt(tempBoard, placedTiles[0].row, placedTiles[0].col, isHorizontal, newPositions);
  if (mainWord && mainWord.word.length >= 2) words.push(mainWord);

  for (const pt of placedTiles) {
    const cross = getWordAt(tempBoard, pt.row, pt.col, !isHorizontal, newPositions);
    if (cross && cross.word.length >= 2) words.push(cross);
  }

  if (words.length === 0) {
    return { valid: false, words: [], totalScore: 0, error: "Must form at least one word" };
  }

  let totalScore = words.reduce((sum, w) => sum + w.score, 0);
  if (placedTiles.length === RACK_SIZE) totalScore += 50;

  return { valid: true, words, totalScore };
}

function getWordAt(
  board: BoardCell[][], row: number, col: number,
  horizontal: boolean, newPositions: Set<string>
): WordFound | null {
  let r = row, c = col;
  if (horizontal) { while (c > 0 && board[r][c - 1].tile) c--; }
  else { while (r > 0 && board[r - 1][c].tile) r--; }

  let word = "";
  let rawScore = 0;
  let wordMult = 1;
  const cells: { row: number; col: number }[] = [];

  while (r < BOARD_SIZE && c < BOARD_SIZE && board[r][c].tile) {
    const cell = board[r][c];
    const tile = cell.tile!;
    let ls = tile.value;
    if (newPositions.has(`${r},${c}`) && cell.bonus) {
      switch (cell.bonus) {
        case "DL": ls *= 2; break;
        case "TL": ls *= 3; break;
        case "DW": case "CENTER": wordMult *= 2; break;
        case "TW": wordMult *= 3; break;
      }
    }
    rawScore += ls;
    word += tile.letter;
    cells.push({ row: r, col: c });
    if (horizontal) c++; else r++;
  }

  if (word.length < 2) return null;
  return { word, score: rawScore * wordMult, cells };
}

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
async function authenticateUser(req: Request): Promise<{ userId: string } | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return null;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("user_id")
    .eq("api_key", apiKey)
    .single();

  if (error || !data) return null;
  return { userId: data.user_id };
}

async function authenticateApiKey(
  req: Request,
  gameIdOverride?: string
): Promise<{ userId: string; gameId: string; playerId: string; playerName: string } | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return null;

  const supabase = getServiceClient();

  // Look up user-level API key
  const { data: keyData, error: keyErr } = await supabase
    .from("api_keys")
    .select("user_id")
    .eq("api_key", apiKey)
    .single();

  if (keyErr || !keyData) return null;

  // Get game_id from query param, body, or override
  const url = new URL(req.url);
  const gameId = gameIdOverride || url.searchParams.get("game_id");
  if (!gameId) return null;

  // Find the API player slot in this game that belongs to this user
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("computer_players")
    .eq("id", gameId)
    .single();

  if (gameErr || !game) return null;

  const cpPlayers = (game.computer_players ?? []) as (ApiPlayer & { owner_id?: string })[];
  const myApiPlayer = cpPlayers.find(
    (p) => p.id.startsWith("api-") && p.owner_id === keyData.user_id
  );

  if (!myApiPlayer) return null;

  return {
    userId: keyData.user_id,
    gameId,
    playerId: myApiPlayer.id,
    playerName: myApiPlayer.name,
  };
}

// ─── ROUTE HANDLERS ───────────────────────────────────────────────────────────

async function handleGetGame(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();
  const { data: game, error } = await supabase
    .from("games")
    .select("id, status, board, current_turn, turn_order, turn_index, tile_bag, consecutive_passes, winner, computer_players, move_history, suggested_move, word_finder_enabled, game_players(player_id, score, profiles(display_name))")
    .eq("id", auth.gameId)
    .single();

  if (error || !game) return jsonError("Game not found", 404);

  // Find the API player's data from computer_players (API players stored there)
  const allPlayers = (game.computer_players ?? []) as ApiPlayer[];
  const myPlayer = allPlayers.find((p: ApiPlayer) => p.id === auth.playerId);

  // Build a clean view of the board
  const board = (game.board as BoardCell[][]).map((row: BoardCell[]) =>
    row.map((cell: BoardCell) => ({
      letter: cell.tile?.letter ?? null,
      value: cell.tile?.value ?? null,
      isBlank: cell.tile?.isBlank ?? false,
      bonus: getBonusType(
        (game.board as BoardCell[][]).indexOf(row),
        row.indexOf(cell)
      ),
    }))
  );

  // Rebuild board with proper coordinates
  const boardView: {
    row: number; col: number;
    letter: string | null; value: number | null;
    isBlank: boolean;
  }[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = (game.board as BoardCell[][])[r][c];
      if (cell.tile) {
        boardView.push({
          row: r, col: c,
          letter: cell.tile.letter,
          value: cell.tile.value,
          isBlank: cell.tile.isBlank,
        });
      }
    }
  }

  // Build scoreboard with player type info
  const humanPlayers = (game.game_players ?? []).map((p: { player_id: string; score: number; profiles: { display_name: string } }) => ({
    id: p.player_id,
    name: p.profiles.display_name,
    score: p.score,
    type: "human" as const,
    description: "Human player",
  }));

  const aiPlayers = allPlayers.map((p: ApiPlayer & { difficulty?: string; strategyLevel?: string }) => {
    const isComputer = p.id.startsWith("computer-");
    const isApi = p.id.startsWith("api-");
    return {
      id: p.id,
      name: p.name,
      score: p.score,
      type: isComputer ? "computer" as const : isApi ? "api" as const : "unknown" as const,
      description: isComputer
        ? (p.difficulty === "competitive"
          ? `Adaptive algorithm (competitive) — targets the top opponent's score each turn, playing conservatively when ahead and aggressively when behind`
          : p.difficulty === "hard"
            ? `Brute-force algorithm (hard) — exhaustively searches all legal moves and always plays the highest-scoring one`
            : p.difficulty === "medium"
              ? `Algorithm (medium) — picks a good but not always optimal move from the top candidates`
              : `Algorithm (easy) — plays simple, lower-scoring moves`)
        : isApi
          ? `LLM/AI player via API (strategy level: ${p.strategyLevel ?? "unknown"})`
          : "Unknown player type",
      ...(isComputer && p.difficulty ? { difficulty: p.difficulty } : {}),
      ...(isApi && p.strategyLevel ? { strategy_level: p.strategyLevel } : {}),
    };
  });

  const tilesRemaining = ((game.tile_bag ?? []) as Tile[]).length;

  // Recent moves from move_history
  const moveHistory = ((game.move_history ?? []) as {
    player_name: string; type: string;
    words?: { word: string; score: number }[];
    score?: number;
  }[]).slice(-10).reverse().map((m) => ({
    player: m.player_name,
    type: m.type,
    words: m.words?.map((w) => w.word) ?? [],
    score: m.score ?? 0,
  }));

  void board; // we use boardView instead

  return jsonOk({
    game_id: game.id,
    status: game.status,
    is_your_turn: game.current_turn === auth.playerId,
    current_turn: game.current_turn,
    your_rack: myPlayer?.rack.map((t: Tile) => ({
      letter: t.letter,
      value: t.value,
      isBlank: t.isBlank,
      id: t.id,
    })) ?? [],
    your_score: myPlayer?.score ?? 0,
    tiles_on_board: boardView,
    tiles_remaining: tilesRemaining,
    players: [...humanPlayers, ...aiPlayers],
    recent_moves: moveHistory,
    winner: game.winner,
    word_finder_enabled: game.word_finder_enabled ?? false,
    suggested_move: game.suggested_move ?? null,
    previewed_move: game.previewed_move ?? null,
  });
}

async function handlePlayMove(req: Request): Promise<Response> {
  const body = await req.json();
  const { action, tiles, tile_ids, game_id } = body as {
    action: "play" | "pass" | "exchange";
    tiles?: { row: number; col: number; letter: string; is_blank?: boolean }[];
    tile_ids?: string[]; // for exchange
    game_id?: string;
  };

  const auth = await authenticateApiKey(req, game_id);
  if (!auth) return jsonError("Invalid or missing API key, or no API player slot in this game", 401);

  if (!action) return jsonError("Missing action field", 400);

  const supabase = getServiceClient();
  const { data: game, error: gErr } = await supabase
    .from("games")
    .select("*, game_players(player_id, score)")
    .eq("id", auth.gameId)
    .single();

  if (gErr || !game) return jsonError("Game not found", 404);
  if (game.status !== "active") return jsonError("Game is not active", 400);
  if (game.current_turn !== auth.playerId) return jsonError("Not your turn", 400);

  const cpPlayers = (game.computer_players ?? []) as ApiPlayer[];
  const myPlayer = cpPlayers.find((p: ApiPlayer) => p.id === auth.playerId);
  if (!myPlayer) return jsonError("Player not found in game", 404);

  const boardState = game.board as BoardCell[][];
  const turnOrder = game.turn_order as string[];
  const nextIndex = (game.turn_index + 1) % turnOrder.length;
  const nextPlayer = turnOrder[nextIndex];

  if (action === "pass") {
    const newPasses = game.consecutive_passes + 1;

    const historyEntry = {
      player_id: auth.playerId,
      player_name: myPlayer.name,
      type: "pass",
      board_snapshot: boardState,
      timestamp: new Date().toISOString(),
    };

    // Check if game ends (all players passed consecutively)
    if (newPasses >= turnOrder.length * 2) {
      // Game over
      const { error } = await supabase
        .from("games")
        .update({
          status: "finished",
          winner: findWinner(game),
          consecutive_passes: newPasses,
          move_history: [...((game.move_history ?? []) as unknown[]), historyEntry],
          updated_at: new Date().toISOString(),
        })
        .eq("id", auth.gameId);
      if (error) return jsonError("Failed to update game", 500);
      return jsonOk({ success: true, message: "Pass recorded. Game over (consecutive passes)." });
    }

    const { error } = await supabase
      .from("games")
      .update({
        current_turn: nextPlayer,
        turn_index: nextIndex,
        consecutive_passes: newPasses,
        last_move: { player_id: auth.playerId, type: "pass" },
        move_history: [...((game.move_history ?? []) as unknown[]), historyEntry],
        updated_at: new Date().toISOString(),
      })
      .eq("id", auth.gameId);
    if (error) return jsonError("Failed to update game", 500);
    return jsonOk({ success: true, message: "Pass recorded." });
  }

  if (action === "exchange") {
    if (!tile_ids || tile_ids.length === 0) {
      return jsonError("Must specify tile_ids to exchange", 400);
    }
    const tileBag = (game.tile_bag ?? []) as Tile[];
    if (tileBag.length < tile_ids.length) {
      return jsonError("Not enough tiles in bag to exchange", 400);
    }

    const exchangeSet = new Set(tile_ids);
    const keptTiles = myPlayer.rack.filter((t: Tile) => !exchangeSet.has(t.id));
    const returnedTiles = myPlayer.rack.filter((t: Tile) => exchangeSet.has(t.id));

    if (returnedTiles.length !== tile_ids.length) {
      return jsonError("Some tile_ids not found in your rack", 400);
    }

    const drawn = tileBag.slice(0, tile_ids.length);
    const remaining = [...tileBag.slice(tile_ids.length), ...returnedTiles];
    // Shuffle remaining
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    const updatedCp = cpPlayers.map((p: ApiPlayer) =>
      p.id === auth.playerId ? { ...p, rack: [...keptTiles, ...drawn] } : p
    );

    const historyEntry = {
      player_id: auth.playerId,
      player_name: myPlayer.name,
      type: "exchange",
      board_snapshot: boardState,
      timestamp: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("games")
      .update({
        tile_bag: remaining,
        computer_players: updatedCp,
        current_turn: nextPlayer,
        turn_index: nextIndex,
        consecutive_passes: game.consecutive_passes + 1,
        last_move: { player_id: auth.playerId, type: "exchange" },
        move_history: [...((game.move_history ?? []) as unknown[]), historyEntry],
        updated_at: new Date().toISOString(),
      })
      .eq("id", auth.gameId);
    if (error) return jsonError("Failed to update game", 500);
    return jsonOk({ success: true, message: `Exchanged ${tile_ids.length} tiles.` });
  }

  // action === "play"
  if (!tiles || tiles.length === 0) {
    return jsonError("Must specify tiles to play", 400);
  }

  // Normalize tiles — accept both cell notation ("H8") and row/col format
  let normalizedTiles: { row: number; col: number; letter: string; is_blank: boolean }[];
  try {
    normalizedTiles = tiles.map(normalizeTile);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  // Map submitted tiles to actual rack tiles
  const placedTiles: { row: number; col: number; tile: Tile }[] = [];
  const usedRackTileIds = new Set<string>();

  for (const t of normalizedTiles) {
    let rackTile: Tile | undefined;
    if (t.is_blank) {
      rackTile = myPlayer.rack.find(
        (rt: Tile) => rt.isBlank && !usedRackTileIds.has(rt.id)
      );
      if (!rackTile) return jsonError(`No blank tile in rack`, 400);
      rackTile = { ...rackTile, letter: t.letter, value: 0 };
    } else {
      rackTile = myPlayer.rack.find(
        (rt: Tile) =>
          rt.letter === t.letter &&
          !rt.isBlank &&
          !usedRackTileIds.has(rt.id)
      );
      if (!rackTile) return jsonError(`Letter '${t.letter}' not in your rack`, 400);
    }
    usedRackTileIds.add(rackTile.id);
    placedTiles.push({ row: t.row, col: t.col, tile: rackTile });
  }

  // Check if first move
  const isFirstMove = !boardState.some((row: BoardCell[]) =>
    row.some((cell: BoardCell) => cell.tile !== null)
  );

  // Validate and score
  const result = scoreMove(boardState, placedTiles, isFirstMove);
  if (!result.valid) {
    return jsonError(result.error || "Invalid move", 400);
  }

  // Validate all words against dictionary
  const trie = await getTrie();
  for (const w of result.words) {
    if (!isWord(trie, w.word.toUpperCase())) {
      return jsonError(`'${w.word}' is not a valid word`, 400);
    }
  }

  // Apply tiles to board
  const newBoard = boardState.map((row: BoardCell[]) => row.map((cell: BoardCell) => ({ ...cell })));
  for (const pt of placedTiles) {
    newBoard[pt.row][pt.col] = {
      tile: pt.tile,
      bonus: getBonusType(pt.row, pt.col),
      isNew: false,
    };
  }

  // Draw new tiles
  const tileBag = (game.tile_bag ?? []) as Tile[];
  const drawn = tileBag.slice(0, placedTiles.length);
  const remaining = tileBag.slice(placedTiles.length);

  const newRack = [
    ...myPlayer.rack.filter((t: Tile) => !usedRackTileIds.has(t.id)),
    ...drawn,
  ];
  const newScore = myPlayer.score + result.totalScore;

  const updatedCp = cpPlayers.map((p: ApiPlayer) =>
    p.id === auth.playerId ? { ...p, rack: newRack, score: newScore } : p
  );

  const historyEntry = {
    player_id: auth.playerId,
    player_name: myPlayer.name,
    type: "play",
    tiles: placedTiles,
    words: result.words,
    score: result.totalScore,
    rack_snapshot: myPlayer.rack.map((t: Tile) => ({ letter: t.letter, value: t.value, isBlank: t.isBlank })),
    board_snapshot: newBoard,
    timestamp: new Date().toISOString(),
  };

  // Check for game over (player used all tiles and bag empty)
  const gameOver = newRack.length === 0 && remaining.length === 0;

  const updateData: Record<string, unknown> = {
    board: newBoard,
    tile_bag: remaining,
    computer_players: updatedCp,
    current_turn: gameOver ? null : nextPlayer,
    turn_index: nextIndex,
    consecutive_passes: 0,
    suggested_move: null,
    previewed_move: null,
    last_move: {
      player_id: auth.playerId,
      type: "play",
      tiles: placedTiles,
      words: result.words,
      score: result.totalScore,
    },
    move_history: [...((game.move_history ?? []) as unknown[]), historyEntry],
    updated_at: new Date().toISOString(),
  };

  if (gameOver) {
    updateData.status = "finished";
    updateData.winner = findWinner({ ...game, computer_players: updatedCp });
  }

  const { error } = await supabase
    .from("games")
    .update(updateData)
    .eq("id", auth.gameId);
  if (error) return jsonError("Failed to update game", 500);

  return jsonOk({
    success: true,
    words: result.words.map((w) => ({ word: w.word, score: w.score })),
    total_score: result.totalScore,
    new_rack: newRack.map((t: Tile) => ({
      letter: t.letter,
      value: t.value,
      isBlank: t.isBlank,
      id: t.id,
    })),
    game_over: gameOver,
    message: gameOver
      ? "Move played. Game over!"
      : `Played ${result.words.map((w) => w.word).join(", ")} for ${result.totalScore} points.`,
  });
}

function findWinner(game: Record<string, unknown>): string {
  const humanPlayers = ((game.game_players ?? []) as { player_id: string; score: number }[]);
  const cpPlayers = ((game.computer_players ?? []) as ApiPlayer[]);
  const all = [
    ...humanPlayers.map((p) => ({ id: p.player_id, score: p.score })),
    ...cpPlayers.map((p) => ({ id: p.id, score: p.score })),
  ];
  all.sort((a, b) => b.score - a.score);
  return all[0]?.id ?? "";
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ─── LIST GAMES ──────────────────────────────────────────────────────────────
async function handleListGames(req: Request): Promise<Response> {
  const auth = await authenticateUser(req);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();

  // Fetch active and waiting games that have computer_players
  const { data: games, error } = await supabase
    .from("games")
    .select("id, status, current_turn, created_at, updated_at, computer_players, game_players(player_id, score, profiles(display_name))")
    .in("status", ["active", "waiting"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return jsonError("Failed to fetch games", 500);

  // Filter to games where this user has an API player slot
  const myGames = (games ?? []).filter((game) => {
    const cpPlayers = (game.computer_players ?? []) as (ApiPlayer & { owner_id?: string })[];
    return cpPlayers.some((p) => p.id.startsWith("api-") && p.owner_id === auth.userId);
  });

  const result = myGames.map((game) => {
    const cpPlayers = (game.computer_players ?? []) as (ApiPlayer & { owner_id?: string })[];
    const myPlayer = cpPlayers.find((p) => p.id.startsWith("api-") && p.owner_id === auth.userId)!;
    const isMyTurn = game.current_turn === myPlayer.id;

    // Build player list
    const humanPlayers = (game.game_players ?? []).map((p: { player_id: string; score: number; profiles: { display_name: string } }) => ({
      name: p.profiles.display_name,
      score: p.score,
      type: "human",
    }));
    const aiPlayers = cpPlayers.map((p) => ({
      name: p.name,
      score: p.score,
      type: p.id.startsWith("computer-") ? "computer" : "api",
    }));

    return {
      game_id: game.id,
      status: game.status,
      is_your_turn: isMyTurn,
      your_player_name: myPlayer.name,
      your_score: myPlayer.score,
      players: [...humanPlayers, ...aiPlayers],
      updated_at: game.updated_at,
    };
  });

  return jsonOk({ games: result });
}

// ─── VALIDATE MOVE (dry-run, no commit) ──────────────────────────────────────

async function handleValidateMove(req: Request): Promise<Response> {
  const body = await req.json();
  const { tiles, game_id } = body as {
    tiles?: { row: number; col: number; letter: string; is_blank?: boolean }[];
    game_id?: string;
  };

  const auth = await authenticateApiKey(req, game_id);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  if (!tiles || tiles.length === 0) {
    return jsonError("Must specify tiles to validate", 400);
  }

  const supabase = getServiceClient();
  const { data: game, error: gErr } = await supabase
    .from("games")
    .select("*")
    .eq("id", auth.gameId)
    .single();

  if (gErr || !game) return jsonError("Game not found", 404);

  const cpPlayers = (game.computer_players ?? []) as ApiPlayer[];
  const myPlayer = cpPlayers.find((p: ApiPlayer) => p.id === auth.playerId);
  if (!myPlayer) return jsonError("Player not found in game", 404);

  const boardState = game.board as BoardCell[][];

  // Normalize tiles — accept both cell notation ("H8") and row/col format
  let normalizedTiles: { row: number; col: number; letter: string; is_blank: boolean }[];
  try {
    normalizedTiles = tiles.map(normalizeTile);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  // Map submitted tiles to rack tiles (same as play)
  const placedTiles: { row: number; col: number; tile: Tile }[] = [];
  const usedRackTileIds = new Set<string>();

  for (const t of normalizedTiles) {
    let rackTile: Tile | undefined;
    if (t.is_blank) {
      rackTile = myPlayer.rack.find(
        (rt: Tile) => rt.isBlank && !usedRackTileIds.has(rt.id)
      );
      if (!rackTile) return jsonError("No blank tile in rack", 400);
      rackTile = { ...rackTile, letter: t.letter, value: 0 };
    } else {
      rackTile = myPlayer.rack.find(
        (rt: Tile) =>
          rt.letter === t.letter &&
          !rt.isBlank &&
          !usedRackTileIds.has(rt.id)
      );
      if (!rackTile) return jsonError(`Letter '${t.letter}' not in your rack`, 400);
    }
    usedRackTileIds.add(rackTile.id);
    placedTiles.push({ row: t.row, col: t.col, tile: rackTile });
  }

  const isFirstMove = !boardState.some((row: BoardCell[]) =>
    row.some((cell: BoardCell) => cell.tile !== null)
  );

  const result = scoreMove(boardState, placedTiles, isFirstMove);
  if (!result.valid) {
    return jsonOk({ valid: false, error: result.error, words: [] });
  }

  // Check each word against dictionary
  const trie = await getTrie();
  const wordResults = result.words.map((w) => ({
    word: w.word,
    score: w.score,
    valid: isWord(trie, w.word.toUpperCase()),
  }));

  const allValid = wordResults.every((w) => w.valid);
  const invalidWords = wordResults.filter((w) => !w.valid).map((w) => w.word);

  return jsonOk({
    valid: allValid,
    words: wordResults,
    total_score: allValid ? result.totalScore : 0,
    invalid_words: invalidWords,
    error: allValid ? null : `Invalid word(s): ${invalidWords.join(", ")}`,
  });
}

// ─── FIND WORDS (A&J move generation exposed to LLM) ─────────────────────────
async function handleFindWords(req: Request): Promise<Response> {
  const body = await req.json();
  const { game_id, sort_by, filter, limit: maxResults } = body as {
    game_id?: string;
    sort_by?: "score" | "length" | "tiles_used";
    filter?: {
      contains_letter?: string;
      min_length?: number;
      max_length?: number;
      uses_blank?: boolean;
      min_score?: number;
      touches_cell?: string; // e.g. "H8"
    };
    limit?: number;
  };

  const auth = await authenticateApiKey(req, game_id);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();
  const { data: game, error: gErr } = await supabase
    .from("games")
    .select("*")
    .eq("id", auth.gameId)
    .single();

  if (gErr || !game) return jsonError("Game not found", 404);
  if (!game.word_finder_enabled) {
    return jsonError("Word finder is not enabled for this game. The game creator can enable it in game settings.", 403);
  }

  const cpPlayers = (game.computer_players ?? []) as ApiPlayer[];
  const myPlayer = cpPlayers.find((p: ApiPlayer) => p.id === auth.playerId);
  if (!myPlayer) return jsonError("Player not found in game", 404);

  const boardState = game.board as BoardCell[][];
  const trie = await getTrie();

  const allMoves = generateAllMoves(boardState, myPlayer.rack, trie);

  // Apply filters
  let filtered = allMoves;
  if (filter) {
    if (filter.contains_letter) {
      const letter = filter.contains_letter.toUpperCase();
      filtered = filtered.filter((m: GeneratedMove) =>
        m.tiles.some(t => t.tile.letter === letter)
      );
    }
    if (filter.min_length) {
      const minLen = filter.min_length;
      filtered = filtered.filter((m: GeneratedMove) => {
        const mainWord = m.words[0]?.word ?? "";
        return mainWord.length >= minLen;
      });
    }
    if (filter.max_length) {
      const maxLen = filter.max_length;
      filtered = filtered.filter((m: GeneratedMove) => {
        const mainWord = m.words[0]?.word ?? "";
        return mainWord.length <= maxLen;
      });
    }
    if (filter.uses_blank === true) {
      filtered = filtered.filter((m: GeneratedMove) =>
        m.tiles.some(t => t.tile.isBlank)
      );
    }
    if (filter.uses_blank === false) {
      filtered = filtered.filter((m: GeneratedMove) =>
        !m.tiles.some(t => t.tile.isBlank)
      );
    }
    if (filter.min_score) {
      const minScore = filter.min_score;
      filtered = filtered.filter((m: GeneratedMove) => m.totalScore >= minScore);
    }
    if (filter.touches_cell) {
      const cellMatch = filter.touches_cell.toUpperCase().match(/^([A-O])(\d{1,2})$/);
      if (cellMatch) {
        const tCol = cellMatch[1].charCodeAt(0) - 65;
        const tRow = parseInt(cellMatch[2]) - 1;
        filtered = filtered.filter((m: GeneratedMove) =>
          m.tiles.some(t => t.row === tRow && t.col === tCol)
        );
      }
    }
  }

  // Sort
  const sortKey = sort_by || "score";
  if (sortKey === "score") {
    filtered.sort((a: GeneratedMove, b: GeneratedMove) => b.totalScore - a.totalScore);
  } else if (sortKey === "length") {
    filtered.sort((a: GeneratedMove, b: GeneratedMove) => {
      const aLen = a.words[0]?.word.length ?? 0;
      const bLen = b.words[0]?.word.length ?? 0;
      return bLen - aLen || b.totalScore - a.totalScore;
    });
  } else if (sortKey === "tiles_used") {
    filtered.sort((a: GeneratedMove, b: GeneratedMove) =>
      b.tiles.length - a.tiles.length || b.totalScore - a.totalScore
    );
  }

  // Limit results
  const cap = Math.min(maxResults || 10, 50);
  const results = filtered.slice(0, cap);

  // Format for response
  const cellNotation = (row: number, col: number) =>
    `${String.fromCharCode(65 + col)}${row + 1}`;

  const formatted = results.map((m: GeneratedMove) => ({
    tiles: m.tiles.map(t => ({
      cell: cellNotation(t.row, t.col),
      letter: t.tile.letter,
      value: t.tile.value,
      is_blank: t.tile.isBlank,
    })),
    words: m.words.map(w => ({ word: w.word, score: w.score })),
    total_score: m.totalScore,
    tiles_used: m.tiles.length,
    is_bingo: m.tiles.length === 7,
    rack_leave: myPlayer.rack
      .filter((rt: Tile) => !m.tiles.some(mt => mt.tile.id === rt.id))
      .map((rt: Tile) => rt.letter)
      .join(""),
  }));

  return jsonOk({
    total_moves_found: allMoves.length,
    filtered_count: filtered.length,
    showing: formatted.length,
    sort_by: sortKey,
    moves: formatted,
  });
}

// ─── PREVIEW MOVE (LLM → human) ──────────────────────────────────────────────
async function handlePreviewMove(req: Request): Promise<Response> {
  const body = await req.json();
  const { game_id, tiles } = body as {
    game_id?: string;
    tiles?: RawTile[];
  };

  const auth = await authenticateApiKey(req, game_id);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();

  if (!tiles || tiles.length === 0) {
    // Clear preview
    await supabase.from("games").update({ previewed_move: null }).eq("id", auth.gameId);
    return jsonOk({ success: true, message: "Preview cleared" });
  }

  // Normalize tiles
  let normalizedTiles: { row: number; col: number; letter: string; is_blank: boolean }[];
  try {
    normalizedTiles = tiles.map(normalizeTile);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  const cellNotation = (row: number, col: number) =>
    `${String.fromCharCode(65 + col)}${row + 1}`;

  const preview = {
    player_id: auth.playerId,
    player_name: auth.playerName,
    tiles: normalizedTiles.map(t => ({
      cell: cellNotation(t.row, t.col),
      row: t.row,
      col: t.col,
      letter: t.letter,
      is_blank: t.is_blank,
    })),
    timestamp: new Date().toISOString(),
  };

  await supabase.from("games").update({ previewed_move: preview }).eq("id", auth.gameId);
  return jsonOk({ success: true, message: "Preview set", preview });
}

// ─── SUGGEST MOVE (human → LLM, via Supabase auth) ───────────────────────────
async function handleSuggestMove(req: Request): Promise<Response> {
  // This endpoint uses the user's Supabase auth token, not the API key
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Missing auth header", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return jsonError("Unauthorized", 401);

  const body = await req.json();
  const { game_id, tiles } = body as {
    game_id: string;
    tiles?: { cell: string; letter: string; is_blank?: boolean }[];
  };

  if (!game_id) return jsonError("Missing game_id", 400);

  const serviceClient = getServiceClient();

  if (!tiles || tiles.length === 0) {
    // Clear suggestion
    await serviceClient.from("games").update({ suggested_move: null }).eq("id", game_id);
    return jsonOk({ success: true, message: "Suggestion cleared" });
  }

  // Normalize tiles
  let normalizedTiles: { row: number; col: number; letter: string; is_blank: boolean }[];
  try {
    normalizedTiles = tiles.map(t => normalizeTile({ cell: t.cell, letter: t.letter, is_blank: t.is_blank }));
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  const cellNotation = (row: number, col: number) =>
    `${String.fromCharCode(65 + col)}${row + 1}`;

  const suggestion = {
    user_id: user.id,
    tiles: normalizedTiles.map(t => ({
      cell: cellNotation(t.row, t.col),
      row: t.row,
      col: t.col,
      letter: t.letter,
      is_blank: t.is_blank,
    })),
    timestamp: new Date().toISOString(),
  };

  await serviceClient.from("games").update({ suggested_move: suggestion }).eq("id", game_id);
  return jsonOk({ success: true, message: "Suggestion saved", suggestion });
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/game-api\/?/, "");

  try {
    if (req.method === "GET" && path === "games") {
      return await handleListGames(req);
    }

    if (req.method === "GET" && (path === "" || path === "state")) {
      return await handleGetGame(req);
    }

    if (req.method === "POST" && path === "move") {
      return await handlePlayMove(req);
    }

    if (req.method === "POST" && path === "validate") {
      return await handleValidateMove(req);
    }

    if (req.method === "POST" && path === "find-words") {
      return await handleFindWords(req);
    }

    if (req.method === "POST" && path === "preview") {
      return await handlePreviewMove(req);
    }

    if (req.method === "POST" && path === "suggest") {
      return await handleSuggestMove(req);
    }

    return jsonError(`Unknown endpoint: ${path}`, 404);
  } catch (err) {
    console.error("game-api error:", err);
    return jsonError("Internal server error", 500);
  }
});
