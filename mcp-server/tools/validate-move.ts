import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";
import { parseCell } from "../board.js";

export function registerValidateMoveTool(server: McpServer) {
  server.tool(
    "validate_move",
    "Test a move WITHOUT committing it. Returns all words that would form (including cross-words) and whether each is valid. Use this BEFORE play_word to check for invalid cross-words. Same tile format as play_word.",
    {
      game_id: z.string().describe("Game ID (use list_games to find your games)"),
      tiles: z
        .array(
          z.object({
            cell: z.string().describe("Cell in Excel notation, e.g. 'H8' (column A-O, row 1-15)"),
            letter: z.string().length(1).describe("The letter to play"),
            is_blank: z.boolean().optional().describe("Set to true if using a blank tile"),
          })
        )
        .min(1)
        .describe("Tiles to test on the board"),
    },
    async ({ game_id, tiles }) => {
      const apiTiles = tiles.map((t) => {
        const { row, col } = parseCell(t.cell);
        return { row, col, letter: t.letter.toUpperCase(), is_blank: t.is_blank || false };
      });

      try {
        const result = (await apiCall("validate", "POST", { tiles: apiTiles }, game_id)) as {
          valid: boolean;
          words: { word: string; score: number; valid: boolean }[];
          total_score: number;
          invalid_words: string[];
          error: string | null;
        };

        const wordLines = result.words.map(
          (w) => `  ${w.valid ? "✓" : "✗"} ${w.word} (${w.score} pts)${w.valid ? "" : " ← INVALID"}`
        );

        const text = result.valid
          ? [
              `✓ MOVE IS VALID — Total score: ${result.total_score} points`,
              `Words formed:`,
              ...wordLines,
              ``,
              `Safe to play! Use play_word with the same tiles to commit.`,
            ].join("\n")
          : [
              `✗ MOVE IS INVALID`,
              `Words formed:`,
              ...wordLines,
              ``,
              `Invalid word(s): ${result.invalid_words.join(", ")}`,
              `Try a different placement to avoid these cross-words.`,
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
