import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";
import { parseCell, type RackTile } from "../board.js";

export function registerPlayWordTool(server: McpServer) {
  server.tool(
    "play_word",
    "Play tiles on the board. Each tile needs a cell (e.g. 'H8') and letter. All words formed must be valid. The first move must cross the center square (H8). TIP: Use validate_move first to check for invalid cross-words!",
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
        .describe("Tiles to place on the board"),
    },
    async ({ game_id, tiles }) => {
      const apiTiles = tiles.map((t) => {
        const { row, col } = parseCell(t.cell);
        return { row, col, letter: t.letter.toUpperCase(), is_blank: t.is_blank || false };
      });

      try {
        const result = (await apiCall("move", "POST", {
          action: "play",
          tiles: apiTiles,
        }, game_id)) as {
          success: boolean;
          words: { word: string; score: number }[];
          total_score: number;
          new_rack: RackTile[];
          game_over: boolean;
          message: string;
        };

        const wordsText = result.words.map((w) => `${w.word} (${w.score} pts)`).join(", ");
        const newRack = result.new_rack.map((t) => `${t.letter}(${t.value})`).join(" ");

        return {
          content: [{
            type: "text",
            text: [
              `Move played successfully!`,
              `Words: ${wordsText}`,
              `Total score: ${result.total_score} points`,
              `New rack: ${newRack}`,
              result.game_over ? `GAME OVER!` : `Waiting for opponent...`,
            ].join("\n"),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Move rejected: ${(err as Error).message}\n\nCheck that:\n- It's your turn\n- All letters are in your rack\n- Tiles form a valid word in a straight line\n- The word connects to existing tiles (or crosses center on first move)`,
          }],
          isError: true,
        };
      }
    }
  );
}
