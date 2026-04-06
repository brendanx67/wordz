import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";

export function registerValidateSuggestionTool(server: McpServer) {
  server.tool(
    "validate_suggestion",
    "Validate the move your owner suggested (tiles they placed on the board) WITHOUT playing it. Returns all words formed and whether each is valid, just like validate_move. Use this to check if the suggestion is good before playing it with play_suggestion.",
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
              text: "No suggestion from owner to validate. Use get_game_state to check.",
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

        const result = (await apiCall("validate", "POST", { tiles: apiTiles }, game_id)) as {
          valid: boolean;
          words: { word: string; score: number; valid: boolean }[];
          total_score: number;
          invalid_words: string[];
        };

        const wordLines = result.words.map(
          (w) => `  ${w.valid ? "✓" : "✗"} ${w.word} (${w.score} pts)${w.valid ? "" : " ← INVALID"}`
        );

        const placements = state.suggested_move.tiles.map((t) => `${t.letter} at ${t.cell}`).join(", ");

        const text = result.valid
          ? [
              `✓ OWNER'S SUGGESTION IS VALID — Total score: ${result.total_score} points`,
              `Suggestion: ${placements}`,
              `Words formed:`,
              ...wordLines,
              ``,
              `Use play_suggestion to commit this move.`,
            ].join("\n")
          : [
              `✗ OWNER'S SUGGESTION IS INVALID`,
              `Suggestion: ${placements}`,
              `Words formed:`,
              ...wordLines,
              ``,
              `Invalid word(s): ${result.invalid_words.join(", ")}`,
              `You may want to suggest a different move using preview_move, or find your own play.`,
            ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Validation failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
