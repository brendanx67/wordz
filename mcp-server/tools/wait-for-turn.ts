import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../api-client.js";
import type { GameState } from "../board.js";

export function registerWaitForTurnTool(server: McpServer) {
  server.tool(
    "wait_for_turn",
    "Wait until it's your turn, then return the game state. Polls every 5 seconds. Use this after making a move so you automatically resume when the opponent finishes.",
    {
      game_id: z.string().describe("Game ID (use list_games to find your games)"),
      timeout_minutes: z.number().optional().default(30).describe("Max minutes to wait (default 30)"),
    },
    async ({ game_id, timeout_minutes }) => {
      const deadline = Date.now() + (timeout_minutes ?? 30) * 60 * 1000;

      while (Date.now() < deadline) {
        try {
          const state = (await apiCall("state", "GET", undefined, game_id)) as GameState;

          if (state.status === "finished") {
            const scores = state.players.map((p) => `${p.name}: ${p.score}`).join(", ");
            return {
              content: [{
                type: "text",
                text: `Game over! Final scores: ${scores}\nWinner: ${state.winner}`,
              }],
            };
          }

          if (state.is_your_turn) {
            const rackText = state.your_rack
              .map((t) => `${t.letter}(${t.value}${t.isBlank ? ",blank" : ""})`)
              .join(" ");
            return {
              content: [{
                type: "text",
                text: [
                  `It's your turn!`,
                  `Your rack: ${rackText}`,
                  `Tiles in bag: ${state.tiles_remaining}`,
                  `Scores: ${state.players.map((p) => `${p.name}: ${p.score}`).join(", ")}`,
                  ``,
                  `Use get_game_state for the full board, or go straight to planning your move.`,
                ].join("\n"),
              }],
            };
          }
        } catch {
          // Network hiccup — just retry
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      return {
        content: [{
          type: "text",
          text: `Timed out after ${timeout_minutes} minutes. Use get_game_state to check manually.`,
        }],
      };
    }
  );
}
