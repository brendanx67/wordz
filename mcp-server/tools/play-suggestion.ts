import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";

export function registerPlaySuggestionTool(server: McpServer) {
  server.tool(
    "play_suggestion",
    "Play the move your owner suggested (tiles they placed on the board). Use get_game_state first to see if there's a suggestion. Use validate_suggestion to check it first.",
    {
      game_id: z.string().describe("Game ID"),
    },
    async ({ game_id }) => {
      try {
        const state = (await apiCall("state", "GET", undefined, game_id)) as {
          suggested_move?: {
            tiles: { cell: string; row: number; col: number; letter: string; is_blank: boolean }[];
          };
        };

        if (!state.suggested_move || !state.suggested_move.tiles?.length) {
          return {
            content: [{
              type: "text",
              text: "No suggestion from owner to play. Use get_game_state to check.",
            }],
            isError: true,
          };
        }

        const apiTiles = state.suggested_move.tiles.map((t) => ({
          row: t.row,
          col: t.col,
          letter: t.letter.toUpperCase(),
          is_blank: t.is_blank || false,
        }));

        const result = (await apiCall("move", "POST", {
          action: "play",
          tiles: apiTiles,
        }, game_id)) as {
          success: boolean;
          words: { word: string; score: number }[];
          total_score: number;
          new_rack: { letter: string; value: number }[];
          game_over: boolean;
        };

        const wordsText = result.words.map((w) => `${w.word} (${w.score} pts)`).join(", ");
        const rackText = result.new_rack.map((t) => `${t.letter}(${t.value})`).join(" ");

        return {
          content: [{
            type: "text",
            text: [
              `✓ Played owner's suggestion!`,
              `Words: ${wordsText}`,
              `Total: ${result.total_score} points`,
              `New rack: ${rackText}`,
              result.game_over ? `\n🏁 GAME OVER!` : ``,
            ].join("\n"),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to play suggestion: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
