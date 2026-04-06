#!/usr/bin/env npx tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import "./api-client.js"; // side-effect: loads credentials or exits

import { registerGameContextTool } from "./tools/game-context.js";
import { registerListGamesTool } from "./tools/list-games.js";
import { registerGetGameStateTool } from "./tools/get-game-state.js";
import { registerValidateMoveTool } from "./tools/validate-move.js";
import { registerPlayWordTool } from "./tools/play-word.js";
import { registerPassTurnTool } from "./tools/pass-turn.js";
import { registerExchangeTilesTool } from "./tools/exchange-tiles.js";
import { registerWaitForTurnTool } from "./tools/wait-for-turn.js";
import { registerFindWordsTool } from "./tools/find-words.js";
import { registerPreviewMoveTool } from "./tools/preview-move.js";
import { registerValidateSuggestionTool } from "./tools/validate-suggestion.js";
import { registerPlaySuggestionTool } from "./tools/play-suggestion.js";

const server = new McpServer({
  name: "wordz",
  version: "1.0.0",
});

registerGameContextTool(server);
registerListGamesTool(server);
registerGetGameStateTool(server);
registerValidateMoveTool(server);
registerPlayWordTool(server);
registerPassTurnTool(server);
registerExchangeTilesTool(server);
registerWaitForTurnTool(server);
registerFindWordsTool(server);
registerPreviewMoveTool(server);
registerValidateSuggestionTool(server);
registerPlaySuggestionTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
