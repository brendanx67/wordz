import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildContextBriefing } from "../context-briefing.js";

export function registerGameContextTool(server: McpServer) {
  server.tool(
    "game_context",
    "CALL THIS FIRST. Get strategic context and briefing for playing Wordz. Use level 'master' for tournament-level expert strategy, 'club' for intermediate strategic guidance, or 'social' for a casual fun game. Default is 'master'.",
    {
      level: z
        .enum(["master", "club", "social"])
        .optional()
        .default("master")
        .describe("Strategy level: 'master' (tournament expert), 'club' (intermediate), or 'social' (casual fun)"),
    },
    async ({ level }) => {
      const text = buildContextBriefing(level);
      return { content: [{ type: "text", text }] };
    }
  );
}
