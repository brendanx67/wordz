import {
  authenticateUser,
  getServiceClient,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

// Persisted analysis board — one per user.
// GET  /analysis-board  → load the user's saved board
// PUT  /analysis-board  → save/replace the user's board
//
// Auth: JWT (web UI) or API key (MCP).

interface SavedTile {
  row: number;
  col: number;
  letter: string;
  is_blank: boolean;
}

async function resolveUserId(req: Request): Promise<string | null> {
  // API key path
  const apiAuth = await authenticateUser(req);
  if (apiAuth) return apiAuth.userId;

  // JWT path
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }

  return null;
}

export async function handleGetAnalysisBoard(
  req: Request
): Promise<Response> {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError("Not authenticated", 401);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("analysis_boards")
    .select("board, rack, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);

  if (!data) {
    return jsonOk({ board: [], rack: "", updated_at: null });
  }

  return jsonOk(data);
}

export async function handleSaveAnalysisBoard(
  req: Request
): Promise<Response> {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError("Not authenticated", 401);

  const body = await req.json();
  const { board, rack } = body as {
    board?: SavedTile[];
    rack?: string;
  };

  if (!board || !Array.isArray(board)) {
    return jsonError("board must be an array of tile placements", 400);
  }
  if (typeof rack !== "string") {
    return jsonError("rack must be a string of letters", 400);
  }

  // Validate tile placements
  for (const t of board) {
    if (
      typeof t.row !== "number" ||
      typeof t.col !== "number" ||
      t.row < 0 || t.row > 14 ||
      t.col < 0 || t.col > 14 ||
      typeof t.letter !== "string" ||
      t.letter.length !== 1
    ) {
      return jsonError(
        `Invalid tile: row=${t.row} col=${t.col} letter=${t.letter}`,
        400
      );
    }
  }

  const supabase = getServiceClient();
  const { error } = await supabase.from("analysis_boards").upsert(
    {
      user_id: userId,
      board: board as unknown as Record<string, unknown>,
      rack,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return jsonError(error.message, 500);

  return jsonOk({ ok: true, tiles_on_board: board.length, rack_letters: rack.length });
}
