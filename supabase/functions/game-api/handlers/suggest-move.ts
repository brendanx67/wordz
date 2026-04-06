import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  cellNotation,
  getServiceClient,
  jsonError,
  jsonOk,
  normalizeTile,
} from "../api-helpers.ts";

export async function handleSuggestMove(req: Request): Promise<Response> {
  // Uses the user's Supabase auth token, not the API key
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
    await serviceClient.from("games").update({ suggested_move: null }).eq("id", game_id);
    return jsonOk({ success: true, message: "Suggestion cleared" });
  }

  let normalizedTiles: { row: number; col: number; letter: string; is_blank: boolean }[];
  try {
    normalizedTiles = tiles.map(t => normalizeTile({ cell: t.cell, letter: t.letter, is_blank: t.is_blank }));
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

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
