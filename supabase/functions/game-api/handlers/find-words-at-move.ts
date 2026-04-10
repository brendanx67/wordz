import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import { BOARD_SIZE, getBonusType } from "../_shared/gameConstants.ts";
import type { GeneratedMove } from "../_shared/moveGenerator.ts";
import { generateAllMoves } from "../_shared/moveGenerator.ts";
import {
  authenticateUser,
  formatMoveResult,
  formatTiles,
  getServiceClient,
  getTrie,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

// #11 review-mode instructional panel: reconstruct the board and rack
// at a historical move index, run the move generator, and return all
// legal plays alongside the move that was actually played. Always
// available for finished games — no find_words_enabled gate.

interface HistoryEntry {
  player_id: string;
  player_name: string;
  type: "play" | "pass" | "exchange";
  tiles?: { row: number; col: number; tile: Tile }[];
  words?: { word: string; score: number }[];
  score?: number;
  rack_before?: Tile[];
  rack_snapshot?: { letter: string; value: number; isBlank: boolean }[];
  board_snapshot: BoardCell[][];
}

function emptyBoard(): BoardCell[][] {
  const board: BoardCell[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: BoardCell[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push({ tile: null, bonus: getBonusType(r, c), isNew: false });
    }
    board.push(row);
  }
  return board;
}

// Synthesize tile IDs for racks from older history entries that only
// have rack_snapshot (no id field). The move generator uses IDs solely
// for within-run deduplication, so synthetic values are safe.
function rackFromSnapshot(
  snapshot: { letter: string; value: number; isBlank: boolean }[],
): Tile[] {
  return snapshot.map((t, i) => ({
    letter: t.letter,
    value: t.value,
    isBlank: t.isBlank,
    id: `hist-${i}`,
  }));
}

// Authenticate via JWT (browser) or API key. Any logged-in user may
// review finished games — no per-seat gate.
async function authenticate(
  req: Request,
): Promise<boolean> {
  // Try JWT first (browser client)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return true;
  }
  // Fall back to API key (MCP/CLI client)
  const apiAuth = await authenticateUser(req);
  if (apiAuth) return true;
  return false;
}

export async function handleFindWordsAtMove(
  req: Request,
): Promise<Response> {
  const authed = await authenticate(req);
  if (!authed) return jsonError("Not authenticated", 401);

  const body = await req.json();
  const { game_id, move_index } = body as {
    game_id?: string;
    move_index?: number;
  };

  if (!game_id) return jsonError("game_id required", 400);
  if (move_index === undefined || move_index < 0)
    return jsonError("move_index required (>= 0)", 400);

  const supabase = getServiceClient();
  const { data: game, error: gErr } = await supabase
    .from("games")
    .select("status, move_history")
    .eq("id", game_id)
    .single();

  if (gErr || !game) return jsonError("Game not found", 404);
  if (game.status !== "finished")
    return jsonError("Game must be finished to review moves", 400);

  const history = (game.move_history ?? []) as HistoryEntry[];
  if (move_index >= history.length)
    return jsonError(
      `move_index ${move_index} out of range (0..${history.length - 1})`,
      400,
    );

  const entry = history[move_index];

  // Board state BEFORE this move = previous move's board_snapshot,
  // or an empty board for the first move.
  const boardBefore: BoardCell[][] =
    move_index > 0 ? history[move_index - 1].board_snapshot : emptyBoard();

  // Rack BEFORE this move. Prefer rack_before (full tiles with IDs),
  // fall back to rack_snapshot (no IDs — synthesize them).
  let rack: Tile[] | null = null;
  if (entry.rack_before?.length) {
    rack = entry.rack_before;
  } else if (entry.rack_snapshot?.length) {
    rack = rackFromSnapshot(entry.rack_snapshot);
  }

  if (!rack || rack.length === 0) {
    return jsonOk({
      move_index,
      player_name: entry.player_name,
      move_type: entry.type,
      played: entry.type === "play"
        ? {
            words: entry.words,
            total_score: entry.score,
            tiles: formatTiles(entry.tiles ?? []),
          }
        : null,
      alternatives: [],
      rack_available: false,
    });
  }

  const trie = await getTrie();
  const allMoves = generateAllMoves(boardBefore, rack, trie);
  allMoves.sort(
    (a: GeneratedMove, b: GeneratedMove) => b.totalScore - a.totalScore,
  );

  const cap = Math.min(allMoves.length, 50);
  const formatted = allMoves.slice(0, cap).map((m: GeneratedMove) =>
    formatMoveResult(m)
  );

  // Build the actually-played move info (null for pass/exchange).
  const played =
    entry.type === "play"
      ? {
          words: entry.words,
          total_score: entry.score,
          tiles: formatTiles(entry.tiles ?? []),
        }
      : null;

  return jsonOk({
    move_index,
    player_name: entry.player_name,
    move_type: entry.type,
    played,
    total_alternatives: allMoves.length,
    showing: formatted.length,
    alternatives: formatted,
    rack_available: true,
  });
}
