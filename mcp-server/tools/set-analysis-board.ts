import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";

export function registerSetAnalysisBoardTool(server: McpServer) {
  server.tool(
    "set_analysis_board",
    "Set up a board position in the user's Analysis Mode. The board is saved to their account and visible when they open Analysis Mode in the browser. Use this to reproduce a physical board from a photo, set up a puzzle, or prepare a position for discussion. The user can then view, edit, and analyze the position in their browser.",
    {
      tiles: z
        .array(
          z.object({
            cell: z
              .string()
              .describe("Board position: column letter (A-O) + row number (1-15). e.g. 'H8' for center. Columns go left-to-right A-O, rows go top-to-bottom 1-15."),
            letter: z.string().describe("The letter on this tile (A-Z)"),
            is_blank: z
              .boolean()
              .optional()
              .describe("True if this tile is a blank representing this letter (default false)"),
          })
        )
        .describe("Tiles to place on the board. Must form a connected group crossing center (H8)."),
      rack: z
        .string()
        .describe("Letters for the rack (0-7 chars). Use ? for blank tiles. Example: 'AEIOU?S'. Leave empty to set only the board."),
    },
    async ({ tiles, rack }) => {
      try {
        // Convert cell notation to row/col for storage
        const boardTiles = tiles.map((t) => {
          const match = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/);
          if (!match) throw new Error(`Invalid cell "${t.cell}" — use format like H8`);
          const col = match[1].charCodeAt(0) - 65;
          const row = parseInt(match[2]) - 1;
          if (row < 0 || row > 14) throw new Error(`Invalid row in cell "${t.cell}"`);
          return {
            row,
            col,
            letter: t.letter.toUpperCase(),
            is_blank: t.is_blank || false,
          };
        });

        const result = (await apiCall("analysis-board", "PUT", {
          board: boardTiles,
          rack: rack || "",
        })) as { ok: boolean; tiles_on_board: number; rack_letters: number };

        const text = [
          `Board set up with ${result.tiles_on_board} tile${result.tiles_on_board !== 1 ? "s" : ""} on the board${result.rack_letters > 0 ? ` and ${result.rack_letters} letter${result.rack_letters !== 1 ? "s" : ""} in the rack` : ""}.`,
          ``,
          `The user can now open Analysis Mode in their browser to see and interact with this position.`,
          `Use analyze_board with the same tiles and rack to see all legal moves.`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to set analysis board: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
