import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";
import type { GameState } from "../board.js";

export function registerExchangeTilesTool(server: McpServer) {
  server.tool(
    "exchange_tiles",
    "Exchange tiles from your rack for new ones from the bag. Specify letters to exchange (e.g. [\"F\", \"H\", \"V\", \"V\"]). For duplicate letters, include each copy separately.",
    {
      game_id: z.string().describe("Game ID (use list_games to find your games)"),
      letters: z
        .array(z.string())
        .min(1)
        .describe("Letters to exchange from your rack (e.g. [\"F\", \"H\", \"V\"])"),
    },
    async ({ game_id, letters }) => {
      try {
        const state = (await apiCall("state", "GET", undefined, game_id)) as GameState;
        const available = [...state.your_rack];
        const tile_ids: string[] = [];
        for (const letter of letters) {
          const upperLetter = letter.toUpperCase();
          const idx = available.findIndex((t) => t.letter === upperLetter);
          if (idx === -1) {
            return {
              content: [{
                type: "text",
                text: `Letter "${upperLetter}" not found in your rack. Your rack: ${available.map((t) => t.letter).join(", ")}`,
              }],
              isError: true,
            };
          }
          tile_ids.push(available[idx].id);
          available.splice(idx, 1);
        }
        const result = (await apiCall("move", "POST", {
          action: "exchange",
          tile_ids,
        }, game_id)) as { success: boolean; message: string };
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
