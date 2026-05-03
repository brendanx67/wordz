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
} from "./_shared/computerStrategy.ts";
import type { Strategy } from "./_shared/computerStrategy.ts";

// ─── CORS ──────────────────────────────────────────────────────────────────────
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Dynamic: identify the leading opponent and how many plays they've made.
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

// ─── DICTIONARY CACHE ──────────────────────────────────────────────────────────
let wordList: string | null = null;
const DICT_URL =
  "https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt";

async function getWordList(): Promise<string> {
  if (wordList) return wordList;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(DICT_URL);
    if (res.ok) {
      const text = await res.text();
      if (text.length > 10000) {
        wordList = text;
        return text;
      }
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error("Failed to load dictionary after 3 attempts");
}

// ─── TYPES FOR MULTI-COMPUTER ──────────────────────────────────────────────────
interface ComputerPlayer {
  id: string;
  name: string;
  // strategy + strength replace the old `difficulty` enum. Easy/Medium/Hard
  // map to (percentile, 50/80/100); Competitive maps to (dynamic, 100); the
  // slider in the create-game form lets the user pick anything in between.
  strategy: Strategy;
  strength: number;
  rack: Tile[];
  score: number;
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // ─── AUTH: verify caller's JWT before touching the service-role client ─────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { game_id: string; player_id?: string };
    const { game_id, player_id } = body;
    if (!game_id) {
      return new Response(JSON.stringify({ error: "Missing game_id" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: game, error: gErr } = await supabase
      .from("games")
      .select("*, game_players(player_id)")
      .eq("id", game_id)
      .single();
    if (gErr || !game) {
      return new Response(JSON.stringify({ error: "Game not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ─── AUTHZ: caller must be a human player, an API player owner, OR the game creator
    const gamePlayers = (game.game_players ?? []) as { player_id: string }[];
    const cpForAuth = (game.computer_players ?? []) as { id: string; owner_id?: string }[];
    const isHumanMember = gamePlayers.some((p) => p.player_id === user.id);
    const isApiOwner = cpForAuth.some((cp) => cp.owner_id === user.id);
    const isCreator = game.created_by === user.id;
    if (!isHumanMember && !isApiOwner && !isCreator) {
      return new Response(JSON.stringify({ error: "Forbidden: not a member of this game" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (game.status !== "active") {
      return new Response(JSON.stringify({ error: "Game not active" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const currentTurn = game.current_turn as string;
    // Validate it's a computer player's turn
    if (!currentTurn.startsWith("computer-")) {
      return new Response(JSON.stringify({ error: "Not a computer's turn" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // If player_id specified, validate it matches
    if (player_id && player_id !== currentTurn) {
      return new Response(JSON.stringify({ error: "Not this computer's turn" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Find the computer player in the computer_players array
    const computerPlayers = (game.computer_players || []) as ComputerPlayer[];
    const cpuPlayer = computerPlayers.find(cp => cp.id === currentTurn);

    if (!cpuPlayer) {
      return new Response(JSON.stringify({ error: "Computer player not found" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Load dictionary and build trie
    const wl = await getWordList();
    const trie = buildTrie(wl);

    const board = game.board as BoardCell[][];
    const tileBag = game.tile_bag as Tile[];
    const turnOrder = game.turn_order as string[];

    // Generate and select a move
    const moves = generateAllMoves(board, cpuPlayer.rack, trie);

    // For dynamic strategy, look up every other player's id+score plus the
    // play-by-play history so the strategy can compute the leader's per-turn
    // average accurately.
    let others: PlayerScoreInfo[] = [];
    let moveHistoryForSelect: { player_id: string; type: string }[] = [];
    if (cpuPlayer.strategy === "dynamic") {
      const { data: humanPlayers } = await supabase
        .from("game_players").select("player_id, score").eq("game_id", game_id);
      others = [
        ...(humanPlayers || []).map((p: { player_id: string; score: number }) =>
          ({ id: p.player_id, score: p.score })),
        ...computerPlayers.map(cp => ({ id: cp.id, score: cp.score })),
      ];
      moveHistoryForSelect = (game.move_history || []) as { player_id: string; type: string }[];
    }

    const selected = pickMove(
      moves, cpuPlayer.strategy, cpuPlayer.strength,
      cpuPlayer.id, cpuPlayer.score, others, moveHistoryForSelect,
    );

    if (!selected) {
      // No valid moves — pass
      const nextIndex = (game.turn_index + 1) % turnOrder.length;
      const newPasses = game.consecutive_passes + 1;
      const isGameOver = newPasses >= turnOrder.length * 2;

      // Record move in history
      const moveHistory = (game.move_history || []) as unknown[];
      moveHistory.push({
        player_id: cpuPlayer.id,
        player_name: cpuPlayer.name,
        type: "pass",
        rack_before: cpuPlayer.rack,
        rack_snapshot: cpuPlayer.rack.map((t: { letter: string; value: number; isBlank?: boolean }) => ({ letter: t.letter, value: t.value, isBlank: t.isBlank })),
        board_snapshot: board,
        timestamp: new Date().toISOString(),
      });

      const updates: Record<string, unknown> = {
        current_turn: turnOrder[nextIndex],
        turn_index: nextIndex,
        consecutive_passes: newPasses,
        last_move: { player_id: cpuPlayer.id, type: "pass" },
        move_history: moveHistory,
        updated_at: new Date().toISOString(),
      };

      if (isGameOver) {
        updates.status = "finished";
        const { data: players } = await supabase
          .from("game_players").select("player_id, score").eq("game_id", game_id);
        const allScores = [
          ...(players || []).map((p: { player_id: string; score: number }) => ({ id: p.player_id, score: p.score })),
          ...computerPlayers.map(cp => ({ id: cp.id, score: cp.score })),
        ];
        const winner = allScores.reduce((best, p) => p.score > best.score ? p : best);
        updates.winner = winner.id;
      }

      await supabase.from("games").update(updates).eq("id", game_id);

      return new Response(JSON.stringify({
        action: "pass",
        player_name: cpuPlayer.name,
        game_over: isGameOver,
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Play the selected move
    const newBoard = board.map(row => row.map(cell => ({ ...cell })));
    for (const pt of selected.tiles) {
      newBoard[pt.row][pt.col] = {
        tile: pt.tile,
        bonus: newBoard[pt.row][pt.col].bonus,
        isNew: false,
      };
    }

    const { drawn, remaining } = drawTiles(tileBag, selected.tiles.length);
    const newRack = cpuPlayer.rack.filter(
      (t: Tile) => !selected.tiles.some(pt => pt.tile.id === t.id)
    );
    newRack.push(...drawn);

    const nextIndex = (game.turn_index + 1) % turnOrder.length;
    const gameOver = newRack.length === 0 && remaining.length === 0;
    let newScore = cpuPlayer.score + selected.totalScore;

    // Update this computer player in the array
    const updatedCpuPlayers = computerPlayers.map(cp =>
      cp.id === cpuPlayer!.id
        ? { ...cp, rack: newRack, score: newScore }
        : cp
    );

    // Record move in history
    const moveHistory = (game.move_history || []) as unknown[];
    moveHistory.push({
      player_id: cpuPlayer.id,
      player_name: cpuPlayer.name,
      type: "play",
      tiles: selected.tiles,
      words: selected.words,
      score: selected.totalScore,
      rack_before: cpuPlayer.rack,
      rack_snapshot: cpuPlayer.rack.map((t: { letter: string; value: number; isBlank?: boolean }) => ({ letter: t.letter, value: t.value, isBlank: t.isBlank })),
      board_snapshot: newBoard,
      timestamp: new Date().toISOString(),
    });

    const gameUpdates: Record<string, unknown> = {
      board: newBoard,
      tile_bag: remaining,
      current_turn: turnOrder[nextIndex],
      turn_index: nextIndex,
      consecutive_passes: 0,
      computer_players: updatedCpuPlayers,
      last_move: {
        player_id: cpuPlayer.id,
        type: "play",
        tiles: selected.tiles,
        words: selected.words,
        score: selected.totalScore,
      },
      move_history: moveHistory,
      updated_at: new Date().toISOString(),
    };

    if (gameOver) {
      const { data: players } = await supabase
        .from("game_players").select("player_id, score, rack").eq("game_id", game_id);
      let bonus = 0;
      for (const p of (players || [])) {
        const rack = (p.rack || []) as Tile[];
        const rackVal = rack.reduce((s: number, t: Tile) => s + t.value, 0);
        bonus += rackVal;
        await supabase.from("game_players").update({ score: Math.max(0, p.score - rackVal) })
          .eq("game_id", game_id).eq("player_id", p.player_id);
      }
      // Also deduct from other computer players' racks
      for (const otherCp of updatedCpuPlayers) {
        if (otherCp.id !== cpuPlayer.id) {
          const rackVal = otherCp.rack.reduce((s: number, t: Tile) => s + t.value, 0);
          bonus += rackVal;
          otherCp.score = Math.max(0, otherCp.score - rackVal);
        }
      }
      newScore += bonus;
      // Update the winning computer's score in the array
      const finalCpuPlayers = updatedCpuPlayers.map(cp =>
        cp.id === cpuPlayer!.id ? { ...cp, score: newScore } : cp
      );
      gameUpdates.computer_players = finalCpuPlayers;
      gameUpdates.status = "finished";

      const allScores = [
        ...(players || []).map((p: { player_id: string; score: number; rack: Tile[] }) => {
          const rv = ((p.rack || []) as Tile[]).reduce((s: number, t: Tile) => s + t.value, 0);
          return { id: p.player_id, score: Math.max(0, p.score - rv) };
        }),
        ...finalCpuPlayers.map(cp => ({ id: cp.id, score: cp.score })),
      ];
      const winner = allScores.reduce((best, p) => p.score > best.score ? p : best);
      gameUpdates.winner = winner.id;
    }

    await supabase.from("games").update(gameUpdates).eq("id", game_id);

    return new Response(JSON.stringify({
      action: "play",
      player_name: cpuPlayer.name,
      words: selected.words.map(w => w.word),
      score: selected.totalScore,
      total_score: newScore,
      game_over: gameOver,
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Computer turn error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
