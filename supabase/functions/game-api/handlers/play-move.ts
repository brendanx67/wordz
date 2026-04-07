import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import { getBonusType } from "../_shared/gameConstants.ts";
import { isWord } from "../_shared/trie.ts";
import type { ApiPlayer } from "../api-helpers.ts";
import {
  authenticateApiKey,
  findWinner,
  getServiceClient,
  getTrie,
  jsonError,
  jsonOk,
  normalizeTile,
} from "../api-helpers.ts";
import { scoreMove } from "../scoring.ts";

export async function handlePlayMove(req: Request): Promise<Response> {
  const body = await req.json();
  const { action, tiles, tile_ids, game_id } = body as {
    action: "play" | "pass" | "exchange";
    tiles?: { row: number; col: number; letter: string; is_blank?: boolean }[];
    tile_ids?: string[];
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

    if (newPasses >= turnOrder.length * 2) {
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

  let normalizedTiles: { row: number; col: number; letter: string; is_blank: boolean }[];
  try {
    normalizedTiles = tiles.map(normalizeTile);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

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

  const isFirstMove = !boardState.some((row: BoardCell[]) =>
    row.some((cell: BoardCell) => cell.tile !== null)
  );

  const result = scoreMove(boardState, placedTiles, isFirstMove);
  if (!result.valid) {
    return jsonError(result.error || "Invalid move", 400);
  }

  const trie = await getTrie();
  for (const w of result.words) {
    if (!isWord(trie, w.word.toUpperCase())) {
      return jsonError(`'${w.word}' is not a valid word`, 400);
    }
  }

  const newBoard = boardState.map((row: BoardCell[]) => row.map((cell: BoardCell) => ({ ...cell })));
  for (const pt of placedTiles) {
    newBoard[pt.row][pt.col] = {
      tile: pt.tile,
      bonus: getBonusType(pt.row, pt.col),
      isNew: false,
    };
  }

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

  const gameOver = newRack.length === 0 && remaining.length === 0;

  // End-game scoring: if this player emptied their rack, sum all other players'
  // remaining rack values, deduct from each of them, add total to this player.
  let finalCp = updatedCp;
  let finalScoreForMe = newScore;
  if (gameOver) {
    let bonusFromOthers = 0;

    // Deduct from each other computer/API player's rack
    finalCp = updatedCp.map((p: ApiPlayer) => {
      if (p.id === auth.playerId) return p;
      const rack = (p.rack ?? []) as Tile[];
      const rackValue = rack.reduce((sum, t) => sum + (t.value ?? 0), 0);
      bonusFromOthers += rackValue;
      return { ...p, score: Math.max(0, p.score - rackValue) };
    });

    // Deduct from each human player's rack (fetch their racks first)
    const { data: humans } = await supabase
      .from("game_players")
      .select("player_id, score, rack")
      .eq("game_id", auth.gameId);
    for (const hp of (humans ?? []) as { player_id: string; score: number; rack: Tile[] }[]) {
      const rack = (hp.rack ?? []) as Tile[];
      const rackValue = rack.reduce((sum, t) => sum + (t.value ?? 0), 0);
      bonusFromOthers += rackValue;
      await supabase
        .from("game_players")
        .update({ score: Math.max(0, hp.score - rackValue) })
        .eq("game_id", auth.gameId)
        .eq("player_id", hp.player_id);
    }

    finalScoreForMe = newScore + bonusFromOthers;
    finalCp = finalCp.map((p: ApiPlayer) =>
      p.id === auth.playerId ? { ...p, score: finalScoreForMe } : p
    );
  }

  const updateData: Record<string, unknown> = {
    board: newBoard,
    tile_bag: remaining,
    computer_players: finalCp,
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
    // Re-fetch humans for findWinner (their scores were just updated above)
    const { data: humansAfter } = await supabase
      .from("game_players")
      .select("player_id, score")
      .eq("game_id", auth.gameId);
    updateData.winner = findWinner({
      ...game,
      game_players: humansAfter ?? [],
      computer_players: finalCp,
    });
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
