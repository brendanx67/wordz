import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import { isWord } from "../_shared/trie.ts";
import type { ApiPlayer } from "../api-helpers.ts";
import {
  authenticateApiKey,
  getServiceClient,
  getTrie,
  jsonError,
  jsonOk,
  normalizeTile,
} from "../api-helpers.ts";
import { scoreMove } from "../scoring.ts";

export async function handleValidateMove(req: Request): Promise<Response> {
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
