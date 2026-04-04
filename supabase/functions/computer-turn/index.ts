import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── CORS ──────────────────────────────────────────────────────────────────────
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── GAME CONSTANTS ────────────────────────────────────────────────────────────
const BOARD_SIZE = 15;

type BonusType = "TW" | "DW" | "TL" | "DL" | "CENTER" | null;

interface Tile {
  letter: string;
  value: number;
  isBlank: boolean;
  id: string;
}

interface BoardCell {
  tile: Tile | null;
  bonus: BonusType;
  isNew: boolean;
}

const TW = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
const DW = [
  [1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
  [1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],
];
const TL = [
  [1,5],[1,9],[5,1],[5,5],[5,9],[5,13],
  [9,1],[9,5],[9,9],[9,13],[13,5],[13,9],
];
const DL = [
  [0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],
  [6,2],[6,6],[6,8],[6,12],[7,3],[7,11],
  [8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],
  [12,6],[12,8],[14,3],[14,11],
];

const bonusMap = new Map<string, BonusType>();
TW.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "TW"));
DW.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "DW"));
TL.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "TL"));
DL.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "DL"));
bonusMap.set("7,7", "CENTER");

function getBonusType(row: number, col: number): BonusType {
  return bonusMap.get(`${row},${col}`) ?? null;
}

function drawTiles(bag: Tile[], count: number): { drawn: Tile[]; remaining: Tile[] } {
  const drawn = bag.slice(0, count);
  const remaining = bag.slice(count);
  return { drawn, remaining };
}

// ─── TRIE ──────────────────────────────────────────────────────────────────────
interface TrieNode {
  children: Map<string, TrieNode>;
  isTerminal: boolean;
}

function createTrieNode(): TrieNode {
  return { children: new Map(), isTerminal: false };
}

function insertWord(root: TrieNode, word: string): void {
  let node = root;
  for (const ch of word) {
    let child = node.children.get(ch);
    if (!child) {
      child = createTrieNode();
      node.children.set(ch, child);
    }
    node = child;
  }
  node.isTerminal = true;
}

function isWord(root: TrieNode, word: string): boolean {
  let node = root;
  for (const ch of word) {
    const child = node.children.get(ch);
    if (!child) return false;
    node = child;
  }
  return node.isTerminal;
}

function getNode(root: TrieNode, prefix: string): TrieNode | null {
  let node = root;
  for (const ch of prefix) {
    const child = node.children.get(ch);
    if (!child) return null;
    node = child;
  }
  return node;
}

let cachedTrie: TrieNode | null = null;

function buildTrie(wordList: string): TrieNode {
  if (cachedTrie) return cachedTrie;
  const root = createTrieNode();
  const words = wordList.split("\n");
  for (const word of words) {
    const trimmed = word.trim().toUpperCase();
    if (trimmed.length >= 2) {
      insertWord(root, trimmed);
    }
  }
  cachedTrie = root;
  return root;
}

// ─── MOVE GENERATOR (Appel & Jacobsen) ────────────────────────────────────────
interface GeneratedMove {
  tiles: { row: number; col: number; tile: Tile }[];
  words: { word: string; score: number }[];
  totalScore: number;
}

function getCrossCheckSet(
  board: BoardCell[][], trie: TrieNode,
  row: number, col: number, checkVertical: boolean
): Set<string> {
  let prefixStr = "", suffixStr = "";
  if (checkVertical) {
    let r = row - 1;
    while (r >= 0 && board[r][col].tile) { prefixStr = board[r][col].tile!.letter + prefixStr; r--; }
    r = row + 1;
    while (r < BOARD_SIZE && board[r][col].tile) { suffixStr += board[r][col].tile!.letter; r++; }
  } else {
    let c = col - 1;
    while (c >= 0 && board[row][c].tile) { prefixStr = board[row][c].tile!.letter + prefixStr; c--; }
    c = col + 1;
    while (c < BOARD_SIZE && board[row][c].tile) { suffixStr += board[row][c].tile!.letter; c++; }
  }
  if (!prefixStr && !suffixStr) return new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
  const valid = new Set<string>();
  for (const l of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (isWord(trie, prefixStr + l + suffixStr)) valid.add(l);
  }
  return valid;
}

function computeCrossChecks(board: BoardCell[][], trie: TrieNode): Map<string, Set<string>> {
  const checks = new Map<string, Set<string>>();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].tile) continue;
      checks.set(`h:${r},${c}`, getCrossCheckSet(board, trie, r, c, true));
      checks.set(`v:${r},${c}`, getCrossCheckSet(board, trie, r, c, false));
    }
  }
  return checks;
}

function findAnchors(board: BoardCell[][]): Set<string> {
  const anchors = new Set<string>();
  const hasAny = board.some(row => row.some(cell => cell.tile));
  if (!hasAny) { anchors.add("7,7"); return anchors; }
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].tile) continue;
      const nbrs = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
      if (nbrs.some(([nr,nc]) => nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE && board[nr][nc].tile)) {
        anchors.add(`${r},${c}`);
      }
    }
  }
  return anchors;
}

function scoreWord(positions: { row: number; col: number; letter: string; value: number; isNew: boolean }[]): number {
  let raw = 0, mult = 1;
  for (const p of positions) {
    let ls = p.value;
    if (p.isNew) {
      const b = getBonusType(p.row, p.col);
      if (b === "DL") ls *= 2; else if (b === "TL") ls *= 3;
      else if (b === "DW" || b === "CENTER") mult *= 2; else if (b === "TW") mult *= 3;
    }
    raw += ls;
  }
  return raw * mult;
}

function computeMoveScore(
  board: BoardCell[][],
  placedTiles: { row: number; col: number; letter: string; value: number }[],
  _trie: TrieNode
): { words: { word: string; score: number }[]; totalScore: number } | null {
  if (!placedTiles.length) return null;
  const tempBoard: (BoardCell & { placed?: { letter: string; value: number } })[][] =
    board.map(row => row.map(cell => ({ ...cell })));
  for (const pt of placedTiles) {
    tempBoard[pt.row][pt.col] = { ...tempBoard[pt.row][pt.col], placed: { letter: pt.letter, value: pt.value } };
  }
  const getTile = (r: number, c: number) => {
    const cell = tempBoard[r][c];
    if (cell.tile) return { letter: cell.tile.letter, value: cell.tile.value, isNew: false };
    if ((cell as { placed?: { letter: string; value: number } }).placed) {
      const p = (cell as { placed: { letter: string; value: number } }).placed;
      return { letter: p.letter, value: p.value, isNew: true };
    }
    return null;
  };
  const hasTile = (r: number, c: number) => getTile(r, c) !== null;
  const rows = new Set(placedTiles.map(t => t.row));
  const isHorizontal = rows.size === 1;

  const getWordAlong = (startR: number, startC: number, horizontal: boolean) => {
    let r = startR, c = startC;
    if (horizontal) { while (c > 0 && hasTile(r, c-1)) c--; }
    else { while (r > 0 && hasTile(r-1, c)) r--; }
    const positions: { row: number; col: number; letter: string; value: number; isNew: boolean }[] = [];
    let word = "";
    while (r < BOARD_SIZE && c < BOARD_SIZE && hasTile(r, c)) {
      const t = getTile(r, c)!; word += t.letter; positions.push({ row: r, col: c, ...t });
      if (horizontal) c++; else r++;
    }
    if (word.length < 2) return null;
    return { word, score: scoreWord(positions) };
  };

  const words: { word: string; score: number }[] = [];
  const main = getWordAlong(placedTiles[0].row, placedTiles[0].col, isHorizontal);
  if (main) words.push(main);
  for (const pt of placedTiles) {
    const cross = getWordAlong(pt.row, pt.col, !isHorizontal);
    if (cross) words.push(cross);
  }
  if (!words.length) return null;
  let total = words.reduce((s, w) => s + w.score, 0);
  if (placedTiles.length === 7) total += 50;
  return { words, totalScore: total };
}

function generateAllMoves(board: BoardCell[][], rack: Tile[], trie: TrieNode): GeneratedMove[] {
  const moves: GeneratedMove[] = [];
  const anchors = findAnchors(board);
  const crossChecks = computeCrossChecks(board, trie);
  const rackLetters: string[] = rack.map(t => t.isBlank ? "*" : t.letter);

  for (const dir of ["horizontal", "vertical"] as const) {
    for (const anchorStr of anchors) {
      const [aR, aC] = anchorStr.split(",").map(Number);
      let maxPrefix = 0;
      if (dir === "horizontal") {
        let c = aC - 1;
        while (c >= 0 && !board[aR][c].tile && !anchors.has(`${aR},${c}`)) { maxPrefix++; c--; }
      } else {
        let r = aR - 1;
        while (r >= 0 && !board[r][aC].tile && !anchors.has(`${r},${aC}`)) { maxPrefix++; r--; }
      }
      const existing = getExistingPrefix(board, aR, aC, dir);
      if (existing) {
        const node = getNode(trie, existing);
        if (node) extendRight(board, trie, crossChecks, rackLetters, rack, aR, aC, node, existing, [], dir, moves, true);
      } else {
        generateWithPrefix(board, trie, crossChecks, rackLetters, rack, aR, aC, maxPrefix, dir, moves);
      }
    }
  }

  const seen = new Set<string>();
  return moves.filter(m => {
    const key = m.tiles.map(t => `${t.row},${t.col}:${t.tile.letter}`).sort().join("|");
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}

function getExistingPrefix(board: BoardCell[][], aR: number, aC: number, dir: "horizontal"|"vertical"): string|null {
  let prefix = "";
  if (dir === "horizontal") {
    let c = aC - 1; while (c >= 0 && board[aR][c].tile) { prefix = board[aR][c].tile!.letter + prefix; c--; }
  } else {
    let r = aR - 1; while (r >= 0 && board[r][aC].tile) { prefix = board[r][aC].tile!.letter + prefix; r--; }
  }
  return prefix || null;
}

function generateWithPrefix(
  board: BoardCell[][], trie: TrieNode, cc: Map<string,Set<string>>,
  rackLetters: string[], rack: Tile[],
  aR: number, aC: number, maxPrefix: number,
  dir: "horizontal"|"vertical", moves: GeneratedMove[]
): void {
  extendRight(board, trie, cc, rackLetters, rack, aR, aC, trie, "", [], dir, moves, true);

  function buildPrefix(node: TrieNode, prefixTiles: { row:number;col:number;tile:Tile }[], remaining: string[], depth: number) {
    if (depth > maxPrefix) return;
    const pos = dir === "horizontal" ? { row: aR, col: aC - depth } : { row: aR - depth, col: aC };
    if (pos.row < 0 || pos.col < 0) return;

    for (const [letter, childNode] of node.children) {
      const ccKey = dir === "horizontal" ? `h:${pos.row},${pos.col}` : `v:${pos.row},${pos.col}`;
      const ccSet = cc.get(ccKey);
      if (ccSet && !ccSet.has(letter)) continue;

      const tryTile = (tile: Tile, asLetter: string, asValue: number) => {
        const newRemaining = [...remaining];
        const idx = newRemaining.indexOf(tile.isBlank ? "*" : tile.letter);
        if (idx < 0) return;
        newRemaining.splice(idx, 1);
        const placed: Tile = { ...tile, letter: asLetter, value: asValue };
        const newPT = [{ row: pos.row, col: pos.col, tile: placed }, ...prefixTiles];
        const currentPrefix = newPT.map(t => t.tile.letter).join("");
        extendRight(board, trie, cc, newRemaining, rack, aR, aC, childNode, currentPrefix, newPT, dir, moves, true);
        buildPrefix(childNode, newPT, newRemaining, depth + 1);
      };

      const usedIds = new Set(prefixTiles.map(t => t.tile.id));
      const reg = rack.find(t => !t.isBlank && t.letter === letter && !usedIds.has(t.id));
      if (reg) tryTile(reg, letter, reg.value);
      const blank = rack.find(t => t.isBlank && !usedIds.has(t.id));
      if (blank) tryTile(blank, letter, 0);
    }
  }
  buildPrefix(trie, [], rackLetters, 1);
}

function extendRight(
  board: BoardCell[][], trie: TrieNode, crossChecks: Map<string,Set<string>>,
  _rackLetters: string[], rack: Tile[],
  row: number, col: number, node: TrieNode, _wordSoFar: string,
  tilesPlaced: { row:number;col:number;tile:Tile }[],
  dir: "horizontal"|"vertical", moves: GeneratedMove[], isAnchor: boolean
): void {
  if (row >= BOARD_SIZE || col >= BOARD_SIZE) {
    if (node.isTerminal && tilesPlaced.length > 0) recordMove(board, trie, tilesPlaced, moves);
    return;
  }
  const cell = board[row][col];
  if (cell.tile) {
    const child = node.children.get(cell.tile.letter);
    if (child) {
      const nR = dir === "vertical" ? row+1 : row, nC = dir === "horizontal" ? col+1 : col;
      extendRight(board, trie, crossChecks, _rackLetters, rack, nR, nC, child, _wordSoFar + cell.tile.letter, tilesPlaced, dir, moves, false);
    }
    return;
  }
  if (node.isTerminal && tilesPlaced.length > 0 && !isAnchor) recordMove(board, trie, tilesPlaced, moves);

  const ccKey = dir === "horizontal" ? `h:${row},${col}` : `v:${row},${col}`;
  const ccSet = crossChecks.get(ccKey);
  const usedIds = new Set(tilesPlaced.map(t => t.tile.id));
  const nR = dir === "vertical" ? row+1 : row, nC = dir === "horizontal" ? col+1 : col;

  for (const [letter, childNode] of node.children) {
    if (ccSet && !ccSet.has(letter)) continue;
    const reg = rack.find(t => !t.isBlank && t.letter === letter && !usedIds.has(t.id));
    if (reg) {
      extendRight(board, trie, crossChecks, _rackLetters, rack, nR, nC, childNode, _wordSoFar + letter,
        [...tilesPlaced, { row, col, tile: reg }], dir, moves, false);
    }
    const blank = rack.find(t => t.isBlank && !usedIds.has(t.id));
    if (blank) {
      const assigned: Tile = { ...blank, letter, value: 0 };
      extendRight(board, trie, crossChecks, _rackLetters, rack, nR, nC, childNode, _wordSoFar + letter,
        [...tilesPlaced, { row, col, tile: assigned }], dir, moves, false);
    }
  }
}

function recordMove(board: BoardCell[][], trie: TrieNode, tilesPlaced: { row:number;col:number;tile:Tile }[], moves: GeneratedMove[]): void {
  const placed = tilesPlaced.map(t => ({ row: t.row, col: t.col, letter: t.tile.letter, value: t.tile.value }));
  const result = computeMoveScore(board, placed, trie);
  if (!result) return;
  for (const w of result.words) { if (!isWord(trie, w.word)) return; }
  moves.push({ tiles: tilesPlaced, words: result.words, totalScore: result.totalScore });
}

type Difficulty = "easy" | "medium" | "hard";

function selectMove(moves: GeneratedMove[], difficulty: Difficulty): GeneratedMove | null {
  if (!moves.length) return null;
  const sorted = [...moves].sort((a, b) => b.totalScore - a.totalScore);
  if (difficulty === "hard") return sorted[0];
  if (difficulty === "medium") {
    const top = Math.max(3, Math.ceil(sorted.length * 0.3));
    const cands = sorted.slice(0, top);
    const weights = cands.map((_, i) => top - i);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) return cands[i]; }
    return cands[0];
  }
  // easy
  const start = Math.max(0, Math.floor(sorted.length * 0.4));
  const cands = sorted.slice(start);
  return cands.length ? cands[Math.floor(Math.random() * cands.length)] : sorted[sorted.length - 1];
}

// ─── DICTIONARY CACHE ──────────────────────────────────────────────────────────
let wordList: string | null = null;

async function getWordList(): Promise<string> {
  if (wordList) return wordList;
  const res = await fetch("https://raw.githubusercontent.com/cviebrock/wordlists/master/TWL06.txt");
  wordList = await res.text();
  return wordList;
}

// ─── TYPES FOR MULTI-COMPUTER ──────────────────────────────────────────────────
interface ComputerPlayer {
  id: string;
  name: string;
  difficulty: Difficulty;
  rack: Tile[];
  score: number;
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
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
      .select("*")
      .eq("id", game_id)
      .single();
    if (gErr || !game) {
      return new Response(JSON.stringify({ error: "Game not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
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
    let cpuPlayer = computerPlayers.find(cp => cp.id === currentTurn);

    // Fallback for legacy single-computer games
    if (!cpuPlayer && currentTurn === "computer-player") {
      cpuPlayer = {
        id: "computer-player",
        name: `Computer (${game.computer_difficulty || "medium"})`,
        difficulty: (game.computer_difficulty || "medium") as Difficulty,
        rack: game.computer_rack as Tile[],
        score: game.computer_score as number,
      };
    }

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
    const selected = selectMove(moves, cpuPlayer.difficulty);

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
