import { createClient } from "jsr:@supabase/supabase-js@2";
import type { Tile, BoardCell } from "./_shared/gameConstants.ts";
import { drawTiles } from "./_shared/gameConstants.ts";
import type { TrieNode } from "./_shared/trie.ts";
import { buildTrie } from "./_shared/trie.ts";
import type { GeneratedMove } from "./_shared/moveGenerator.ts";
import { generateAllMoves } from "./_shared/moveGenerator.ts";
import {
  countPlaysByPlayer,
  selectDynamic,
  selectPercentile,
  type Strategy,
} from "./_shared/computerStrategy.ts";
import {
  applyEndgameScoring,
  buildEndgameHistoryEntries,
  type EndgamePlayer,
} from "./_shared/endgame.ts";

// Plays an *all-computer* game to completion in a single invocation, looping the
// same per-move logic as `computer-turn` entirely in memory and writing the
// final game state once. This powers the stats page's "More Games" batch
// simulation (#24): the client creates a game of a given type, then calls this
// to run it to the end without babysitting a GamePage. Games with a human or an
// LLM/API seat are rejected — those need a real player on the clock.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Safety cap on plies. A real 15x15 game ends well under this; the cap only
// guards against an unforeseen non-terminating state.
const MAX_PLIES = 600;

interface ComputerPlayer {
  id: string;
  name: string;
  strategy: Strategy;
  strength: number;
  rack: Tile[];
  score: number;
  owner_id?: string;
}

interface PlayerScoreInfo {
  id: string;
  score: number;
}

function pickMove(
  moves: GeneratedMove[],
  strategy: Strategy,
  strength: number,
  cpuId: string,
  cpuScore: number,
  others: PlayerScoreInfo[],
  moveHistory: { player_id: string; type: string }[],
): GeneratedMove | null {
  if (!moves.length) return null;
  if (strategy === "percentile") return selectPercentile(moves, strength);

  let leader: PlayerScoreInfo = { id: "", score: 0 };
  for (const o of others) {
    if (o.id === cpuId) continue;
    if (o.score > leader.score) leader = o;
  }
  const playCounts = countPlaysByPlayer(moveHistory);
  return selectDynamic(moves, strength, {
    myScore: cpuScore,
    leaderScore: leader.score,
    leaderMoveCount: playCounts[leader.id] ?? 0,
  });
}

// ─── DICTIONARY / TRIE CACHE (per warm instance) ─────────────────────────────
let cachedTrie: TrieNode | null = null;
const DICT_URL =
  "https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt";

async function getTrie(): Promise<TrieNode> {
  if (cachedTrie) return cachedTrie;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(DICT_URL);
    if (res.ok) {
      const text = await res.text();
      if (text.length > 10000) {
        cachedTrie = buildTrie(text);
        return cachedTrie;
      }
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error("Failed to load dictionary after 3 attempts");
}

const rackSnapshot = (rack: Tile[]) =>
  rack.map((t) => ({ letter: t.letter, value: t.value, isBlank: t.isBlank }));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // ─── AUTH ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing auth header" }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { game_id } = await req.json() as { game_id: string };
    if (!game_id) return jsonResponse({ error: "Missing game_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: game, error: gErr } = await supabase
      .from("games")
      .select("*, game_players(player_id)")
      .eq("id", game_id)
      .single();
    if (gErr || !game) return jsonResponse({ error: "Game not found" }, 404);

    // ─── AUTHZ: creator, human member, or API owner ───────────────────────────
    const gamePlayers = (game.game_players ?? []) as { player_id: string }[];
    const computerPlayersRaw = (game.computer_players ?? []) as ComputerPlayer[];
    const isMember = gamePlayers.some((p) => p.player_id === user.id);
    const isApiOwner = computerPlayersRaw.some((cp) => cp.owner_id === user.id);
    if (game.created_by !== user.id && !isMember && !isApiOwner) {
      return jsonResponse({ error: "Forbidden: not a member of this game" }, 403);
    }

    if (game.status !== "active") return jsonResponse({ error: "Game not active" }, 400);

    // ─── This runner only plays games with built-in computer seats. ───────────
    if (gamePlayers.length > 0) {
      return jsonResponse({ error: "Game has human players; cannot auto-simulate" }, 400);
    }
    if (computerPlayersRaw.some((cp) => cp.id.startsWith("api-"))) {
      return jsonResponse({ error: "Game has an LLM/API seat; cannot auto-simulate" }, 400);
    }
    if (computerPlayersRaw.length < 2) {
      return jsonResponse({ error: "Need at least two computer players" }, 400);
    }

    const trie = await getTrie();

    // ─── In-memory game state ────────────────────────────────────────────────
    let board = game.board as BoardCell[][];
    let tileBag = game.tile_bag as Tile[];
    const turnOrder = game.turn_order as string[];
    let turnIndex = game.turn_index as number;
    let consecutivePasses = game.consecutive_passes as number;
    let computerPlayers = computerPlayersRaw.map((cp) => ({ ...cp }));
    const moveHistory = (game.move_history ?? []) as unknown[];
    let lastMove = game.last_move as unknown;
    let status = "active";
    let winner: string | null = null;

    const leader = () =>
      computerPlayers.reduce((best, p) => (p.score > best.score ? p : best)).id;

    let plies = 0;
    while (status === "active" && plies < MAX_PLIES) {
      plies++;
      const currentId = turnOrder[turnIndex];
      const cpu = computerPlayers.find((c) => c.id === currentId);
      if (!cpu) break; // turn order desync — bail rather than spin

      const moves = generateAllMoves(board, cpu.rack, trie);
      const others = computerPlayers.map((c) => ({ id: c.id, score: c.score }));
      const selected = pickMove(
        moves, cpu.strategy, cpu.strength, cpu.id, cpu.score, others,
        moveHistory as { player_id: string; type: string }[],
      );
      const ts = new Date().toISOString();

      if (!selected) {
        // No legal move — pass.
        moveHistory.push({
          player_id: cpu.id, player_name: cpu.name, type: "pass",
          rack_before: cpu.rack, rack_snapshot: rackSnapshot(cpu.rack),
          board_snapshot: board, timestamp: ts,
        });
        consecutivePasses++;
        lastMove = { player_id: cpu.id, type: "pass" };
        if (consecutivePasses >= turnOrder.length * 2) {
          status = "finished";
          winner = leader();
        } else {
          turnIndex = (turnIndex + 1) % turnOrder.length;
        }
        continue;
      }

      // Apply the play.
      const newBoard = board.map((row) => row.map((cell) => ({ ...cell })));
      for (const pt of selected.tiles) {
        newBoard[pt.row][pt.col] = { tile: pt.tile, bonus: newBoard[pt.row][pt.col].bonus, isNew: false };
      }
      const { drawn, remaining } = drawTiles(tileBag, selected.tiles.length);
      const newRack = cpu.rack.filter((t) => !selected.tiles.some((pt) => pt.tile.id === t.id));
      newRack.push(...drawn);
      const newScore = cpu.score + selected.totalScore;

      moveHistory.push({
        player_id: cpu.id, player_name: cpu.name, type: "play",
        tiles: selected.tiles, words: selected.words, score: selected.totalScore,
        rack_before: cpu.rack, rack_snapshot: rackSnapshot(cpu.rack),
        board_snapshot: newBoard, timestamp: ts,
      });

      computerPlayers = computerPlayers.map((c) =>
        c.id === cpu.id ? { ...c, rack: newRack, score: newScore } : c
      );
      board = newBoard;
      tileBag = remaining;
      lastMove = {
        player_id: cpu.id, type: "play",
        tiles: selected.tiles, words: selected.words, score: selected.totalScore,
      };
      consecutivePasses = 0;

      const gameOver = newRack.length === 0 && remaining.length === 0;
      if (gameOver) {
        // Out player takes opponents' rack values; no humans in these games.
        const endgame = applyEndgameScoring({
          outPlayerId: cpu.id,
          outPlayerScoreBeforeBonus: newScore,
          computers: computerPlayers as unknown as EndgamePlayer[],
          humans: [],
        });
        computerPlayers = computerPlayers.map((c) => {
          const u = endgame.computers.find((e) => e.id === c.id);
          return u ? { ...c, score: u.score } : c;
        });
        const nameById = new Map(computerPlayers.map((c) => [c.id, c.name ?? c.id]));
        for (const e of buildEndgameHistoryEntries(endgame, cpu.id, (id) => nameById.get(id) ?? id, ts)) {
          moveHistory.push(e);
        }
        status = "finished";
        winner = leader();
      } else {
        turnIndex = (turnIndex + 1) % turnOrder.length;
      }
    }

    // ─── Persist the final state in one write. ────────────────────────────────
    await supabase.from("games").update({
      board,
      tile_bag: tileBag,
      computer_players: computerPlayers,
      current_turn: status === "finished" ? null : turnOrder[turnIndex],
      turn_index: turnIndex,
      consecutive_passes: consecutivePasses,
      status,
      winner,
      last_move: lastMove,
      move_history: moveHistory,
      updated_at: new Date().toISOString(),
    }).eq("id", game_id);

    return jsonResponse({
      game_over: status === "finished",
      winner,
      plies,
      scores: computerPlayers.map((c) => ({ id: c.id, name: c.name, score: c.score })),
    });
  } catch (err) {
    console.error("simulate-game error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
