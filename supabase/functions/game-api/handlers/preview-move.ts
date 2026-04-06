import type { RawTile } from "../api-helpers.ts";
import {
  authenticateApiKey,
  cellNotation,
  getServiceClient,
  jsonError,
  jsonOk,
  normalizeTile,
} from "../api-helpers.ts";

export async function handlePreviewMove(req: Request): Promise<Response> {
  const body = await req.json();
  const { game_id, tiles } = body as {
    game_id?: string;
    tiles?: RawTile[];
  };

  const auth = await authenticateApiKey(req, game_id);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();

  if (!tiles || tiles.length === 0) {
    await supabase.from("games").update({ previewed_move: null }).eq("id", auth.gameId);
    return jsonOk({ success: true, message: "Preview cleared" });
  }

  let normalizedTiles: { row: number; col: number; letter: string; is_blank: boolean }[];
  try {
    normalizedTiles = tiles.map(normalizeTile);
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

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
