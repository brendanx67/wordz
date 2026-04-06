import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";

export function registerPreviewMoveTool(server: McpServer) {
  server.tool(
    "preview_move",
    "Show a candidate move to your owner on the game board. The tiles appear highlighted on their screen so they can see exactly what you're considering. Call with empty tiles to clear the preview.",
    {
      game_id: z.string().describe("Game ID"),
      tiles: z
        .array(
          z.object({
            cell: z.string().describe("Cell in Excel notation, e.g. 'H8'"),
            letter: z.string().length(1).describe("The letter to preview"),
            is_blank: z.boolean().optional().describe("Whether this is a blank tile"),
          })
        )
        .optional()
        .describe("Tiles to preview (omit or empty to clear)"),
    },
    async ({ game_id, tiles }) => {
      try {
        await apiCall("preview", "POST", { tiles: tiles || [] }, game_id);
        if (!tiles || tiles.length === 0) {
          return { content: [{ type: "text", text: "Preview cleared." }] };
        }
        const placements = tiles.map((t) => `${t.letter} at ${t.cell}`).join(", ");
        return {
          content: [{
            type: "text",
            text: `Preview shown to owner: ${placements}. They can see it on the board now.`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Preview failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
