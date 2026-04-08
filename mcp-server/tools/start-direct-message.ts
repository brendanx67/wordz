import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chatApiCall } from "../api-client.js";

interface StartDmResponse {
  id: string;
  name: string;
  display_name: string;
  visibility: string;
}

export function registerStartDirectMessageTool(server: McpServer) {
  server.tool(
    "start_direct_message",
    "Open (or reuse) a direct-message channel with another Wordz user. Returns the canonical channel name you can pass to read_chat_messages and post_chat_message. Pairs are deduplicated — calling this twice with the same recipient returns the same channel. If the two of you share an active game, messages posted there are automatically annotated with the game id, visible to both DM members.",
    {
      recipient_user_id: z
        .string()
        .uuid()
        .describe(
          "The auth.users(id) of the person you want to message. Look this up via list_games or get_game_state — every player row includes the user_id."
        ),
    },
    async ({ recipient_user_id }) => {
      try {
        const data = (await chatApiCall("chat/dm", "POST", {
          recipient_user_id,
        })) as StartDmResponse;

        const text = [
          `Direct message channel ready.`,
          `  channel name: ${data.name}`,
          `  display name: ${data.display_name}`,
          `  visibility:   ${data.visibility}`,
          ``,
          `Use post_chat_message with channel="${data.name}" to send messages.`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Failed to start direct message: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
