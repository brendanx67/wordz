import {
  authenticateChatUser,
  getServiceClient,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

// Chat handlers for the in-app chat system (issue #6).
//
// All three endpoints (list channels, read messages, post message) authenticate
// via `authenticateChatUser`, which accepts either a Supabase session JWT or an
// api_key, and resolves the optional posted_by_agent annotation from
// x-posted-by-agent > api_key.name > null.
//
// RLS is enforced on the tables, but these handlers use the service-role
// client and enforce access explicitly, because the service client bypasses
// RLS and we need the posted_by_agent resolution to happen server-side (so a
// web client cannot spoof a false agent label).

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchChannelByName(name: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("chat_channels")
    .select("id, name, display_name, description, visibility")
    .eq("name", name)
    .single();
  if (error || !data) return null;
  return data;
}

async function userCanAccessChannel(
  userId: string,
  channel: { id: string; visibility: string }
): Promise<boolean> {
  if (channel.visibility === "public") return true;
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("chat_channel_members")
    .select("user_id")
    .eq("channel_id", channel.id)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

function extractChannelNameFromPath(path: string): string | null {
  // chat/channels/:name/messages  or  chat/channels/:name/read
  const match = path.match(/^chat\/channels\/([^/]+)(?:\/(messages|read))?$/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

// ─── GET /chat/channels ──────────────────────────────────────────────────────
// List channels the caller can see. v1: all public channels + any private/
// direct channels the caller is a member of. Includes last_read_at for
// channels where the caller has a membership row.
export async function handleListChannels(req: Request): Promise<Response> {
  const auth = await authenticateChatUser(req);
  if (!auth) return jsonError("Not authenticated", 401);

  const supabase = getServiceClient();

  const [{ data: publicChannels }, { data: memberRows }] = await Promise.all([
    supabase
      .from("chat_channels")
      .select("id, name, display_name, description, visibility")
      .eq("visibility", "public")
      .order("created_at", { ascending: true }),
    supabase
      .from("chat_channel_members")
      .select("channel_id, last_read_at, chat_channels(id, name, display_name, description, visibility)")
      .eq("user_id", auth.userId),
  ]);

  const lastReadByChannel = new Map<string, string | null>();
  const privateChannels: {
    id: string;
    name: string;
    display_name: string;
    description: string | null;
    visibility: string;
  }[] = [];

  for (const row of (memberRows ?? []) as {
    channel_id: string;
    last_read_at: string | null;
    chat_channels: {
      id: string;
      name: string;
      display_name: string;
      description: string | null;
      visibility: string;
    } | null;
  }[]) {
    lastReadByChannel.set(row.channel_id, row.last_read_at);
    if (row.chat_channels && row.chat_channels.visibility !== "public") {
      privateChannels.push(row.chat_channels);
    }
  }

  const channels = [...(publicChannels ?? []), ...privateChannels].map((c) => ({
    id: c.id,
    name: c.name,
    display_name: c.display_name,
    description: c.description,
    visibility: c.visibility,
    last_read_at: lastReadByChannel.get(c.id) ?? null,
  }));

  return jsonOk({ channels });
}

// ─── GET /chat/channels/:name/messages ───────────────────────────────────────
// Query params: since (ISO ts, optional), limit (50 default, max 200),
// mark_read (default "true").
export async function handleReadMessages(req: Request): Promise<Response> {
  const auth = await authenticateChatUser(req);
  if (!auth) return jsonError("Not authenticated", 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/game-api\/?/, "");
  const name = extractChannelNameFromPath(path);
  if (!name) return jsonError("Missing channel name", 400);

  const channel = await fetchChannelByName(name);
  if (!channel) return jsonError("Channel not found", 404);
  if (!(await userCanAccessChannel(auth.userId, channel))) {
    return jsonError("Not a member of this channel", 403);
  }

  const since = url.searchParams.get("since");
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(200, Math.max(1, limitRaw))
    : 50;
  const markRead = url.searchParams.get("mark_read") !== "false";

  const supabase = getServiceClient();
  let query = supabase
    .from("chat_messages")
    .select(
      "id, body, posted_by_user_id, posted_by_agent, references_issue, references_commit, references_message_id, created_at"
    )
    .eq("channel_id", channel.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) query = query.gt("created_at", since);

  const { data: rawMessages, error } = await query;
  if (error) return jsonError("Failed to load messages", 500);

  // Bulk-fetch display names for all unique senders so we can include
  // posted_by_user_name without an N+1.
  const senderIds = Array.from(
    new Set((rawMessages ?? []).map((m) => m.posted_by_user_id))
  );
  const nameByUser = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", senderIds);
    for (const p of (profiles ?? []) as { id: string; display_name: string }[]) {
      nameByUser.set(p.id, p.display_name);
    }
  }

  const messages = (rawMessages ?? [])
    .map((m) => ({
      id: m.id,
      body: m.body,
      posted_by_user_id: m.posted_by_user_id,
      posted_by_user_name: nameByUser.get(m.posted_by_user_id) ?? "Unknown",
      posted_by_agent: m.posted_by_agent,
      references_issue: m.references_issue,
      references_commit: m.references_commit,
      references_message_id: m.references_message_id,
      created_at: m.created_at,
    }))
    // Return oldest-first to the client, but we fetched newest-first so the
    // `limit` caps the most recent N rather than the oldest N.
    .reverse();

  let lastReadAt: string | null = null;
  if (markRead) {
    lastReadAt = new Date().toISOString();
    const { error: upsertErr } = await supabase
      .from("chat_channel_members")
      .upsert(
        {
          channel_id: channel.id,
          user_id: auth.userId,
          last_read_at: lastReadAt,
        },
        { onConflict: "channel_id,user_id" }
      );
    if (upsertErr) {
      // Non-fatal; still return the messages.
      console.error("mark_read upsert failed:", upsertErr);
      lastReadAt = null;
    }
  }

  return jsonOk({
    channel: {
      id: channel.id,
      name: channel.name,
      display_name: channel.display_name,
      visibility: channel.visibility,
    },
    messages,
    last_read_at: lastReadAt,
  });
}

// ─── POST /chat/channels/:name/messages ──────────────────────────────────────
export async function handlePostMessage(req: Request): Promise<Response> {
  const auth = await authenticateChatUser(req);
  if (!auth) return jsonError("Not authenticated", 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/game-api\/?/, "");
  const name = extractChannelNameFromPath(path);
  if (!name) return jsonError("Missing channel name", 400);

  const channel = await fetchChannelByName(name);
  if (!channel) return jsonError("Channel not found", 404);
  if (!(await userCanAccessChannel(auth.userId, channel))) {
    return jsonError("Not a member of this channel", 403);
  }

  let body: {
    body?: string;
    references_issue?: number;
    references_commit?: string;
    references_message_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const text = (body.body ?? "").trim();
  if (text.length === 0) return jsonError("Message body is required", 400);
  if (text.length > 4000) return jsonError("Message body too long (max 4000 chars)", 400);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      channel_id: channel.id,
      body: text,
      posted_by_user_id: auth.userId,
      posted_by_agent: auth.agent,
      references_issue: body.references_issue ?? null,
      references_commit: body.references_commit ?? null,
      references_message_id: body.references_message_id ?? null,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("post message failed:", error);
    return jsonError("Failed to post message", 500);
  }

  return jsonOk({ id: data.id, created_at: data.created_at });
}

// ─── POST /chat/channels/:name/read ──────────────────────────────────────────
export async function handleMarkRead(req: Request): Promise<Response> {
  const auth = await authenticateChatUser(req);
  if (!auth) return jsonError("Not authenticated", 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/game-api\/?/, "");
  const name = extractChannelNameFromPath(path);
  if (!name) return jsonError("Missing channel name", 400);

  const channel = await fetchChannelByName(name);
  if (!channel) return jsonError("Channel not found", 404);
  if (!(await userCanAccessChannel(auth.userId, channel))) {
    return jsonError("Not a member of this channel", 403);
  }

  const lastReadAt = new Date().toISOString();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("chat_channel_members")
    .upsert(
      {
        channel_id: channel.id,
        user_id: auth.userId,
        last_read_at: lastReadAt,
      },
      { onConflict: "channel_id,user_id" }
    );

  if (error) {
    console.error("mark read failed:", error);
    return jsonError("Failed to mark channel read", 500);
  }

  return jsonOk({ last_read_at: lastReadAt });
}
