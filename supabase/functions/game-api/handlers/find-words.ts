import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import type { GeneratedMove } from "../_shared/moveGenerator.ts";
import { generateAllMoves } from "../_shared/moveGenerator.ts";
import type { ApiPlayer } from "../api-helpers.ts";
import {
  authenticateApiKey,
  formatMoveResult,
  getServiceClient,
  getTrie,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

// #10 instructional mode: human players call find-words from the React app
// using their Supabase session JWT. We resolve their game_players row, check
// the per-seat find_words_enabled flag from #9, and run the same engine that
// already serves API/LLM callers. Two completely independent auth paths
// converge on a single (rack, board, find_words_enabled) shape.
async function authenticateHumanFromJwt(
  req: Request,
  gameId: string,
): Promise<{ rack: Tile[]; findWordsEnabled: boolean } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const supabase = getServiceClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) return null;

  const { data: gp, error: gpErr } = await supabase
    .from("game_players")
    .select("rack, find_words_enabled")
    .eq("game_id", gameId)
    .eq("player_id", userData.user.id)
    .maybeSingle();

  if (gpErr || !gp) return null;
  return {
    rack: (gp.rack ?? []) as Tile[],
    findWordsEnabled: !!gp.find_words_enabled,
  };
}

export async function handleFindWords(req: Request): Promise<Response> {
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
      touches_cell?: string;
    };
    limit?: number;
  };

  // Dispatch on credential type. API key callers (LLMs/MCP) keep the existing
  // computer_players-based auth from #9. Bearer tokens (the React UI) drop into
  // the new game_players path below. We deliberately do not fall back from one
  // to the other — a JWT request with the wrong game id should fail explicitly,
  // not get retried as an api-key request. Both paths converge on a single
  // (rack, board) shape which the move generator runs against.
  let myRack: Tile[];
  let boardState: BoardCell[][];

  const supabase = getServiceClient();

  if (req.headers.get("x-api-key")) {
    const auth = await authenticateApiKey(req, game_id);
    if (!auth) return jsonError("Invalid or missing API key", 401);

    const { data: game, error: gErr } = await supabase
      .from("games")
      .select("computer_players, board")
      .eq("id", auth.gameId)
      .single();
    if (gErr || !game) return jsonError("Game not found", 404);

    const cpPlayers = (game.computer_players ?? []) as (ApiPlayer & {
      find_words_enabled?: boolean;
    })[];
    const myPlayer = cpPlayers.find((p) => p.id === auth.playerId);
    if (!myPlayer) return jsonError("Player not found in game", 404);
    if (!myPlayer.find_words_enabled) {
      return jsonError(
        "Word finder is not enabled for this seat. The game creator can enable it when configuring this player.",
        403,
      );
    }

    myRack = myPlayer.rack;
    boardState = game.board as BoardCell[][];
  } else {
    if (!game_id) return jsonError("game_id required", 400);
    const human = await authenticateHumanFromJwt(req, game_id);
    if (!human) return jsonError("Not authorized for this game", 401);
    if (!human.findWordsEnabled) {
      return jsonError(
        "Instructional mode is not enabled for this seat.",
        403,
      );
    }

    const { data: game, error: gErr } = await supabase
      .from("games")
      .select("board")
      .eq("id", game_id)
      .single();
    if (gErr || !game) return jsonError("Game not found", 404);

    myRack = human.rack;
    boardState = game.board as BoardCell[][];
  }

  const myRackForLeave = myRack;
  const trie = await getTrie();

  const allMoves = generateAllMoves(boardState, myRack, trie);

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

  const cap = Math.min(maxResults || 10, 50);
  const results = filtered.slice(0, cap);

  const formatted = results.map((m: GeneratedMove) =>
    formatMoveResult(m, myRackForLeave)
  );

  return jsonOk({
    total_moves_found: allMoves.length,
    filtered_count: filtered.length,
    showing: formatted.length,
    sort_by: sortKey,
    moves: formatted,
  });
}
