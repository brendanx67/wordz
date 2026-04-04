import type { TrieNode } from './trie.ts'
import { getNode, isWord } from './trie.ts'
import type { BoardCell, Tile } from './gameConstants.ts'
import { BOARD_SIZE, getBonusType } from './gameConstants.ts'

export interface GeneratedMove {
  tiles: { row: number; col: number; tile: Tile }[]
  words: { word: string; score: number }[]
  totalScore: number
}

function getCrossCheckSet(
  board: BoardCell[][], trie: TrieNode,
  row: number, col: number, checkVertical: boolean
): Set<string> {
  let prefixStr = '', suffixStr = ''
  if (checkVertical) {
    let r = row - 1
    while (r >= 0 && board[r][col].tile) { prefixStr = board[r][col].tile!.letter + prefixStr; r-- }
    r = row + 1
    while (r < BOARD_SIZE && board[r][col].tile) { suffixStr += board[r][col].tile!.letter; r++ }
  } else {
    let c = col - 1
    while (c >= 0 && board[row][c].tile) { prefixStr = board[row][c].tile!.letter + prefixStr; c-- }
    c = col + 1
    while (c < BOARD_SIZE && board[row][c].tile) { suffixStr += board[row][c].tile!.letter; c++ }
  }
  if (!prefixStr && !suffixStr) return new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
  const valid = new Set<string>()
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (isWord(trie, prefixStr + l + suffixStr)) valid.add(l)
  }
  return valid
}

function computeCrossChecks(board: BoardCell[][], trie: TrieNode): Map<string, Set<string>> {
  const checks = new Map<string, Set<string>>()
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].tile) continue
      checks.set(`h:${r},${c}`, getCrossCheckSet(board, trie, r, c, true))
      checks.set(`v:${r},${c}`, getCrossCheckSet(board, trie, r, c, false))
    }
  }
  return checks
}

function findAnchors(board: BoardCell[][]): Set<string> {
  const anchors = new Set<string>()
  const hasAny = board.some(row => row.some(cell => cell.tile))
  if (!hasAny) { anchors.add('7,7'); return anchors }
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].tile) continue
      const nbrs = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]
      if (nbrs.some(([nr,nc]) => nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE && board[nr][nc].tile)) {
        anchors.add(`${r},${c}`)
      }
    }
  }
  return anchors
}

function scoreWord(positions: { row: number; col: number; letter: string; value: number; isNew: boolean }[]): number {
  let raw = 0, mult = 1
  for (const p of positions) {
    let ls = p.value
    if (p.isNew) {
      const b = getBonusType(p.row, p.col)
      if (b === 'DL') ls *= 2; else if (b === 'TL') ls *= 3
      else if (b === 'DW' || b === 'CENTER') mult *= 2; else if (b === 'TW') mult *= 3
    }
    raw += ls
  }
  return raw * mult
}

function computeMoveScore(
  board: BoardCell[][],
  placedTiles: { row: number; col: number; letter: string; value: number }[],
  _trie: TrieNode
): { words: { word: string; score: number }[]; totalScore: number } | null {
  if (!placedTiles.length) return null
  const tempBoard: (BoardCell & { placed?: { letter: string; value: number } })[][] =
    board.map(row => row.map(cell => ({ ...cell })))
  for (const pt of placedTiles) {
    tempBoard[pt.row][pt.col] = { ...tempBoard[pt.row][pt.col], placed: { letter: pt.letter, value: pt.value } }
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
  const rows = new Set(placedTiles.map(t => t.row))
  const isHorizontal = rows.size === 1

  const getWordAlong = (startR: number, startC: number, horizontal: boolean) => {
    let r = startR, c = startC
    if (horizontal) { while (c > 0 && hasTile(r, c-1)) c-- }
    else { while (r > 0 && hasTile(r-1, c)) r-- }
    const positions: { row: number; col: number; letter: string; value: number; isNew: boolean }[] = []
    let word = ''
    while (r < BOARD_SIZE && c < BOARD_SIZE && hasTile(r, c)) {
      const t = getTile(r, c)!; word += t.letter; positions.push({ row: r, col: c, ...t })
      if (horizontal) c++; else r++
    }
    if (word.length < 2) return null
    return { word, score: scoreWord(positions) }
  }

  const words: { word: string; score: number }[] = []
  const main = getWordAlong(placedTiles[0].row, placedTiles[0].col, isHorizontal)
  if (main) words.push(main)
  for (const pt of placedTiles) {
    const cross = getWordAlong(pt.row, pt.col, !isHorizontal)
    if (cross) words.push(cross)
  }
  if (!words.length) return null
  let total = words.reduce((s, w) => s + w.score, 0)
  if (placedTiles.length === 7) total += 50
  return { words, totalScore: total }
}

export function generateAllMoves(board: BoardCell[][], rack: Tile[], trie: TrieNode): GeneratedMove[] {
  const moves: GeneratedMove[] = []
  const anchors = findAnchors(board)
  const crossChecks = computeCrossChecks(board, trie)
  const rackLetters: string[] = rack.map(t => t.isBlank ? '*' : t.letter)

  for (const dir of ['horizontal', 'vertical'] as const) {
    for (const anchorStr of anchors) {
      const [aR, aC] = anchorStr.split(',').map(Number)
      let maxPrefix = 0
      if (dir === 'horizontal') {
        let c = aC - 1
        while (c >= 0 && !board[aR][c].tile && !anchors.has(`${aR},${c}`)) { maxPrefix++; c-- }
      } else {
        let r = aR - 1
        while (r >= 0 && !board[r][aC].tile && !anchors.has(`${r},${aC}`)) { maxPrefix++; r-- }
      }
      const existing = getExistingPrefix(board, aR, aC, dir)
      if (existing) {
        const node = getNode(trie, existing)
        if (node) extendRight(board, trie, crossChecks, rackLetters, rack, aR, aC, node, existing, [], dir, moves, true)
      } else {
        generateWithPrefix(board, trie, crossChecks, rackLetters, rack, aR, aC, maxPrefix, dir, moves)
      }
    }
  }

  const seen = new Set<string>()
  return moves.filter(m => {
    const key = m.tiles.map(t => `${t.row},${t.col}:${t.tile.letter}`).sort().join('|')
    if (seen.has(key)) return false; seen.add(key); return true
  })
}

function getExistingPrefix(board: BoardCell[][], aR: number, aC: number, dir: 'horizontal'|'vertical'): string|null {
  let prefix = ''
  if (dir === 'horizontal') {
    let c = aC - 1; while (c >= 0 && board[aR][c].tile) { prefix = board[aR][c].tile!.letter + prefix; c-- }
  } else {
    let r = aR - 1; while (r >= 0 && board[r][aC].tile) { prefix = board[r][aC].tile!.letter + prefix; r-- }
  }
  return prefix || null
}

function generateWithPrefix(
  board: BoardCell[][], trie: TrieNode, cc: Map<string,Set<string>>,
  rackLetters: string[], rack: Tile[],
  aR: number, aC: number, maxPrefix: number,
  dir: 'horizontal'|'vertical', moves: GeneratedMove[]
): void {
  extendRight(board, trie, cc, rackLetters, rack, aR, aC, trie, '', [], dir, moves, true)

  function buildPrefix(node: TrieNode, prefixTiles: { row:number;col:number;tile:Tile }[], remaining: string[], depth: number) {
    if (depth > maxPrefix) return
    const pos = dir === 'horizontal' ? { row: aR, col: aC - depth } : { row: aR - depth, col: aC }
    if (pos.row < 0 || pos.col < 0) return

    for (const [letter, childNode] of node.children) {
      const ccKey = dir === 'horizontal' ? `h:${pos.row},${pos.col}` : `v:${pos.row},${pos.col}`
      const ccSet = cc.get(ccKey)
      if (ccSet && !ccSet.has(letter)) continue

      const tryTile = (tile: Tile, asLetter: string, asValue: number) => {
        const newRemaining = [...remaining]
        const idx = newRemaining.indexOf(tile.isBlank ? '*' : tile.letter)
        if (idx < 0) return
        newRemaining.splice(idx, 1)
        const placed: Tile = { ...tile, letter: asLetter, value: asValue }
        const newPT = [{ row: pos.row, col: pos.col, tile: placed }, ...prefixTiles]
        const currentPrefix = newPT.map(t => t.tile.letter).join('')
        extendRight(board, trie, cc, newRemaining, rack, aR, aC, childNode, currentPrefix, newPT, dir, moves, true)
        buildPrefix(childNode, newPT, newRemaining, depth + 1)
      }

      const usedIds = new Set(prefixTiles.map(t => t.tile.id))
      const reg = rack.find(t => !t.isBlank && t.letter === letter && !usedIds.has(t.id))
      if (reg) tryTile(reg, letter, reg.value)
      const blank = rack.find(t => t.isBlank && !usedIds.has(t.id))
      if (blank) tryTile(blank, letter, 0)
    }
  }
  buildPrefix(trie, [], rackLetters, 1)
}

function extendRight(
  board: BoardCell[][], trie: TrieNode, crossChecks: Map<string,Set<string>>,
  _rackLetters: string[], rack: Tile[],
  row: number, col: number, node: TrieNode, _wordSoFar: string,
  tilesPlaced: { row:number;col:number;tile:Tile }[],
  dir: 'horizontal'|'vertical', moves: GeneratedMove[], isAnchor: boolean
): void {
  if (row >= BOARD_SIZE || col >= BOARD_SIZE) {
    if (node.isTerminal && tilesPlaced.length > 0) recordMove(board, trie, tilesPlaced, moves)
    return
  }
  const cell = board[row][col]
  if (cell.tile) {
    const child = node.children.get(cell.tile.letter)
    if (child) {
      const nR = dir === 'vertical' ? row+1 : row, nC = dir === 'horizontal' ? col+1 : col
      extendRight(board, trie, crossChecks, _rackLetters, rack, nR, nC, child, _wordSoFar + cell.tile.letter, tilesPlaced, dir, moves, false)
    }
    return
  }
  if (node.isTerminal && tilesPlaced.length > 0 && !isAnchor) recordMove(board, trie, tilesPlaced, moves)

  const ccKey = dir === 'horizontal' ? `h:${row},${col}` : `v:${row},${col}`
  const ccSet = crossChecks.get(ccKey)
  const usedIds = new Set(tilesPlaced.map(t => t.tile.id))
  const nR = dir === 'vertical' ? row+1 : row, nC = dir === 'horizontal' ? col+1 : col

  for (const [letter, childNode] of node.children) {
    if (ccSet && !ccSet.has(letter)) continue
    const reg = rack.find(t => !t.isBlank && t.letter === letter && !usedIds.has(t.id))
    if (reg) {
      extendRight(board, trie, crossChecks, _rackLetters, rack, nR, nC, childNode, _wordSoFar + letter,
        [...tilesPlaced, { row, col, tile: reg }], dir, moves, false)
    }
    const blank = rack.find(t => t.isBlank && !usedIds.has(t.id))
    if (blank) {
      const assigned: Tile = { ...blank, letter, value: 0 }
      extendRight(board, trie, crossChecks, _rackLetters, rack, nR, nC, childNode, _wordSoFar + letter,
        [...tilesPlaced, { row, col, tile: assigned }], dir, moves, false)
    }
  }
}

function recordMove(board: BoardCell[][], trie: TrieNode, tilesPlaced: { row:number;col:number;tile:Tile }[], moves: GeneratedMove[]): void {
  const placed = tilesPlaced.map(t => ({ row: t.row, col: t.col, letter: t.tile.letter, value: t.tile.value }))
  const result = computeMoveScore(board, placed, trie)
  if (!result) return
  for (const w of result.words) { if (!isWord(trie, w.word)) return }
  moves.push({ tiles: tilesPlaced, words: result.words, totalScore: result.totalScore })
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export function selectMove(moves: GeneratedMove[], difficulty: Difficulty): GeneratedMove | null {
  if (!moves.length) return null
  const sorted = [...moves].sort((a, b) => b.totalScore - a.totalScore)
  if (difficulty === 'hard') return sorted[0]
  if (difficulty === 'medium') {
    const top = Math.max(3, Math.ceil(sorted.length * 0.3))
    const cands = sorted.slice(0, top)
    const weights = cands.map((_, i) => top - i)
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) return cands[i] }
    return cands[0]
  }
  // easy
  const start = Math.max(0, Math.floor(sorted.length * 0.4))
  const cands = sorted.slice(start)
  return cands.length ? cands[Math.floor(Math.random() * cands.length)] : sorted[sorted.length - 1]
}
