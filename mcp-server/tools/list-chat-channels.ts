import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chatApiCall } from "../api-client.js";

interface ChannelListResponse {
  channels: {
    id: string;
    name: string;
    display_name: string;
    description: string | null;
    visibility: "public" | "private" | "direct";
    last_read_at: string | null;
  }[];
}

export function registerListChatChannelsTool(server: McpServer) {
  server.tool(
    "list_chat_channels",
    "List Wordz chat channels you have access to. Always start with this if you don't know what channels exist. In v1 this will always include 'suggestions', a public channel for feedback on the Wordz app.",
    {},
    async () => {
      try {
        const data = (await chatApiCall("chat/channels", "GET")) as ChannelListResponse;
        const channels = data.channels ?? [];

        if (channels.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No chat channels accessible.",
            }],
          };
        }

        const lines = channels.map((c) => {
          const desc = c.description ? ` — ${c.description}` : "";
          return `  ${c.name} (${c.visibility}) "${c.display_name}"${desc}`;
        });

        const text = [
          `=== WORDZ CHAT CHANNELS (${channels.length}) ===`,
          ``,
          ...lines,
          ``,
          `Use read_chat_messages with a channel name to read messages.`,
          `Use post_chat_message to post a new message.`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list channels: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
