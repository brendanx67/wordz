import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";

export function registerFindWordsTool(server: McpServer) {
  server.tool(
    "find_words",
    "Search ALL legal moves using the Appel & Jacobson algorithm. Returns moves sorted and filtered as requested. Only available if word finder is enabled for the game. Use this to see what the board offers before deciding your play.",
    {
      game_id: z.string().describe("Game ID"),
      sort_by: z.enum(["score", "length", "tiles_used"]).optional().describe("Sort order (default: score)"),
      filter: z
        .object({
          contains_letter: z.string().optional().describe("Only moves using this letter from your rack"),
          min_length: z.number().optional().describe("Minimum main word length"),
          max_length: z.number().optional().describe("Maximum main word length"),
          uses_blank: z.boolean().optional().describe("Filter by blank tile usage"),
          min_score: z.number().optional().describe("Minimum total score"),
          touches_cell: z.string().optional().describe("Only moves placing a tile on this cell (e.g. 'H8')"),
        })
        .optional()
        .describe("Filters to narrow results"),
      limit: z.number().optional().describe("Max results to return (default 10, max 50)"),
    },
    async ({ game_id, sort_by, filter, limit }) => {
      try {
        const result = (await apiCall("find-words", "POST", {
          sort_by,
          filter,
          limit: limit || 10,
        }, game_id)) as {
          total_moves_found: number;
          filtered_count: number;
          showing: number;
          moves: {
            tiles: { cell: string; letter: string; value: number; is_blank: boolean }[];
            words: { word: string; score: number }[];
            total_score: number;
            tiles_used: number;
            is_bingo: boolean;
            rack_leave: string;
          }[];
        };

        const moveLines = result.moves.map((m, i) => {
          const placements = m.tiles.map((t) => `${t.letter}(${t.cell})`).join(" ");
          const words = m.words.map((w) => `${w.word}(${w.score})`).join(" + ");
          return `  ${i + 1}. ${words} = ${m.total_score} pts | Place: ${placements} | Leave: ${m.rack_leave || "(empty)"}${m.is_bingo ? " ★BINGO" : ""}`;
        });

        const text = [
          `Found ${result.total_moves_found} total legal moves${result.filtered_count !== result.total_moves_found ? `, ${result.filtered_count} after filtering` : ""}.`,
          `Showing top ${result.showing}${sort_by ? ` by ${sort_by}` : " by score"}:`,
          ``,
          ...moveLines,
          ``,
          `To play any of these, use play_word with the tile placements shown.`,
          `To validate first, use validate_move with the same tiles.`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Find words failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
