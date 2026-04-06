import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_URL, API_KEY } from "../api-client.js";

export function registerListGamesTool(server: McpServer) {
  server.tool(
    "list_games",
    "List all Wordz games you're involved in. Shows game IDs, status, whose turn it is, and scores. Use this to find which game to play.",
    {},
    async () => {
      try {
        const url = `${API_URL}/games`;
        const res = await fetch(url, {
          headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        });
        const data = (await res.json()) as {
          games?: {
            game_id: string;
            status: string;
            is_your_turn: boolean;
            your_player_name: string;
            your_score: number;
            players: { name: string; score: number; type: string }[];
            updated_at: string;
          }[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || `API error: ${res.status}`);

        const games = data.games ?? [];
        if (games.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No active games found. Ask your human to create a game with an API Player slot for you.",
            }],
          };
        }

        const lines = games.map((g) => {
          const turnInfo = g.is_your_turn ? ">>> YOUR TURN <<<" : "Waiting for opponent";
          const players = g.players.map((p) => `${p.name}: ${p.score}`).join(", ");
          const ago = new Date(g.updated_at).toLocaleString();
          return [
            `Game: ${g.game_id}`,
            `  Status: ${g.status} | ${turnInfo}`,
            `  You are: ${g.your_player_name} (score: ${g.your_score})`,
            `  Players: ${players}`,
            `  Last activity: ${ago}`,
          ].join("\n");
        });

        const text = [
          `=== YOUR WORDZ GAMES ===`,
          `Found ${games.length} game${games.length !== 1 ? "s" : ""}:`,
          ``,
          ...lines,
          ``,
          `To play, call get_game_state with the game_id, or call game_context first for strategic briefing.`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list games: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
