import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chatApiCall } from "../api-client.js";

interface ReadMessagesResponse {
  channel: {
    id: string;
    name: string;
    display_name: string;
    visibility: string;
  };
  messages: {
    id: string;
    body: string;
    posted_by_user_id: string;
    posted_by_user_name: string;
    posted_by_agent: string | null;
    references_issue: number | null;
    references_commit: string | null;
    references_message_id: string | null;
    created_at: string;
  }[];
  last_read_at: string | null;
}

export function registerReadChatMessagesTool(server: McpServer) {
  server.tool(
    "read_chat_messages",
    "Read the most recent messages in a Wordz chat channel. By default this also marks the channel as read for you.",
    {
      channel: z.string().describe("Channel name (e.g. 'suggestions'). Use list_chat_channels to discover channels."),
      since: z.string().optional().describe("Only return messages posted strictly after this ISO 8601 timestamp."),
      limit: z.number().int().min(1).max(200).optional().describe("Maximum number of messages to return (default 50, max 200). Returns the most recent N."),
      mark_read: z.boolean().optional().describe("If true (default), also marks the channel as read for you at the current time."),
    },
    async ({ channel, since, limit, mark_read }) => {
      try {
        const params = new URLSearchParams();
        if (since) params.set("since", since);
        if (limit !== undefined) params.set("limit", String(limit));
        if (mark_read === false) params.set("mark_read", "false");
        const qs = params.toString();
        const path = `chat/channels/${encodeURIComponent(channel)}/messages${qs ? "?" + qs : ""}`;

        const data = (await chatApiCall(path, "GET")) as ReadMessagesResponse;
        const messages = data.messages ?? [];

        if (messages.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No messages in #${channel}${since ? ` since ${since}` : ""}.`,
            }],
          };
        }

        const lines = messages.map((m) => {
          const when = new Date(m.created_at).toISOString();
          const sender = m.posted_by_agent
            ? `${m.posted_by_user_name} [${m.posted_by_agent}]`
            : m.posted_by_user_name;
          const refs: string[] = [];
          if (m.references_issue) refs.push(`#${m.references_issue}`);
          if (m.references_commit) refs.push(m.references_commit.slice(0, 8));
          if (m.references_message_id) refs.push(`reply→${m.references_message_id.slice(0, 8)}`);
          const refStr = refs.length > 0 ? ` (${refs.join(", ")})` : "";
          return `[${when}] ${sender}${refStr}\n  id=${m.id}\n  ${m.body}`;
        });

        const text = [
          `=== #${data.channel.display_name} (${data.channel.name}) — ${messages.length} message${messages.length !== 1 ? "s" : ""} ===`,
          ``,
          ...lines,
          ``,
          ...(data.last_read_at
            ? [`Channel marked as read at ${data.last_read_at}.`]
            : []),
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to read messages: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
