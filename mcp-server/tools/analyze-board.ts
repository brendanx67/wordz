import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";

export function registerAnalyzeBoardTool(server: McpServer) {
  server.tool(
    "analyze_board",
    "Analyze any Scrabble board position to find all legal moves. Provide the tiles currently on the board and the rack letters. Useful for: analyzing a physical board (from a photo), exploring hypothetical positions, studying endgame scenarios. Does NOT require a game — works standalone.",
    {
      tiles: z
        .array(
          z.object({
            cell: z
              .string()
              .describe("Board position in column-letter + row-number format, e.g. 'H8' for center. Columns A-O left to right, rows 1-15 top to bottom."),
            letter: z.string().describe("The letter on this tile (A-Z)"),
            is_blank: z
              .boolean()
              .optional()
              .describe("True if this tile is a blank representing this letter"),
          })
        )
        .describe("Tiles on the board. The first word must cross the center square (H8). All tiles must form one connected group."),
      rack_letters: z
        .string()
        .describe("Letters in the rack (1-7 chars). Use ? for blank tiles. Example: 'AEIOU?S'"),
      sort_by: z
        .enum(["score", "length", "tiles_used"])
        .optional()
        .describe("Sort order (default: score)"),
      filter: z
        .object({
          contains_letter: z.string().optional().describe("Only moves using this letter from the rack"),
          min_length: z.number().optional().describe("Minimum main word length"),
          max_length: z.number().optional().describe("Maximum main word length"),
          uses_blank: z.boolean().optional().describe("Filter by blank tile usage"),
          min_score: z.number().optional().describe("Minimum total score"),
          touches_cell: z.string().optional().describe("Only moves placing a tile on this cell (e.g. 'H8')"),
        })
        .optional()
        .describe("Filters to narrow results"),
      limit: z
        .number()
        .optional()
        .describe("Max results to return (default 20, max 50)"),
    },
    async ({ tiles, rack_letters, sort_by, filter, limit }) => {
      try {
        const result = (await apiCall("analyze", "POST", {
          tiles,
          rack_letters,
          sort_by,
          filter,
          limit: limit || 20,
        })) as {
          total_moves_found: number;
          showing: number;
          sort_by: string;
          moves: {
            tiles: {
              cell: string;
              letter: string;
              value: number;
              is_blank: boolean;
            }[];
            words: { word: string; score: number }[];
            total_score: number;
            tiles_used: number;
            is_bingo: boolean;
            rack_leave: string;
          }[];
        };

        if (result.total_moves_found === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No legal moves found. Check that:\n- The board tiles form one connected group crossing the center (H8)\n- The rack has at least one tile\n- The tile placements are valid (columns A-O, rows 1-15)",
              },
            ],
          };
        }

        const moveLines = result.moves.map((m, i) => {
          const placements = m.tiles
            .map((t) => `${t.letter}${t.is_blank ? "*" : ""}(${t.cell})`)
            .join(" ");
          const words = m.words
            .map((w) => `${w.word}(${w.score})`)
            .join(" + ");
          return `  ${i + 1}. ${words} = ${m.total_score} pts | Place: ${placements} | Leave: ${m.rack_leave || "(empty)"}${m.is_bingo ? " BINGO!" : ""}`;
        });

        const text = [
          `Found ${result.total_moves_found} legal moves.`,
          `Showing top ${result.showing} by ${result.sort_by}:`,
          ``,
          ...moveLines,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Board analysis failed: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
