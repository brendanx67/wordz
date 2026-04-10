import { getServiceClient, jsonError, jsonOk } from "../api-helpers.ts";

// POST /game-api/delete-account
// Permanently deletes the authenticated user's account and cascades
// cleanup across games, chat, API keys, and the auth record.
//
// Order of operations (from issue #19):
//   1. Authenticate via JWT
//   2. Delete games where user is sole human participant
//   3. Remove user's remaining game_player rows
//   4. Delete API keys
//   5. Remove chat channel memberships
//   6. Eliminate orphaned DM channels (zero remaining members)
//   7. Delete analysis board
//   8. Delete profile record
//   9. Delete auth.users row via admin API

export async function handleDeleteAccount(req: Request): Promise<Response> {
  // 1. Authenticate via JWT only (no API key — self-delete only)
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Not authenticated", 401);
  }
  const token = authHeader.slice("Bearer ".length);
  const supabase = getServiceClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser(
    token
  );
  if (userErr || !userData.user) {
    return jsonError("Not authenticated", 401);
  }
  const userId = userData.user.id;

  // 2. Find and delete games where this user is the SOLE human player.
  //    (Games with other humans persist — the user's seat just goes away.)
  const { data: userGameRows } = await supabase
    .from("game_players")
    .select("game_id")
    .eq("player_id", userId);

  const gameIds = (userGameRows ?? []).map(
    (r: { game_id: string }) => r.game_id
  );

  const soleGameIds: string[] = [];
  for (const gid of gameIds) {
    const { count } = await supabase
      .from("game_players")
      .select("*", { count: "exact", head: true })
      .eq("game_id", gid);
    if ((count ?? 0) <= 1) {
      soleGameIds.push(gid);
    }
  }

  if (soleGameIds.length > 0) {
    // Delete game-specific chat channels first (cascades to messages + members)
    const channelNames = soleGameIds.map((id) => `game-${id}`);
    await supabase
      .from("chat_channels")
      .delete()
      .in("name", channelNames);

    // Delete the games (cascades to game_moves and game_players via FK)
    await supabase.from("games").delete().in("id", soleGameIds);
  }

  // 3. Remove user's remaining game_player rows (shared games)
  await supabase.from("game_players").delete().eq("player_id", userId);

  // 4. Delete API keys
  await supabase.from("api_keys").delete().eq("user_id", userId);

  // 5. Remove chat channel memberships
  await supabase
    .from("chat_channel_members")
    .delete()
    .eq("user_id", userId);

  // 6. Delete orphaned DM channels (no remaining members)
  const { data: dmChannels } = await supabase
    .from("chat_channels")
    .select("id")
    .eq("visibility", "direct");

  if (dmChannels && dmChannels.length > 0) {
    for (const ch of dmChannels) {
      const { count } = await supabase
        .from("chat_channel_members")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", ch.id);
      if ((count ?? 0) === 0) {
        // Deleting channel cascades to messages
        await supabase.from("chat_channels").delete().eq("id", ch.id);
      }
    }
  }

  // 7. Delete analysis board
  await supabase.from("analysis_boards").delete().eq("user_id", userId);

  // 8. Delete profile record (FK SET NULL on game_moves, games, game_players)
  await supabase.from("profiles").delete().eq("id", userId);

  // 9. Delete auth.users row via admin API
  const { error: deleteAuthErr } =
    await supabase.auth.admin.deleteUser(userId);
  if (deleteAuthErr) {
    console.error("Failed to delete auth user:", deleteAuthErr);
    // Profile + data are already gone — log but don't fail
  }

  return jsonOk({ deleted: true });
}
