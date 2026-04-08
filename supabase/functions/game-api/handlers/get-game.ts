import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import { BOARD_SIZE } from "../_shared/gameConstants.ts";
import type { ApiPlayer } from "../api-helpers.ts";
import {
  authenticateApiKey,
  getServiceClient,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

export async function handleGetGame(req: Request): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();
  const { data: game, error } = await supabase
    .from("games")
    .select("id, status, board, current_turn, turn_order, turn_index, tile_bag, consecutive_passes, winner, computer_players, move_history, suggested_move, word_finder_enabled, game_players(player_id, score, profiles(display_name))")
    .eq("id", auth.gameId)
    .single();

  if (error || !game) return jsonError("Game not found", 404);

  const allPlayers = (game.computer_players ?? []) as ApiPlayer[];
  const myPlayer = allPlayers.find((p: ApiPlayer) => p.id === auth.playerId);

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

  const humanPlayers = (game.game_players ?? []).map((p: { player_id: string; score: number; profiles: { display_name: string } }) => ({
    id: p.player_id,
    user_id: p.player_id,
    name: p.profiles.display_name,
    score: p.score,
    type: "human" as const,
    description: "Human player",
  }));

  const aiPlayers = allPlayers.map((p: ApiPlayer & { difficulty?: string; strategyLevel?: string; owner_id?: string }) => {
    const isComputer = p.id.startsWith("computer-");
    const isApi = p.id.startsWith("api-");
    return {
      id: p.id,
      // For API players, expose the owning human's user_id so callers can DM
      // them via start_direct_message. Built-in computer players don't have
      // an owner.
      ...(isApi && p.owner_id ? { user_id: p.owner_id } : {}),
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
