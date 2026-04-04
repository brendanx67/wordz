// Move generator using Appel & Jacobsen anchor-based algorithm
// with cross-check sets for constraint propagation

import type { TrieNode } from './trie'
import { getNode, isWord } from './trie'
import type { BoardCell, Tile } from './gameConstants'
import { BOARD_SIZE, getBonusType } from './gameConstants'

export interface GeneratedMove {
  tiles: { row: number; col: number; tile: Tile }[]
  words: { word: string; score: number }[]
  totalScore: number
}

// Cross-check: which letters are legal at a given empty square
// considering already-placed perpendicular tiles
function computeCrossChecks(
  board: BoardCell[][],
  trie: TrieNode
): Map<string, Set<string>> {
  const checks = new Map<string, Set<string>>()

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].tile) continue

      // Check vertical cross-word constraints (for horizontal plays)
      const hSet = getCrossCheckSet(board, trie, r, c, true)
      checks.set(`h:${r},${c}`, hSet)

      // Check horizontal cross-word constraints (for vertical plays)
      const vSet = getCrossCheckSet(board, trie, r, c, false)
      checks.set(`v:${r},${c}`, vSet)
    }
  }

  return checks
}

function getCrossCheckSet(
  board: BoardCell[][],
  trie: TrieNode,
  row: number,
  col: number,
  checkVertical: boolean
): Set<string> {
  // Find letters above/below (if checkVertical) or left/right (if !checkVertical)
  let prefixStr = ''
  let suffixStr = ''

  if (checkVertical) {
    // Look up
    let r = row - 1
    while (r >= 0 && board[r][col].tile) {
      prefixStr = board[r][col].tile!.letter + prefixStr
      r--
    }
    // Look down
    r = row + 1
    while (r < BOARD_SIZE && board[r][col].tile) {
      suffixStr += board[r][col].tile!.letter
      r++
    }
  } else {
    // Look left
    let c = col - 1
    while (c >= 0 && board[row][c].tile) {
      prefixStr = board[row][c].tile!.letter + prefixStr
      c--
    }
    // Look right
    c = col + 1
    while (c < BOARD_SIZE && board[row][c].tile) {
      suffixStr += board[row][c].tile!.letter
      c++
    }
  }

  // If no adjacent tiles in the perpendicular direction, all letters are valid
  if (prefixStr === '' && suffixStr === '') {
    return new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
  }

  // Find which letters form valid words: prefix + letter + suffix
  const validLetters = new Set<string>()
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const candidate = prefixStr + letter + suffixStr
    if (isWord(trie, candidate)) {
      validLetters.add(letter)
    }
  }

  return validLetters
}

// Find anchor squares: empty squares adjacent to at least one filled square
function findAnchors(board: BoardCell[][]): Set<string> {
  const anchors = new Set<string>()

  // Special case: if the board is empty, the center is the only anchor
  const hasAnyTile = board.some(row => row.some(cell => cell.tile))
  if (!hasAnyTile) {
    anchors.add('7,7')
    return anchors
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].tile) continue
      const neighbors = [
        [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
      ]
      if (neighbors.some(([nr, nc]) =>
        nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc].tile
      )) {
        anchors.add(`${r},${c}`)
      }
    }
  }

  return anchors
}

// Score a word given the tiles and their positions
function scoreWord(
  positions: { row: number; col: number; letter: string; value: number; isNew: boolean }[]
): number {
  let rawScore = 0
  let wordMultiplier = 1

  for (const pos of positions) {
    let letterScore = pos.value
    if (pos.isNew) {
      const bonus = getBonusType(pos.row, pos.col)
      switch (bonus) {
        case 'DL': letterScore *= 2; break
        case 'TL': letterScore *= 3; break
        case 'DW': case 'CENTER': wordMultiplier *= 2; break
        case 'TW': wordMultiplier *= 3; break
      }
    }
    rawScore += letterScore
  }

  return rawScore * wordMultiplier
}

// Compute score for a complete move
function computeMoveScore(
  board: BoardCell[][],
  placedTiles: { row: number; col: number; letter: string; value: number }[],
  _trie: TrieNode
): { words: { word: string; score: number }[]; totalScore: number } | null {
  if (placedTiles.length === 0) return null

  // Build temporary board
  const tempBoard: (BoardCell & { placed?: { letter: string; value: number } })[][] =
    board.map(row => row.map(cell => ({ ...cell })))
  for (const pt of placedTiles) {
    tempBoard[pt.row][pt.col] = {
      ...tempBoard[pt.row][pt.col],
      placed: { letter: pt.letter, value: pt.value },
    }
  }

  const getTile = (r: number, c: number) => {
    const cell = tempBoard[r][c]
    if (cell.tile) return { letter: cell.tile.letter, value: cell.tile.value, isNew: false }
    if ((cell as { placed?: { letter: string; value: number } }).placed) {
      const p = (cell as { placed: { letter: string; value: number } }).placed
      return { letter: p.letter, value: p.value, isNew: true }
    }
    return null
  }

  const hasTile = (r: number, c: number) => getTile(r, c) !== null

  // Determine direction
  const rows = new Set(placedTiles.map(t => t.row))
  const isHorizontal = rows.size === 1

  const words: { word: string; score: number }[] = []

  // Get main word
  const getWordAlong = (startR: number, startC: number, horizontal: boolean) => {
    let r = startR, c = startC
    // Find start
    if (horizontal) {
      while (c > 0 && hasTile(r, c - 1)) c--
    } else {
      while (r > 0 && hasTile(r - 1, c)) r--
    }

    const positions: { row: number; col: number; letter: string; value: number; isNew: boolean }[] = []
    let word = ''
    while (r < BOARD_SIZE && c < BOARD_SIZE && hasTile(r, c)) {
      const t = getTile(r, c)!
      word += t.letter
      positions.push({ row: r, col: c, ...t })
      if (horizontal) c++
      else r++
    }

    if (word.length < 2) return null
    return { word, score: scoreWord(positions), positions }
  }

  // Main word
  const mainWord = getWordAlong(placedTiles[0].row, placedTiles[0].col, isHorizontal)
  if (mainWord) {
    words.push({ word: mainWord.word, score: mainWord.score })
  }

  // Cross words
  for (const pt of placedTiles) {
    const crossWord = getWordAlong(pt.row, pt.col, !isHorizontal)
    if (crossWord) {
      words.push({ word: crossWord.word, score: crossWord.score })
    }
  }

  if (words.length === 0) return null

  let totalScore = words.reduce((sum, w) => sum + w.score, 0)
  if (placedTiles.length === 7) totalScore += 50 // bingo bonus

  return { words, totalScore }
}

export function generateAllMoves(
  board: BoardCell[][],
  rack: Tile[],
  trie: TrieNode
): GeneratedMove[] {
  const moves: GeneratedMove[] = []
  const anchors = findAnchors(board)
  const crossChecks = computeCrossChecks(board, trie)

  // Count available letters in rack (including blanks)
  const rackLetters: string[] = rack.map(t => t.isBlank ? '*' : t.letter)

  // Generate moves in both directions
  for (const direction of ['horizontal', 'vertical'] as const) {
    for (const anchorStr of anchors) {
      const [anchorRow, anchorCol] = anchorStr.split(',').map(Number)

      // Determine how far left/up we can extend from the anchor
      let maxPrefix = 0
      if (direction === 'horizontal') {
        let c = anchorCol - 1
        while (c >= 0 && !board[anchorRow][c].tile && !anchors.has(`${anchorRow},${c}`)) {
          maxPrefix++
          c--
        }
        // If there are already tiles to the left, compute the existing prefix
        const existingPrefix = getExistingPrefix(board, anchorRow, anchorCol, direction)
        if (existingPrefix) {
          // Extend right from the anchor with the existing prefix
          const prefixNode = getNode(trie, existingPrefix)
          if (prefixNode) {
            extendRight(
              board, trie, crossChecks, rackLetters, rack,
              anchorRow, anchorCol, prefixNode, existingPrefix,
              [], direction, moves, true
            )
          }
        } else {
          // Try placing prefix tiles to the left, then extending right
          generateWithPrefix(
            board, trie, crossChecks, rackLetters, rack,
            anchorRow, anchorCol, maxPrefix, direction, moves
          )
        }
      } else {
        let r = anchorRow - 1
        while (r >= 0 && !board[r][anchorCol].tile && !anchors.has(`${r},${anchorCol}`)) {
          maxPrefix++
          r--
        }
        const existingPrefix = getExistingPrefix(board, anchorRow, anchorCol, direction)
        if (existingPrefix) {
          const prefixNode = getNode(trie, existingPrefix)
          if (prefixNode) {
            extendRight(
              board, trie, crossChecks, rackLetters, rack,
              anchorRow, anchorCol, prefixNode, existingPrefix,
              [], direction, moves, true
            )
          }
        } else {
          generateWithPrefix(
            board, trie, crossChecks, rackLetters, rack,
            anchorRow, anchorCol, maxPrefix, direction, moves
          )
        }
      }
    }
  }

  // Deduplicate moves (same tiles at same positions)
  const seen = new Set<string>()
  return moves.filter(m => {
    const key = m.tiles.map(t => `${t.row},${t.col}:${t.tile.letter}`).sort().join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getExistingPrefix(
  board: BoardCell[][],
  anchorRow: number,
  anchorCol: number,
  direction: 'horizontal' | 'vertical'
): string | null {
  let prefix = ''
  if (direction === 'horizontal') {
    let c = anchorCol - 1
    while (c >= 0 && board[anchorRow][c].tile) {
      prefix = board[anchorRow][c].tile!.letter + prefix
      c--
    }
  } else {
    let r = anchorRow - 1
    while (r >= 0 && board[r][anchorCol].tile) {
      prefix = board[r][anchorCol].tile!.letter + prefix
      r--
    }
  }
  return prefix.length > 0 ? prefix : null
}

function generateWithPrefix(
  board: BoardCell[][],
  trie: TrieNode,
  crossChecks: Map<string, Set<string>>,
  rackLetters: string[],
  rack: Tile[],
  anchorRow: number,
  anchorCol: number,
  maxPrefix: number,
  direction: 'horizontal' | 'vertical',
  moves: GeneratedMove[]
): void {
  // Start with no prefix (place directly at anchor)
  extendRight(
    board, trie, crossChecks, rackLetters, rack,
    anchorRow, anchorCol, trie, '',
    [], direction, moves, true
  )

  // Try prefixes of length 1..maxPrefix
  function buildPrefix(
    node: TrieNode,
    prefixTiles: { row: number; col: number; tile: Tile }[],
    remaining: string[],
    depth: number
  ) {
    if (depth > maxPrefix) return

    const prefixPos = direction === 'horizontal'
      ? { row: anchorRow, col: anchorCol - depth }
      : { row: anchorRow - depth, col: anchorCol }

    if (prefixPos.row < 0 || prefixPos.col < 0) return

    for (const [letter, childNode] of node.children) {
      // Check cross-checks at prefix position
      const ccKey = direction === 'horizontal'
        ? `h:${prefixPos.row},${prefixPos.col}`
        : `v:${prefixPos.row},${prefixPos.col}`
      const cc = crossChecks.get(ccKey)
      if (cc && !cc.has(letter)) continue

      // Try to use a tile from rack
      const blankIdx = remaining.indexOf('*')
      const letterIdx = remaining.indexOf(letter)

      if (letterIdx >= 0) {
        const newRemaining = [...remaining]
        newRemaining.splice(letterIdx, 1)
        const usedTile = rack.find((t, i) =>
          !t.isBlank && t.letter === letter &&
          !prefixTiles.some(pt => pt.tile.id === t.id) &&
          remaining.filter((r, ri) => ri < letterIdx && r === letter).length <=
            rack.filter((rt, rti) => rti < i && !rt.isBlank && rt.letter === letter).length
        )
        if (usedTile) {
          const newPrefixTiles = [
            { row: prefixPos.row, col: prefixPos.col, tile: usedTile },
            ...prefixTiles,
          ]
          const currentPrefix = newPrefixTiles.map(t => t.tile.letter).join('')

          // Try extending right from anchor with this prefix
          extendRight(
            board, trie, crossChecks, newRemaining, rack,
            anchorRow, anchorCol, childNode, currentPrefix,
            newPrefixTiles, direction, moves, true
          )

          // Try longer prefix
          buildPrefix(childNode, newPrefixTiles, newRemaining, depth + 1)
        }
      }

      if (blankIdx >= 0) {
        const newRemaining = [...remaining]
        newRemaining.splice(blankIdx, 1)
        const blankTile = rack.find(t =>
          t.isBlank && !prefixTiles.some(pt => pt.tile.id === t.id)
        )
        if (blankTile) {
          const assignedBlank: Tile = { ...blankTile, letter, value: 0 }
          const newPrefixTiles = [
            { row: prefixPos.row, col: prefixPos.col, tile: assignedBlank },
            ...prefixTiles,
          ]
          const currentPrefix = newPrefixTiles.map(t => t.tile.letter).join('')

          extendRight(
            board, trie, crossChecks, newRemaining, rack,
            anchorRow, anchorCol, childNode, currentPrefix,
            newPrefixTiles, direction, moves, true
          )

          buildPrefix(childNode, newPrefixTiles, newRemaining, depth + 1)
        }
      }
    }
  }

  buildPrefix(trie, [], rackLetters, 1)
}

function extendRight(
  board: BoardCell[][],
  trie: TrieNode,
  crossChecks: Map<string, Set<string>>,
  rackLetters: string[],
  rack: Tile[],
  row: number,
  col: number,
  node: TrieNode,
  wordSoFar: string,
  tilesPlaced: { row: number; col: number; tile: Tile }[],
  direction: 'horizontal' | 'vertical',
  moves: GeneratedMove[],
  isAnchor: boolean
): void {
  if (row >= BOARD_SIZE || col >= BOARD_SIZE) {
    // Off the board — check if we have a valid word
    if (node.isTerminal && tilesPlaced.length > 0) {
      recordMove(board, trie, tilesPlaced, moves)
    }
    return
  }

  const cell = board[row][col]

  if (cell.tile) {
    // Square already has a tile — follow it in the trie
    const letter = cell.tile.letter
    const childNode = node.children.get(letter)
    if (childNode) {
      const nextRow = direction === 'vertical' ? row + 1 : row
      const nextCol = direction === 'horizontal' ? col + 1 : col
      extendRight(
        board, trie, crossChecks, rackLetters, rack,
        nextRow, nextCol, childNode, wordSoFar + letter,
        tilesPlaced, direction, moves, false
      )
    }
  } else {
    // Empty square — try placing a tile from rack
    if (node.isTerminal && tilesPlaced.length > 0 && !isAnchor) {
      recordMove(board, trie, tilesPlaced, moves)
    }

    const ccKey = direction === 'horizontal'
      ? `h:${row},${col}`
      : `v:${row},${col}`
    const cc = crossChecks.get(ccKey)

    const usedIds = new Set(tilesPlaced.map(t => t.tile.id))

    for (const [letter, childNode] of node.children) {
      if (cc && !cc.has(letter)) continue

      // Try regular tile
      const regularTile = rack.find(t => !t.isBlank && t.letter === letter && !usedIds.has(t.id))
      if (regularTile) {
        const newRemaining = [...rackLetters]
        const idx = newRemaining.indexOf(letter)
        if (idx >= 0) newRemaining.splice(idx, 1)

        const nextRow = direction === 'vertical' ? row + 1 : row
        const nextCol = direction === 'horizontal' ? col + 1 : col
        extendRight(
          board, trie, crossChecks, newRemaining, rack,
          nextRow, nextCol, childNode, wordSoFar + letter,
          [...tilesPlaced, { row, col, tile: regularTile }],
          direction, moves, false
        )
      }

      // Try blank tile
      const blankTile = rack.find(t => t.isBlank && !usedIds.has(t.id))
      if (blankTile) {
        const newRemaining = [...rackLetters]
        const idx = newRemaining.indexOf('*')
        if (idx >= 0) newRemaining.splice(idx, 1)

        const assignedBlank: Tile = { ...blankTile, letter, value: 0 }
        const nextRow = direction === 'vertical' ? row + 1 : row
        const nextCol = direction === 'horizontal' ? col + 1 : col
        extendRight(
          board, trie, crossChecks, newRemaining, rack,
          nextRow, nextCol, childNode, wordSoFar + letter,
          [...tilesPlaced, { row, col, tile: assignedBlank }],
          direction, moves, false
        )
      }
    }
  }
}

function recordMove(
  board: BoardCell[][],
  trie: TrieNode,
  tilesPlaced: { row: number; col: number; tile: Tile }[],
  moves: GeneratedMove[]
): void {
  const placedForScoring = tilesPlaced.map(t => ({
    row: t.row, col: t.col,
    letter: t.tile.letter,
    value: t.tile.value,
  }))

  const result = computeMoveScore(board, placedForScoring, trie)
  if (!result) return

  // Verify all formed words are in the dictionary
  for (const w of result.words) {
    if (!isWord(trie, w.word)) return
  }

  moves.push({
    tiles: tilesPlaced,
    words: result.words,
    totalScore: result.totalScore,
  })
}

// Difficulty-based move selection
export type Difficulty = 'easy' | 'medium' | 'hard'

export function selectMove(
  moves: GeneratedMove[],
  difficulty: Difficulty
): GeneratedMove | null {
  if (moves.length === 0) return null

  // Sort by score descending
  const sorted = [...moves].sort((a, b) => b.totalScore - a.totalScore)

  switch (difficulty) {
    case 'hard':
      // Always play the best move
      return sorted[0]

    case 'medium': {
      // Pick from the top 30% of moves, weighted toward better ones
      const topCount = Math.max(3, Math.ceil(sorted.length * 0.3))
      const candidates = sorted.slice(0, topCount)
      // Weight: best move gets highest weight
      const weights = candidates.map((_, i) => topCount - i)
      const totalWeight = weights.reduce((a, b) => a + b, 0)
      let r = Math.random() * totalWeight
      for (let i = 0; i < candidates.length; i++) {
        r -= weights[i]
        if (r <= 0) return candidates[i]
      }
      return candidates[0]
    }

    case 'easy': {
      // Pick from the bottom 60% of moves (prefer weaker plays)
      const startIdx = Math.max(0, Math.floor(sorted.length * 0.4))
      const candidates = sorted.slice(startIdx)
      if (candidates.length === 0) return sorted[sorted.length - 1]
      return candidates[Math.floor(Math.random() * candidates.length)]
    }

    default:
      return sorted[0]
  }
}
