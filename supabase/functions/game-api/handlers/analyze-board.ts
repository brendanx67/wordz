import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import type { GeneratedMove } from "../_shared/moveGenerator.ts";
import { generateAllMoves } from "../_shared/moveGenerator.ts";
import {
  formatMoveResult,
  getServiceClient,
  getTrie,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

// Standalone board analysis endpoint for Analysis Mode (issue #13).
// Accepts a board state and rack directly — no game ID needed.
// Authenticated via Supabase session JWT (any logged-in user can use it).

export async function handleAnalyzeBoard(req: Request): Promise<Response> {
  // Authenticate
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Not authenticated", 401);
  }
  const token = authHeader.slice("Bearer ".length);
  const supabase = getServiceClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return jsonError("Not authenticated", 401);
  }

  const body = await req.json();
  const { board, rack, sort_by, limit: maxResults } = body as {
    board: BoardCell[][];
    rack: Tile[];
    sort_by?: "score" | "length" | "tiles_used";
    limit?: number;
  };

  if (!board || !rack) {
    return jsonError("board and rack are required", 400);
  }

  if (!Array.isArray(board) || board.length !== 15) {
    return jsonError("board must be a 15x15 grid", 400);
  }

  if (!Array.isArray(rack) || rack.length === 0 || rack.length > 7) {
    return jsonError("rack must have 1-7 tiles", 400);
  }

  const trie = await getTrie();
  const allMoves = generateAllMoves(board, rack, trie);

  const sortKey = sort_by || "score";
  const sorted = [...allMoves];
  if (sortKey === "score") {
    sorted.sort((a: GeneratedMove, b: GeneratedMove) => b.totalScore - a.totalScore);
  } else if (sortKey === "length") {
    sorted.sort((a: GeneratedMove, b: GeneratedMove) => {
      const aLen = a.words[0]?.word.length ?? 0;
      const bLen = b.words[0]?.word.length ?? 0;
      return bLen - aLen || b.totalScore - a.totalScore;
    });
  } else if (sortKey === "tiles_used") {
    sorted.sort((a: GeneratedMove, b: GeneratedMove) =>
      b.tiles.length - a.tiles.length || b.totalScore - a.totalScore
    );
  }

  const cap = Math.min(maxResults || 20, 50);
  const results = sorted.slice(0, cap);
  const formatted = results.map((m: GeneratedMove) => formatMoveResult(m, rack));

  return jsonOk({
    total_moves_found: allMoves.length,
    showing: formatted.length,
    sort_by: sortKey,
    moves: formatted,
  });
}
