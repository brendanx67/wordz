import type { Tile, BoardCell } from "../_shared/gameConstants.ts";
import {
  BOARD_SIZE,
  TILE_VALUES,
  getBonusType,
} from "../_shared/gameConstants.ts";
import type { GeneratedMove } from "../_shared/moveGenerator.ts";
import { generateAllMoves } from "../_shared/moveGenerator.ts";
import {
  authenticateUser,
  formatMoveResult,
  getServiceClient,
  getTrie,
  jsonError,
  jsonOk,
  normalizeTile,
} from "../api-helpers.ts";

// Standalone board analysis endpoint for Analysis Mode (issue #13).
// Accepts a board state and rack directly — no game ID needed.
// Authenticated via Supabase session JWT or API key.
//
// Two input formats:
//   1. Full format (frontend):  { board: BoardCell[][], rack: Tile[] }
//   2. Simple format (MCP):     { tiles: [{cell, letter, is_blank?}], rack_letters: "AEIOU??" }

function buildBoardFromTiles(
  tiles: { cell?: string; row?: number; col?: number; letter: string; is_blank?: boolean }[]
): BoardCell[][] {
  const board: BoardCell[][] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    board.push([])
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[r].push({ tile: null, bonus: getBonusType(r, c), isNew: false })
    }
  }
  let idCounter = 0
  for (const t of tiles) {
    const { row, col, letter, is_blank } = normalizeTile(t)
    board[row][col] = {
      ...board[row][col],
      tile: {
        letter: letter.toUpperCase(),
        value: is_blank ? 0 : (TILE_VALUES[letter.toUpperCase()] ?? 0),
        isBlank: is_blank,
        id: `analyze-${idCounter++}`,
      },
    }
  }
  return board
}

function buildRackFromLetters(rackLetters: string): Tile[] {
  const rack: Tile[] = []
  let idCounter = 0
  for (const ch of rackLetters) {
    if (ch === "?" || ch === "_") {
      rack.push({ letter: "", value: 0, isBlank: true, id: `rack-${idCounter++}` })
    } else {
      const upper = ch.toUpperCase()
      rack.push({
        letter: upper,
        value: TILE_VALUES[upper] ?? 0,
        isBlank: false,
        id: `rack-${idCounter++}`,
      })
    }
  }
  return rack
}

export async function handleAnalyzeBoard(req: Request): Promise<Response> {
  // Authenticate via API key or JWT
  let authenticated = false

  const apiKeyAuth = await authenticateUser(req)
  if (apiKeyAuth) authenticated = true

  if (!authenticated) {
    const authHeader = req.headers.get("authorization")
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length)
      const supabase = getServiceClient()
      const { data: userData, error: userErr } = await supabase.auth.getUser(token)
      if (!userErr && userData.user) authenticated = true
    }
  }

  if (!authenticated) {
    return jsonError("Not authenticated", 401)
  }

  const body = await req.json()

  // Determine input format
  let board: BoardCell[][]
  let rack: Tile[]

  if (body.tiles && body.rack_letters) {
    // Simple format (MCP): tiles array + rack string
    try {
      board = buildBoardFromTiles(body.tiles)
    } catch (err) {
      return jsonError(`Invalid tile: ${(err as Error).message}`, 400)
    }
    rack = buildRackFromLetters(body.rack_letters)
    if (rack.length === 0 || rack.length > 7) {
      return jsonError("rack_letters must have 1-7 tiles", 400)
    }
  } else if (body.board && body.rack) {
    // Full format (frontend): board grid + rack tiles
    board = body.board as BoardCell[][]
    rack = body.rack as Tile[]
    if (!Array.isArray(board) || board.length !== 15) {
      return jsonError("board must be a 15x15 grid", 400)
    }
    if (!Array.isArray(rack) || rack.length === 0 || rack.length > 7) {
      return jsonError("rack must have 1-7 tiles", 400)
    }
  } else {
    return jsonError("Provide either {board, rack} or {tiles, rack_letters}", 400)
  }

  const { sort_by, limit: maxResults, filter } = body as {
    sort_by?: "score" | "length" | "tiles_used"
    limit?: number
    filter?: {
      contains_letter?: string
      min_length?: number
      max_length?: number
      uses_blank?: boolean
      min_score?: number
      touches_cell?: string
    }
  }

  const trie = await getTrie()
  let allMoves = generateAllMoves(board, rack, trie)

  // Apply filters (same as find-words)
  if (filter) {
    if (filter.contains_letter) {
      const fl = filter.contains_letter.toUpperCase()
      allMoves = allMoves.filter((m: GeneratedMove) =>
        m.tiles.some((t) => t.tile.letter === fl)
      )
    }
    if (filter.min_length) {
      const ml = filter.min_length
      allMoves = allMoves.filter(
        (m: GeneratedMove) => (m.words[0]?.word.length ?? 0) >= ml
      )
    }
    if (filter.max_length) {
      const ml = filter.max_length
      allMoves = allMoves.filter(
        (m: GeneratedMove) => (m.words[0]?.word.length ?? 0) <= ml
      )
    }
    if (filter.uses_blank !== undefined) {
      allMoves = allMoves.filter(
        (m: GeneratedMove) =>
          m.tiles.some((t) => t.tile.isBlank) === filter.uses_blank
      )
    }
    if (filter.min_score) {
      const ms = filter.min_score
      allMoves = allMoves.filter((m: GeneratedMove) => m.totalScore >= ms)
    }
    if (filter.touches_cell) {
      const match = filter.touches_cell
        .toUpperCase()
        .match(/^([A-O])(\d{1,2})$/)
      if (match) {
        const tc = match[1].charCodeAt(0) - 65
        const tr = parseInt(match[2]) - 1
        allMoves = allMoves.filter((m: GeneratedMove) =>
          m.tiles.some((t) => t.row === tr && t.col === tc)
        )
      }
    }
  }

  const filteredCount = allMoves.length

  const sortKey = sort_by || "score"
  const sorted = [...allMoves]
  if (sortKey === "score") {
    sorted.sort(
      (a: GeneratedMove, b: GeneratedMove) => b.totalScore - a.totalScore
    )
  } else if (sortKey === "length") {
    sorted.sort((a: GeneratedMove, b: GeneratedMove) => {
      const aLen = a.words[0]?.word.length ?? 0
      const bLen = b.words[0]?.word.length ?? 0
      return bLen - aLen || b.totalScore - a.totalScore
    })
  } else if (sortKey === "tiles_used") {
    sorted.sort(
      (a: GeneratedMove, b: GeneratedMove) =>
        b.tiles.length - a.tiles.length || b.totalScore - a.totalScore
    )
  }

  const cap = Math.min(maxResults || 20, 50)
  const results = sorted.slice(0, cap)
  const formatted = results.map((m: GeneratedMove) =>
    formatMoveResult(m, rack)
  )

  return jsonOk({
    total_moves_found: filteredCount,
    showing: formatted.length,
    sort_by: sortKey,
    moves: formatted,
  })
}
