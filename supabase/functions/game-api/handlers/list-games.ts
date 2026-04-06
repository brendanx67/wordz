import type { ApiPlayer } from "../api-helpers.ts";
import {
  authenticateUser,
  getServiceClient,
  jsonError,
  jsonOk,
} from "../api-helpers.ts";

export async function handleListGames(req: Request): Promise<Response> {
  const auth = await authenticateUser(req);
  if (!auth) return jsonError("Invalid or missing API key", 401);

  const supabase = getServiceClient();

  const { data: games, error } = await supabase
    .from("games")
    .select("id, status, current_turn, created_at, updated_at, computer_players, game_players(player_id, score, profiles(display_name))")
    .in("status", ["active", "waiting"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return jsonError("Failed to fetch games", 500);

  const myGames = (games ?? []).filter((game) => {
    const cpPlayers = (game.computer_players ?? []) as (ApiPlayer & { owner_id?: string })[];
    return cpPlayers.some((p) => p.id.startsWith("api-") && p.owner_id === auth.userId);
  });

  const result = myGames.map((game) => {
    const cpPlayers = (game.computer_players ?? []) as (ApiPlayer & { owner_id?: string })[];
    const myPlayer = cpPlayers.find((p) => p.id.startsWith("api-") && p.owner_id === auth.userId)!;
    const isMyTurn = game.current_turn === myPlayer.id;

    const humanPlayers = (game.game_players ?? []).map((p: { player_id: string; score: number; profiles: { display_name: string } }) => ({
      name: p.profiles.display_name,
      score: p.score,
      type: "human",
    }));
    const aiPlayers = cpPlayers.map((p) => ({
      name: p.name,
      score: p.score,
      type: p.id.startsWith("computer-") ? "computer" : "api",
    }));

    return {
      game_id: game.id,
      status: game.status,
      is_your_turn: isMyTurn,
      your_player_name: myPlayer.name,
      your_score: myPlayer.score,
      players: [...humanPlayers, ...aiPlayers],
      updated_at: game.updated_at,
    };
  });

  return jsonOk({ games: result });
}
