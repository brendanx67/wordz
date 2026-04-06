import { createClient } from "jsr:@supabase/supabase-js@2";
import type { Tile } from "./_shared/gameConstants.ts";
import type { TrieNode } from "./_shared/trie.ts";
import { buildTrie } from "./_shared/trie.ts";

// ─── CORS ────────────────────────────────────────────────────────────────────
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

// ─── TYPES ───────────────────────────────────────────────────────────────────
export interface ApiPlayer {
  id: string;
  name: string;
  rack: Tile[];
  score: number;
}

export interface RawTile {
  row?: number;
  col?: number;
  cell?: string;
  letter: string;
  is_blank?: boolean;
}

// ─── RESPONSE HELPERS ────────────────────────────────────────────────────────
export function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── DICTIONARY CACHE ────────────────────────────────────────────────────────
let wordListCache: string | null = null;

export async function getWordList(): Promise<string> {
  if (wordListCache) return wordListCache;
  const res = await fetch(
    "https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt"
  );
  wordListCache = await res.text();
  return wordListCache;
}

export async function getTrie(): Promise<TrieNode> {
  return buildTrie(await getWordList());
}

// ─── CELL NOTATION ───────────────────────────────────────────────────────────
export function normalizeTile(
  t: RawTile
): { row: number; col: number; letter: string; is_blank: boolean } {
  let row: number;
  let col: number;
  if (t.cell) {
    const match = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/);
    if (!match) throw new Error(`Invalid cell "${t.cell}" — use format like H8`);
    col = match[1].charCodeAt(0) - 65;
    row = parseInt(match[2]) - 1;
    if (row < 0 || row > 14) throw new Error(`Invalid row in cell "${t.cell}"`);
  } else if (t.row !== undefined && t.col !== undefined) {
    row = t.row;
    col = t.col;
  } else {
    throw new Error("Each tile must have either 'cell' (e.g. 'H8') or 'row' and 'col'");
  }
  return { row, col, letter: t.letter.toUpperCase(), is_blank: t.is_blank || false };
}

export function cellNotation(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
export async function authenticateUser(req: Request): Promise<{ userId: string } | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return null;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("user_id")
    .eq("api_key", apiKey)
    .single();

  if (error || !data) return null;
  return { userId: data.user_id };
}

export async function authenticateApiKey(
  req: Request,
  gameIdOverride?: string
): Promise<{ userId: string; gameId: string; playerId: string; playerName: string } | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return null;

  const supabase = getServiceClient();

  const { data: keyData, error: keyErr } = await supabase
    .from("api_keys")
    .select("user_id")
    .eq("api_key", apiKey)
    .single();

  if (keyErr || !keyData) return null;

  const url = new URL(req.url);
  const gameId = gameIdOverride || url.searchParams.get("game_id");
  if (!gameId) return null;

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("computer_players")
    .eq("id", gameId)
    .single();

  if (gameErr || !game) return null;

  const cpPlayers = (game.computer_players ?? []) as (ApiPlayer & { owner_id?: string })[];
  const myApiPlayer = cpPlayers.find(
    (p) => p.id.startsWith("api-") && p.owner_id === keyData.user_id
  );

  if (!myApiPlayer) return null;

  return {
    userId: keyData.user_id,
    gameId,
    playerId: myApiPlayer.id,
    playerName: myApiPlayer.name,
  };
}

// ─── GAME HELPERS ────────────────────────────────────────────────────────────
export function findWinner(game: Record<string, unknown>): string {
  const humanPlayers = ((game.game_players ?? []) as { player_id: string; score: number }[]);
  const cpPlayers = ((game.computer_players ?? []) as ApiPlayer[]);
  const all = [
    ...humanPlayers.map((p) => ({ id: p.player_id, score: p.score })),
    ...cpPlayers.map((p) => ({ id: p.id, score: p.score })),
  ];
  all.sort((a, b) => b.score - a.score);
  return all[0]?.id ?? "";
}
