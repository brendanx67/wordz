import { cors, jsonError } from "./api-helpers.ts";
import { handleGetGame } from "./handlers/get-game.ts";
import { handlePlayMove } from "./handlers/play-move.ts";
import { handleListGames } from "./handlers/list-games.ts";
import { handleValidateMove } from "./handlers/validate-move.ts";
import { handleFindWords } from "./handlers/find-words.ts";
import { handleFindWordsAtMove } from "./handlers/find-words-at-move.ts";
import { handlePreviewMove } from "./handlers/preview-move.ts";
import { handleSuggestMove } from "./handlers/suggest-move.ts";
import { handleAnalyzeBoard } from "./handlers/analyze-board.ts";
import {
  handleGetAnalysisBoard,
  handleSaveAnalysisBoard,
} from "./handlers/analysis-board-store.ts";
import { handleDeleteAccount } from "./handlers/delete-account.ts";
import {
  handleListChannels,
  handleReadMessages,
  handlePostMessage,
  handleMarkRead,
  handleStartDirectMessage,
} from "./handlers/chat.ts";

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
    if (req.method === "POST" && path === "find-words-at-move") return await handleFindWordsAtMove(req);
    if (req.method === "POST" && path === "preview") return await handlePreviewMove(req);
    if (req.method === "POST" && path === "suggest") return await handleSuggestMove(req);
    if (req.method === "POST" && path === "analyze") return await handleAnalyzeBoard(req);

    // Analysis board persistence (issue #13)
    if (req.method === "GET" && path === "analysis-board") return await handleGetAnalysisBoard(req);
    if (req.method === "PUT" && path === "analysis-board") return await handleSaveAnalysisBoard(req);

    // Account management (issue #19)
    if (req.method === "POST" && path === "delete-account") return await handleDeleteAccount(req);

    // Chat endpoints (issue #6)
    if (req.method === "GET" && path === "chat/channels") {
      return await handleListChannels(req);
    }
    if (req.method === "GET" && /^chat\/channels\/[^/]+\/messages$/.test(path)) {
      return await handleReadMessages(req);
    }
    if (req.method === "POST" && /^chat\/channels\/[^/]+\/messages$/.test(path)) {
      return await handlePostMessage(req);
    }
    if (req.method === "POST" && /^chat\/channels\/[^/]+\/read$/.test(path)) {
      return await handleMarkRead(req);
    }
    if (req.method === "POST" && path === "chat/dm") {
      return await handleStartDirectMessage(req);
    }

    return jsonError(`Unknown endpoint: ${path}`, 404);
  } catch (err) {
    console.error("game-api error:", err);
    return jsonError("Internal server error", 500);
  }
});
