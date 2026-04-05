import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const BOARD_SIZE = 15;
const RACK_SIZE = 7;

type BonusType = "TW" | "DW" | "TL" | "DL" | "CENTER" | null;

interface Tile {
  letter: string;
  value: number;
  isBlank: boolean;
  id: string;
}

interface BoardCell {
  tile: Tile | null;
  bonus: BonusType;
  isNew: boolean;
}

interface ApiPlayer {
  id: string;
  name: string;
  rack: Tile[];
  score: number;
}

// ─── BONUS MAP ────────────────────────────────────────────────────────────────
const TW_POS = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
const DW_POS = [
  [1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
  [1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],
];
const TL_POS = [
  [1,5],[1,9],[5,1],[5,5],[5,9],[5,13],
  [9,1],[9,5],[9,9],[9,13],[13,5],[13,9],
];
const DL_POS = [
  [0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],
  [6,2],[6,6],[6,8],[6,12],[7,3],[7,11],
  [8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],
  [12,6],[12,8],[14,3],[14,11],
];

const bonusMap = new Map<string, BonusType>();
TW_POS.forEach(([r, c]) => bonusMap.set(`${r},${c}`, "TW"));
DW_POS.forEach(([r, c]) => bonusMap.set(`${r},${c}`, "DW"));
TL_POS.forEach(([r, c]) => bonusMap.set(`${r},${c}`, "TL"));
DL_POS.forEach(([r, c]) => bonusMap.set(`${r},${c}`, "DL"));
bonusMap.set("7,7", "CENTER");

function getBonusType(row: number, col: number): BonusType {
  return bonusMap.get(`${row},${col}`) ?? null;
}

// ─── TRIE (for word validation) ───────────────────────────────────────────────
interface TrieNode {
  children: Map<string, TrieNode>;
  isTerminal: boolean;
}

function createTrieNode(): TrieNode {
  return { children: new Map(), isTerminal: false };
}

function insertWord(root: TrieNode, word: string): void {
  let node = root;
  for (const ch of word) {
    let child = node.children.get(ch);
    if (!child) {
      child = createTrieNode();
      node.children.set(ch, child);
    }
    node = child;
  }
  node.isTerminal = true;
}

function isWord(root: TrieNode, word: string): boolean {
  let node = root;
  for (const ch of word) {
    const child = node.children.get(ch);
    if (!child) return false;
    node = child;
  }
  return node.isTerminal;
}

let cachedTrie: TrieNode | null = null;
let wordListCache: string | null = null;

async function getTrie(): Promise<TrieNode> {
  if (cachedTrie) return cachedTrie;
  if (!wordListCache) {
    const res = await fetch(
      "https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt"
    );
    wordListCache = await res.text();
  }
  const root = createTrieNode();
  for (const line of wordListCache.split("\n")) {
    const trimmed = line.trim().toUpperCase();
    if (trimmed.length >= 2) insertWord(root, trimmed);
  }
  cachedTrie = root;
  return root;
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

// ─── AUTH HELPER ──────────────────────────────────────────────────────────────
async function authenticateApiKey(
  req: Request
): Promise<{ gameId: string; playerId: string; playerName: string } | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return null;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("game_id, player_id, player_name")
    .eq("api_key", apiKey)
    .single();

  if (error || !data) return null;
  return { gameId: data.game_id, playerId: data.player_id, playerName: data.player_name };
}

// ─── ROUTE HANDLERS ───────────────────────────────────────────────────────────

async function handleGetGame(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();
  const { data: game, error } = await supabase
    .from("games")
    .select("id, status, board, current_turn, turn_order, turn_index, tile_bag, consecutive_passes, winner, computer_players, move_history, game_players(player_id, score, profiles(display_name))")
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

  // Build scoreboard
  const humanPlayers = (game.game_players ?? []).map((p: { player_id: string; score: number; profiles: { display_name: string } }) => ({
    id: p.player_id,
    name: p.profiles.display_name,
    score: p.score,
  }));

  const aiPlayers = allPlayers.map((p: ApiPlayer) => ({
    id: p.id,
    name: p.name,
    score: p.score,
  }));

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
  });
}

async function handlePlayMove(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const body = await req.json();
  const { action, tiles, tile_ids } = body as {
    action: "play" | "pass" | "exchange";
    tiles?: { row: number; col: number; letter: string; is_blank?: boolean }[];
    tile_ids?: string[]; // for exchange
  };

  if (!action) return jsonError("Missing action field", 400);

  const supabase = getServiceClient();
  const { data: game, error: gErr } = await supabase
    .from("games")
    .select("*")
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

  // Map submitted tiles to actual rack tiles
  const placedTiles: { row: number; col: number; tile: Tile }[] = [];
  const usedRackTileIds = new Set<string>();

  for (const t of tiles) {
    let rackTile: Tile | undefined;
    if (t.is_blank) {
      rackTile = myPlayer.rack.find(
        (rt: Tile) => rt.isBlank && !usedRackTileIds.has(rt.id)
      );
      if (!rackTile) return jsonError(`No blank tile in rack`, 400);
      // Set the chosen letter on the blank
      rackTile = { ...rackTile, letter: t.letter.toUpperCase(), value: 0 };
    } else {
      rackTile = myPlayer.rack.find(
        (rt: Tile) =>
          rt.letter === t.letter.toUpperCase() &&
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

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/game-api\/?/, "");

  try {
    if (req.method === "GET" && (path === "" || path === "state")) {
      return await handleGetGame(req);
    }

    if (req.method === "POST" && path === "move") {
      return await handlePlayMove(req);
    }

    return jsonError(`Unknown endpoint: ${path}`, 404);
  } catch (err) {
    console.error("game-api error:", err);
    return jsonError("Internal server error", 500);
  }
});
