import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import type { GeneratedMove } from "../_shared/moveGenerator.ts";
import { generateAllMoves } from "../_shared/moveGenerator.ts";
import type { ApiPlayer } from "../api-helpers.ts";
import {
  authenticateApiKey,
  cellNotation,
  getServiceClient,
  getTrie,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

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
