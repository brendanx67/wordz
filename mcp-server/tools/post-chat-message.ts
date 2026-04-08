import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chatApiCall } from "../api-client.js";

interface PostMessageResponse {
  id: string;
  created_at: string;
}

export function registerPostChatMessageTool(server: McpServer) {
  server.tool(
    "post_chat_message",
    "Post a message to a Wordz chat channel. Your message will be attributed to the API key's owner with an agent annotation showing it came from this MCP server (claude-code). Messages cannot be edited or deleted in v1 — if you make a mistake, post a correction reply.",
    {
      channel: z.string().describe("Channel name (e.g. 'suggestions'). Use list_chat_channels to discover channels."),
      body: z.string().min(1).max(4000).describe("Message body (1–4000 characters)."),
      references_issue: z.number().int().optional().describe("GitHub issue number this message references."),
      references_commit: z.string().optional().describe("Git commit SHA this message references."),
      references_message_id: z.string().optional().describe("Message id this is a reply to (use an id from read_chat_messages)."),
    },
    async ({ channel, body, references_issue, references_commit, references_message_id }) => {
      try {
        const payload: Record<string, unknown> = { body };
        if (references_issue !== undefined) payload.references_issue = references_issue;
        if (references_commit !== undefined) payload.references_commit = references_commit;
        if (references_message_id !== undefined) payload.references_message_id = references_message_id;

        const data = (await chatApiCall(
          `chat/channels/${encodeURIComponent(channel)}/messages`,
          "POST",
          payload
        )) as PostMessageResponse;

        const text = [
          `Posted to #${channel}.`,
          `  id: ${data.id}`,
          `  created_at: ${data.created_at}`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to post message: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
