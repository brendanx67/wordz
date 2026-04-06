import { cors, jsonError } from "./api-helpers.ts";
import { handleGetGame } from "./handlers/get-game.ts";
import { handlePlayMove } from "./handlers/play-move.ts";
import { handleListGames } from "./handlers/list-games.ts";
import { handleValidateMove } from "./handlers/validate-move.ts";
import { handleFindWords } from "./handlers/find-words.ts";
import { handlePreviewMove } from "./handlers/preview-move.ts";
import { handleSuggestMove } from "./handlers/suggest-move.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/game-api\/?/, "");

  try {
    if (req.method === "GET" && path === "games") return await handleListGames(req);
    if (req.method === "GET" && (path === "" || path === "state")) return await handleGetGame(req);
    if (req.method === "POST" && path === "move") return await handlePlayMove(req);
    if (req.method === "POST" && path === "validate") return await handleValidateMove(req);
    if (req.method === "POST" && path === "find-words") return await handleFindWords(req);
    if (req.method === "POST" && path === "preview") return await handlePreviewMove(req);
    if (req.method === "POST" && path === "suggest") return await handleSuggestMove(req);
    return jsonError(`Unknown endpoint: ${path}`, 404);
  } catch (err) {
    console.error("game-api error:", err);
    return jsonError("Internal server error", 500);
  }
});
