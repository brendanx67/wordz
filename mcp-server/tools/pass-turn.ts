import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";

export function registerPassTurnTool(server: McpServer) {
  server.tool(
    "pass_turn",
    "Pass your turn without playing any tiles",
    {
      game_id: z.string().describe("Game ID (use list_games to find your games)"),
    },
    async ({ game_id }) => {
      try {
        const result = (await apiCall("move", "POST", { action: "pass" }, game_id)) as {
          success: boolean;
          message: string;
        };
        return { content: [{ type: "text", text: result.message }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
