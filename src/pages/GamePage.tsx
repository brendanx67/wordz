import { useState, useCallback, useEffect, useMemo, useLayoutEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useGame, useStartGame, isComputerPlayerId, isApiPlayerId, useCancelGame } from '@/hooks/useGames'
import type { ComputerPlayer } from '@/hooks/useGames'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { validateAndScoreMove } from '@/lib/scoring'
import { drawTiles } from '@/lib/gameConstants'
import type { Tile, BoardCell, PlacedTile } from '@/lib/gameConstants'
import GameBoard from '@/components/GameBoard'
import TileRack from '@/components/TileRack'
import { toast } from 'sonner'
import { ArrowLeft, Play, History, LogOut, Grid3X3, X } from 'lucide-react'
import { createEmptyBoard } from '@/lib/gameConstants'
import GameHistoryViewer from '@/components/GameHistoryViewer'
import GameChatSidebar from '@/components/GameChatSidebar'
import BlankTileDialog from '@/components/BlankTileDialog'
import Scoreboard from '@/components/Scoreboard'
import ReviewControls from '@/components/ReviewControls'
import GameControls from '@/components/GameControls'
import SuggestionControls from '@/components/SuggestionControls'
import { cn } from '@/lib/utils'
import { useGameRealtime } from '@/hooks/useGameRealtime'
import { useComputerPlayer } from '@/hooks/useComputerPlayer'
import { useTurnTimer } from '@/hooks/useTurnTimer'
import { useReviewMode } from '@/hooks/useReviewMode'
import type { MoveHistoryEntry } from '@/hooks/useReviewMode'
import { useSuggestionMode } from '@/hooks/useSuggestionMode'
import { useFindWords, type FindWordsMove } from '@/hooks/useFindWords'
import InstructionalModePanel, { moveKey as instructionalMoveKey } from '@/components/InstructionalModePanel'
import MobileGameHeader from '@/components/MobileGameHeader'
import MobileDrawer from '@/components/MobileDrawer'
import { BookOpen } from 'lucide-react'
import { BOARD_SIZE } from '@/lib/gameConstants'

// Heights in px for the mobile vertical stack. Keep in sync with JSX.
const MOBILE_HEADER_H = 40
const MOBILE_BANNER_H = 32  // per-banner; 0 when hidden
const MOBILE_RACK_H = 52
const MOBILE_CONTROLS_H = 44
const MOBILE_PADDING = 16   // total vertical padding/gaps

/** The actual visible viewport height, accounting for browser chrome
 *  (URL bar, bottom toolbar) on iOS Chrome/Safari. Falls back to
 *  innerHeight when visualViewport isn't available. */
function getVisualHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight
}

function useMobileLayout() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

/** Returns the actual visible height in px, tracking resize and
 *  visualViewport changes (iOS Chrome toolbar show/hide). */
function useVisualHeight(isMobile: boolean) {
  const [height, setHeight] = useState(() => isMobile ? getVisualHeight() : 0)

  useLayoutEffect(() => {
    if (!isMobile) { setHeight(0); return }
    const update = () => setHeight(getVisualHeight())
    update()
    // visualViewport fires 'resize' when the browser toolbar hides/shows
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', update)
    }
    window.addEventListener('resize', update)
    return () => {
      if (vv) vv.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
    }
  }, [isMobile])

  return height
}

function useMobileCellSize(isMobile: boolean, bannerCount: number, visualHeight: number) {
  const [cellSize, setCellSize] = useState(0)

  useLayoutEffect(() => {
    if (!isMobile || !visualHeight) { setCellSize(0); return }
    const vw = window.innerWidth
    const chrome = MOBILE_HEADER_H + (bannerCount * MOBILE_BANNER_H) + MOBILE_RACK_H + MOBILE_CONTROLS_H + MOBILE_PADDING
    const availH = visualHeight - chrome
    const availW = vw - 16 // 8px padding each side
    // Board outer frame adds ~8px total (padding + border) on mobile
    const boardInner = Math.min(availH, availW) - 8
    const cs = Math.floor(boardInner / BOARD_SIZE)
    setCellSize(Math.max(16, Math.min(cs, 30))) // clamp 16-30
  }, [isMobile, bannerCount, visualHeight])

  return cellSize
}

interface GamePageProps {
  gameId: string
  userId: string
  onBack: () => void
}

export default function GamePage({ gameId, userId, onBack }: GamePageProps) {
  const { data: game, isLoading } = useGame(gameId)
  const queryClient = useQueryClient()
  const startGame = useStartGame()
  useGameRealtime(gameId)

  const { playComputerTurn } = useComputerPlayer(gameId)
  const cancelGame = useCancelGame()

  const [placedTiles, setPlacedTiles] = useState<Map<string, Tile>>(new Map())
  const [selectedSquare, setSelectedSquare] = useState<{ row: number; col: number } | null>(null)
  const [direction, setDirection] = useState<'across' | 'down'>('across')
  const [showLabels, setShowLabels] = useState(false)
  const [isExchangeMode, setIsExchangeMode] = useState(false)
  const [exchangeSelection, setExchangeSelection] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [blankTileTarget, setBlankTileTarget] = useState<{ row: number; col: number; tile: Tile } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [rackOrder, setRackOrder] = useState<string[] | null>(null)

  // Rack tiles for current user (excluding placed tiles)
  const myPlayer = game?.game_players?.find(p => p.player_id === userId)
  const fullRack = (myPlayer?.rack ?? []) as Tile[]
  const placedTileIds = useMemo(() => new Set(Array.from(placedTiles.values()).map(t => t.id)), [placedTiles])
  const filteredRack = fullRack.filter(t => !placedTileIds.has(t.id))
  const rackTiles = useMemo(() => {
    if (!rackOrder) return filteredRack
    const byId = new Map(filteredRack.map(t => [t.id, t]))
    const ordered = rackOrder.filter(id => byId.has(id)).map(id => byId.get(id)!)
    // Add any tiles not in the order (newly drawn)
    const inOrder = new Set(rackOrder)
    for (const t of filteredRack) {
      if (!inOrder.has(t.id)) ordered.push(t)
    }
    return ordered
  }, [filteredRack, rackOrder])

  const handleShuffleRack = useCallback(() => {
    const ids = rackTiles.map(t => t.id)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]]
    }
    setRackOrder([...ids])
  }, [rackTiles])

  const handleReorderRack = useCallback((reordered: Tile[]) => {
    setRackOrder(reordered.map(t => t.id))
  }, [])

  const isMyTurn = game?.current_turn === userId
  const isComputerTurn = game?.current_turn ? isComputerPlayerId(game.current_turn) : false
  const isApiTurn = game?.current_turn ? isApiPlayerId(game.current_turn) : false
  const computerPlayers = (game?.computer_players ?? []) as ComputerPlayer[]
  const currentComputerPlayer = isComputerTurn && game?.current_turn
    ? computerPlayers.find(cp => cp.id === game.current_turn)
    : null
  const currentApiPlayer = isApiTurn && game?.current_turn
    ? computerPlayers.find(cp => cp.id === game.current_turn)
    : null
  const isActive = game?.status === 'active'
  const board = (game?.board ?? []) as BoardCell[][]
  const isFirstMove = board.every(row => row.every(cell => !cell.tile))

  // API players owned by the current user (so we can show their rack)
  const myApiPlayers = computerPlayers.filter(cp => cp.id.startsWith('api-') && cp.owner_id === userId)
  const isSpectatingApi = isActive && !myPlayer && myApiPlayers.length > 0
  const spectatingApiPlayer = isSpectatingApi ? myApiPlayers[0] : null

  // Parse previewed_move from game data for board display
  const previewedTiles = useMemo(() => {
    const pm = (game as Record<string, unknown> | undefined)?.previewed_move as { tiles: { row: number; col: number; letter: string; is_blank?: boolean }[] } | null
    if (!pm?.tiles) return undefined
    return pm.tiles
  }, [game])

  const moveCount = (game?.move_history as unknown[] | undefined)?.length ?? 0

  const {
    suggestionTiles,
    setSuggestionTiles,
    suggestionSquare,
    setSuggestionSquare,
    suggestionDirection,
    setSuggestionDirection,
    suggestionBlankTarget,
    setSuggestionBlankTarget,
    handleSuggestionSquareClick,
    handleSuggestionTileClick,
    handleSuggestionBlankChoice,
    clearSuggestion,
  } = useSuggestionMode(gameId, userId, board, isSpectatingApi, moveCount)

  // Suggestion rack: API player's rack minus tiles already placed as suggestions
  // Also minus tiles the LLM is previewing, so the rack shows what it would look like after the move
  const suggestionPlacedIds = useMemo(() => new Set(Array.from(suggestionTiles.values()).map(t => t.id)), [suggestionTiles])
  const suggestionRack = useMemo(() => {
    if (!spectatingApiPlayer) return []
    let rack = spectatingApiPlayer.rack.filter(t => !suggestionPlacedIds.has(t.id))
    if (previewedTiles && previewedTiles.length > 0) {
      const lettersToRemove = [...previewedTiles.map(t => t.is_blank ? '' : t.letter)]
      for (const letter of lettersToRemove) {
        const idx = rack.findIndex(t => t.letter === letter)
        if (idx !== -1) rack = [...rack.slice(0, idx), ...rack.slice(idx + 1)]
      }
    }
    return rack
  }, [spectatingApiPlayer, suggestionPlacedIds, previewedTiles])

  // #10 Instructional mode for human players. Per-seat opt-in, set at game
  // creation in CreateGameForm and persisted on game_players.find_words_enabled.
  // The find-words Edge Function (post-#9) accepts a JWT and returns the same
  // shape it serves to API players. Refetches on every committed move via the
  // moveCount in the query key, and on rack changes via rackSignature so an
  // exchange (no moveCount bump) still triggers a refresh.
  const findWordsEnabled = !!myPlayer?.find_words_enabled && isActive
  const rackSignature = useMemo(
    () => fullRack.map(t => `${t.id}:${t.letter}`).sort().join(','),
    [fullRack]
  )
  const findWordsQuery = useFindWords({
    gameId,
    moveCount,
    rackSignature,
    enabled: findWordsEnabled,
  })

  // Track which find-words row (if any) is currently staged on the board, so
  // the panel can highlight it and a second click on the same row clears it.
  const [stagedFindWordsKey, setStagedFindWordsKey] = useState<string | null>(null)

  // Panel visibility. Defaults to hidden so the player can try to find the
  // best move first and then check their work — the test-and-review cycle is
  // how people actually learn. Data still fetches in the background (see
  // useFindWords above) so toggling back on is instant.
  const [showInstructional, setShowInstructional] = useState(false)

  // Per-session banner dismissals above the board. Users are tight on
  // vertical space, so once they've learned what the banners say they can
  // X them out and get the space back. Not persisted — a fresh session
  // gets the hint again, which is probably what you want for a learning
  // aid. The instructional toggle lives on in the Scoreboard button so
  // closing the banner doesn't strand the feature.
  const [hidePlayHint, setHidePlayHint] = useState(false)
  const [hideInstructionalBanner, setHideInstructionalBanner] = useState(false)

  // Mobile layout
  const isMobile = useMobileLayout()
  const [mobileChat, setMobileChat] = useState(false)

  // Count visible banners for mobile cell-size calculation
  const showPlayHintBanner = isActive && isMyTurn && placedTiles.size === 0 && !hidePlayHint
  const showInstructionalBanner = findWordsEnabled && !hideInstructionalBanner
  const mobileBannerCount = isMobile ? ((showPlayHintBanner ? 1 : 0) + (showInstructionalBanner ? 1 : 0)) : 0
  const visualHeight = useVisualHeight(isMobile)
  const mobileCellSize = useMobileCellSize(isMobile, mobileBannerCount, visualHeight)
  const mobileTileSize = isMobile ? Math.max(44, Math.round(mobileCellSize * 1.6)) : undefined

  // Review mode: board and highlighted tiles for game history on the main board
  const moveHistory = (game?.move_history ?? []) as MoveHistoryEntry[]

  const {
    reviewMode,
    setReviewMode,
    reviewMoveIndex,
    setReviewMoveIndex,
    reviewBoard,
    reviewHighlightTiles,
    reviewCurrentMove,
    reviewTiming,
    reviewScores,
    reviewTilesRemaining,
  } = useReviewMode(moveHistory, board)

  // Live turn timer
  const turnElapsed = useTurnTimer(game?.updated_at, isActive, game?.current_turn)

  // Trigger computer's turn automatically via Edge Function.
  // Deps include move_history length so every completed turn re-evaluates,
  // and the turnKey passed to playComputerTurn dedupes per-turn (StrictMode
  // double-fire) without blocking the next turn.
  useEffect(() => {
    if (!game || !isActive || !isComputerTurn) return
    const cpId = game.current_turn as string
    const delay = Math.max(1500, (game.computer_delay ?? 0) * 1000)
    const turnKey = `${cpId}:${moveCount}`

    const timer = setTimeout(() => {
      playComputerTurn(cpId, turnKey)
    }, delay)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.current_turn, game?.status, moveCount])

  // Watchdog: if the game has been stuck on a computer's turn for 15 seconds
  // (longer than any legitimate move), re-trigger. Catches any missed realtime
  // update, race condition, or transient failure.
  useEffect(() => {
    if (!game || !isActive || !isComputerTurn) return
    const cpId = game.current_turn as string
    const updatedAt = game.updated_at ? new Date(game.updated_at).getTime() : Date.now()
    const stallMs = Date.now() - updatedAt
    const delay = Math.max(0, 15000 - stallMs)

    const timer = setTimeout(() => {
      // Force a refetch first in case the cache is stale, then retry
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
      playComputerTurn(cpId, `watchdog:${cpId}:${Date.now()}`)
    }, delay)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.current_turn, game?.status, game?.updated_at, moveCount])

  const handleSquareClick = useCallback((row: number, col: number) => {
    // If there's already a committed tile, ignore
    if (board[row]?.[col]?.tile) return

    // If clicking the same square, toggle direction
    if (selectedSquare?.row === row && selectedSquare?.col === col) {
      setDirection(d => d === 'across' ? 'down' : 'across')
      return
    }

    setSelectedSquare({ row, col })
  }, [selectedSquare, board])

  const placeTileOnBoard = useCallback((row: number, col: number, tile: Tile) => {
    if (board[row]?.[col]?.tile) return // already has committed tile
    if (placedTiles.has(`${row},${col}`)) return // already placed this turn

    // If blank tile, prompt for letter
    if (tile.isBlank) {
      setBlankTileTarget({ row, col, tile })
      return
    }

    setPlacedTiles(prev => {
      const next = new Map(prev)
      next.set(`${row},${col}`, tile)
      return next
    })
    setStagedFindWordsKey(null)
  }, [board, placedTiles])

  // #10 click-to-stage from the instructional panel. Builds a fresh placedTiles
  // Map atomically by walking the move's tiles and pulling matching tiles out
  // of the live rack. The staged map flows through the same recall / submit
  // path as drag-dropped tiles — no parallel staging system. Cell notation is
  // `A1`-style: column letter (A-O) then row number (1-15).
  const stageMoveFromFindWords = useCallback((move: FindWordsMove) => {
    if (!isMyTurn || !isActive) return
    const key = instructionalMoveKey(move)

    // Click the same row twice to clear.
    if (stagedFindWordsKey === key) {
      setPlacedTiles(new Map())
      setSelectedSquare(null)
      setStagedFindWordsKey(null)
      return
    }

    // Walk the rack consuming tiles by id so we don't double-use a duplicate.
    const rackPool = [...fullRack]
    const next = new Map<string, Tile>()
    for (const t of move.tiles) {
      const cellMatch = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/)
      if (!cellMatch) {
        toast.error(`Couldn't stage move (bad cell ${t.cell})`)
        return
      }
      const col = cellMatch[1].charCodeAt(0) - 65
      const row = parseInt(cellMatch[2]) - 1
      // Skip squares that are already committed; the engine wouldn't have put
      // a tile there, but a stale refetch could disagree with the live board.
      if (board[row]?.[col]?.tile) {
        toast.error("That play conflicts with the current board — refreshing")
        return
      }

      let pickIdx: number
      if (t.is_blank) {
        // Blank: take any blank from the rack and overwrite its letter/value.
        pickIdx = rackPool.findIndex(r => r.isBlank)
      } else {
        // Normal tile: prefer a matching non-blank, but accept a blank as
        // fallback (the engine treats blanks as wildcards too).
        pickIdx = rackPool.findIndex(r => !r.isBlank && r.letter === t.letter)
        if (pickIdx === -1) pickIdx = rackPool.findIndex(r => r.isBlank)
      }
      if (pickIdx === -1) {
        toast.error(`Couldn't stage move — rack changed`)
        return
      }
      const rackTile = rackPool.splice(pickIdx, 1)[0]
      const placed: Tile = t.is_blank
        ? { ...rackTile, letter: t.letter.toUpperCase(), value: 0 }
        : rackTile
      next.set(`${row},${col}`, placed)
    }

    setPlacedTiles(next)
    setSelectedSquare(null)
    setStagedFindWordsKey(key)
  }, [isMyTurn, isActive, fullRack, board, stagedFindWordsKey])

  const handleBlankLetterChoice = useCallback((letter: string) => {
    if (!blankTileTarget) return
    const { row, col, tile } = blankTileTarget
    const blankAsLetter: Tile = { ...tile, letter: letter.toUpperCase(), value: 0 }
    setPlacedTiles(prev => {
      const next = new Map(prev)
      next.set(`${row},${col}`, blankAsLetter)
      return next
    })
    setBlankTileTarget(null)
  }, [blankTileTarget])

  const handleDrop = useCallback((row: number, col: number, tile: Tile, source?: { row: number; col: number }) => {
    // Reject drops onto locked (committed) tiles. Live tiles are always
    // movable until the move is committed.
    if (board[row]?.[col]?.tile) return
    // No-op: dropped back on the same square it came from.
    if (source && source.row === row && source.col === col) return

    if (isSpectatingApi) {
      // Blank tile from rack → prompt for letter assignment.
      if (tile.isBlank && !source && !tile.letter) {
        setSuggestionBlankTarget({ row, col, tile })
        return
      }
      // Atomic move: remove from source (if any) and place at destination
      // in a single state update. If the destination already had a live
      // tile, it's overwritten — that tile drops out of the suggestion
      // map and reappears in the rack via the filter.
      setSuggestionTiles(prev => {
        const next = new Map(prev)
        if (source) next.delete(`${source.row},${source.col}`)
        next.set(`${row},${col}`, tile)
        return next
      })
      return
    }

    if (!isMyTurn || !isActive) return

    // Blank tile from rack → prompt for letter assignment.
    if (tile.isBlank && !source && !tile.letter) {
      setBlankTileTarget({ row, col, tile })
      return
    }

    setPlacedTiles(prev => {
      const next = new Map(prev)
      if (source) next.delete(`${source.row},${source.col}`)
      next.set(`${row},${col}`, tile)
      return next
    })
    setStagedFindWordsKey(null)
  }, [isMyTurn, isActive, isSpectatingApi, board, setSuggestionTiles, setSuggestionBlankTarget])

  // Keyboard support: type letters to place tiles (works for both own turn and suggestion mode)
  useEffect(() => {
    const canType = (isMyTurn && isActive) || isSpectatingApi
    if (!canType) return

    const activeSquare = isSpectatingApi ? suggestionSquare : selectedSquare
    const activeDirection = isSpectatingApi ? suggestionDirection : direction
    const activeTiles = isSpectatingApi ? suggestionTiles : placedTiles
    const activeRack = isSpectatingApi ? suggestionRack : rackTiles

    const handleKeyDown = (e: KeyboardEvent) => {
      // Blank tile letter selection (own turn)
      if (!isSpectatingApi && blankTileTarget) {
        if (/^[a-zA-Z]$/.test(e.key)) {
          handleBlankLetterChoice(e.key)
        } else if (e.key === 'Escape') {
          setBlankTileTarget(null)
        }
        return
      }
      // Blank tile letter selection (suggestion mode)
      if (isSpectatingApi && suggestionBlankTarget) {
        if (/^[a-zA-Z]$/.test(e.key)) {
          handleSuggestionBlankChoice(e.key)
        } else if (e.key === 'Escape') {
          setSuggestionBlankTarget(null)
        }
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (isSpectatingApi) {
          setSuggestionDirection(e.key === 'ArrowDown' ? 'down' : 'across')
        } else {
          setDirection(e.key === 'ArrowDown' ? 'down' : 'across')
        }
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        const entries = Array.from(activeTiles.entries())
        if (entries.length > 0) {
          const lastKey = entries[entries.length - 1][0]
          if (isSpectatingApi) {
            setSuggestionTiles(prev => {
              const next = new Map(prev)
              next.delete(lastKey)
              return next
            })
            const [r, c] = lastKey.split(',').map(Number)
            setSuggestionSquare({ row: r, col: c })
          } else {
            setPlacedTiles(prev => {
              const next = new Map(prev)
              next.delete(lastKey)
              return next
            })
            const [r, c] = lastKey.split(',').map(Number)
            setSelectedSquare({ row: r, col: c })
          }
        }
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (!isSpectatingApi && placedTiles.size > 0) handleSubmitMove()
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (isSpectatingApi) {
          setSuggestionTiles(new Map())
          setSuggestionSquare(null)
        } else {
          handleRecall()
        }
        return
      }

      if (!activeSquare) return

      const letter = e.key.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return
      e.preventDefault()

      // Find a matching tile in the rack
      const matchingTile = activeRack.find(t => t.letter === letter)
      const tileToPlace = matchingTile || activeRack.find(t => t.isBlank)
      if (!tileToPlace) return

      const key = `${activeSquare.row},${activeSquare.col}`
      if (board[activeSquare.row]?.[activeSquare.col]?.tile) return
      if (activeTiles.has(key)) return

      if (isSpectatingApi) {
        const placed = tileToPlace.isBlank ? { ...tileToPlace, letter, value: 0 } : tileToPlace
        setSuggestionTiles(prev => {
          const next = new Map(prev)
          next.set(key, placed)
          return next
        })
      } else {
        if (tileToPlace.isBlank) {
          const blankAsLetter: Tile = { ...tileToPlace, letter, value: 0 }
          setPlacedTiles(prev => {
            const next = new Map(prev)
            next.set(key, blankAsLetter)
            return next
          })
        } else {
          placeTileOnBoard(activeSquare.row, activeSquare.col, tileToPlace)
        }
      }

      // Advance cursor
      let nextRow = activeSquare.row
      let nextCol = activeSquare.col
      do {
        if (activeDirection === 'across') nextCol++
        else nextRow++
      } while (
        nextRow < 15 && nextCol < 15 &&
        (board[nextRow]?.[nextCol]?.tile || activeTiles.has(`${nextRow},${nextCol}`))
      )
      if (nextRow < 15 && nextCol < 15) {
        if (isSpectatingApi) {
          setSuggestionSquare({ row: nextRow, col: nextCol })
        } else {
          setSelectedSquare({ row: nextRow, col: nextCol })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, isActive, isSpectatingApi, selectedSquare, suggestionSquare, direction, suggestionDirection, rackTiles, suggestionRack, placedTiles, suggestionTiles, board, blankTileTarget])

  const handleRecall = () => {
    setPlacedTiles(new Map())
    setSelectedSquare(null)
    setStagedFindWordsKey(null)
  }

  // Clear the instructional highlight on any committed move (the staged play
  // was either submitted or invalidated by the new board state).
  useEffect(() => {
    setStagedFindWordsKey(null)
  }, [moveCount])

  const handlePickupTile = useCallback((row: number, col: number, insertIndex?: number) => {
    const key = `${row},${col}`
    if (isSpectatingApi && suggestionTiles.has(key)) {
      setSuggestionTiles(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      return
    }
    const returningTile = placedTiles.get(key)
    if (!returningTile) return
    setPlacedTiles(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    setStagedFindWordsKey(null)
    // When the caller requested a specific rack insertion position (e.g. a
    // board → rack drop with a visible drop indicator), update rackOrder
    // so the returning tile lands exactly where the user pointed.
    if (insertIndex !== undefined) {
      const baseIds = rackTiles.map(t => t.id)
      const at = Math.max(0, Math.min(insertIndex, baseIds.length))
      baseIds.splice(at, 0, returningTile.id)
      setRackOrder(baseIds)
    }
  }, [placedTiles, isSpectatingApi, suggestionTiles, rackTiles])

  const handleSubmitMove = async () => {
    if (!game || !isMyTurn || placedTiles.size === 0) return
    setSubmitting(true)

    try {
      const placed: PlacedTile[] = Array.from(placedTiles.entries()).map(([key, tile]) => {
        const [row, col] = key.split(',').map(Number)
        return { row, col, tile }
      })

      const result = validateAndScoreMove(board, placed, isFirstMove)
      if (!result.valid) {
        toast.error(result.error || 'Invalid move')
        setSubmitting(false)
        return
      }

      // Validate words against dictionary when playing against computer
      if (game.has_computer && result.words.length > 0) {
        try {
          const wordStrings = result.words.map(w => w.word)
          const { data: valData, error: valErr } = await supabase.functions.invoke('validate-word', {
            body: { words: wordStrings },
          })
          if (valErr) throw valErr
          const invalid = wordStrings.filter(w => !valData.results[w])
          if (invalid.length > 0) {
            toast.error(`Not in dictionary: ${invalid.join(', ')}`)
            setSubmitting(false)
            return
          }
        } catch {
          // If validation service is down, allow the move rather than blocking play
          console.warn('Word validation service unavailable, allowing move')
        }
      }

      // Update board
      const newBoard = board.map(row => row.map(cell => ({ ...cell })))
      for (const pt of placed) {
        newBoard[pt.row][pt.col] = {
          tile: pt.tile,
          bonus: newBoard[pt.row][pt.col].bonus,
          isNew: false,
        }
      }

      // Draw new tiles
      const tileBag = (game.tile_bag ?? []) as Tile[]
      const { drawn, remaining } = drawTiles(tileBag, placed.length)
      const newRack = [...rackTiles, ...drawn]

      // Advance turn
      const turnOrder = game.turn_order as string[]
      const nextIndex = (game.turn_index + 1) % turnOrder.length
      const nextPlayer = turnOrder[nextIndex]

      // Build move history entry
      const moveHistoryEntry = {
        player_id: userId,
        player_name: myPlayer?.profiles?.display_name ?? 'Player',
        type: 'play',
        tiles: placed,
        words: result.words,
        score: result.totalScore,
        rack_snapshot: fullRack.map(t => ({ letter: t.letter, value: t.value, isBlank: t.isBlank })),
        board_snapshot: newBoard,
        timestamp: new Date().toISOString(),
      }
      const updatedHistory = [...(game.move_history ?? []), moveHistoryEntry]

      // Update game state
      const { error: gameErr } = await supabase
        .from('games')
        .update({
          board: newBoard,
          tile_bag: remaining,
          current_turn: nextPlayer,
          turn_index: nextIndex,
          consecutive_passes: 0,
          last_move: {
            player_id: userId,
            type: 'play',
            tiles: placed,
            words: result.words,
            score: result.totalScore,
          },
          move_history: updatedHistory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
      if (gameErr) throw gameErr

      // Update player score and rack
      const myNewScore = (myPlayer?.score ?? 0) + result.totalScore
      const { error: playerErr } = await supabase
        .from('game_players')
        .update({
          score: myNewScore,
          rack: newRack,
        })
        .eq('game_id', gameId)
        .eq('player_id', userId)
      if (playerErr) throw playerErr

      // Check if game is over: player emptied rack and bag is empty
      const gameOver = newRack.length === 0 && remaining.length === 0
      if (gameOver) {
        // End-game scoring: deduct remaining tile values from other players, add sum to this player
        let bonusFromOthers = 0

        // Human opponents
        const otherHumans = players.filter(p => p.player_id !== userId)
        for (const op of otherHumans) {
          const opRack = (op.rack ?? []) as Tile[]
          const rackValue = opRack.reduce((sum, t) => sum + t.value, 0)
          bonusFromOthers += rackValue
          await supabase.from('game_players').update({
            score: Math.max(0, op.score - rackValue),
          }).eq('game_id', gameId).eq('player_id', op.player_id)
        }

        // Computer/API players — update the computer_players JSON on the game row
        const adjustedComputerPlayers = computerPlayers.map(cp => {
          const cpRack = (cp.rack ?? []) as Tile[]
          const rackValue = cpRack.reduce((sum, t) => sum + t.value, 0)
          bonusFromOthers += rackValue
          return { ...cp, score: Math.max(0, cp.score - rackValue) }
        })

        const finalScore = myNewScore + bonusFromOthers
        await supabase.from('game_players').update({ score: finalScore })
          .eq('game_id', gameId).eq('player_id', userId)

        // Find winner (highest score) — include both human and computer/API players
        const allScores: { id: string; score: number }[] = [
          { id: userId, score: finalScore },
          ...otherHumans.map(op => {
            const opRack = (op.rack ?? []) as Tile[]
            const rackValue = opRack.reduce((sum, t) => sum + t.value, 0)
            return { id: op.player_id, score: Math.max(0, op.score - rackValue) }
          }),
          ...adjustedComputerPlayers.map(cp => ({ id: cp.id, score: cp.score })),
        ]
        const winner = allScores.reduce((best, p) => p.score > best.score ? p : best)

        await supabase.from('games').update({
          status: 'finished',
          winner: winner.id,
          computer_players: adjustedComputerPlayers,
          updated_at: new Date().toISOString(),
        }).eq('id', gameId)
      }

      // Record move
      await supabase.from('game_moves').insert({
        game_id: gameId,
        player_id: userId,
        move_type: 'play',
        tiles_placed: placed,
        words_formed: result.words.map(w => w.word),
        score: result.totalScore,
      })

      if (gameOver) {
        toast.success(`Game over! You played out — ${result.words.map(w => w.word).join(', ')} for ${result.totalScore} points!`)
      } else {
        toast.success(`${result.words.map(w => w.word).join(', ')} \u2014 ${result.totalScore} points!`)
      }
      setPlacedTiles(new Map())
      setSelectedSquare(null)
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
      queryClient.invalidateQueries({ queryKey: ['game_moves', gameId] })
    } catch (err) {
      toast.error('Failed to submit move')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePass = async () => {
    if (!game || !isMyTurn) return

    if (isExchangeMode && exchangeSelection.size > 0) {
      // Exchange tiles
      setSubmitting(true)
      try {
        const tileBag = (game.tile_bag ?? []) as Tile[]
        if (tileBag.length < exchangeSelection.size) {
          toast.error('Not enough tiles in the bag to exchange')
          setSubmitting(false)
          return
        }

        const tilesToExchange = fullRack.filter(t => exchangeSelection.has(t.id))
        const remainingRack = fullRack.filter(t => !exchangeSelection.has(t.id))
        const { drawn, remaining } = drawTiles(tileBag, tilesToExchange.length)
        const newBag = [...remaining, ...tilesToExchange]
        // Shuffle the returned tiles back in
        for (let i = newBag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newBag[i], newBag[j]] = [newBag[j], newBag[i]]
        }

        const turnOrder = game.turn_order as string[]
        const nextIndex = (game.turn_index + 1) % turnOrder.length

        await supabase.from('games').update({
          tile_bag: newBag,
          current_turn: turnOrder[nextIndex],
          turn_index: nextIndex,
          consecutive_passes: game.consecutive_passes + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', gameId)

        await supabase.from('game_players').update({
          rack: [...remainingRack, ...drawn],
        }).eq('game_id', gameId).eq('player_id', userId)

        await supabase.from('game_moves').insert({
          game_id: gameId,
          player_id: userId,
          move_type: 'exchange',
          score: 0,
        })

        toast.success(`Exchanged ${tilesToExchange.length} tile(s)`)
        setExchangeSelection(new Set())
        setIsExchangeMode(false)
        queryClient.invalidateQueries({ queryKey: ['game', gameId] })
      } catch {
        toast.error('Failed to exchange tiles')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Simple pass
    setSubmitting(true)
    try {
      const turnOrder = game.turn_order as string[]
      const nextIndex = (game.turn_index + 1) % turnOrder.length
      const newConsecutivePasses = game.consecutive_passes + 1

      // Check if game should end (all players passed consecutively)
      const isGameOver = newConsecutivePasses >= turnOrder.length * 2

      const passHistoryEntry = {
        player_id: userId,
        player_name: myPlayer?.profiles?.display_name ?? 'Player',
        type: 'pass',
        rack_snapshot: fullRack.map(t => ({ letter: t.letter, value: t.value, isBlank: t.isBlank })),
        board_snapshot: board,
        timestamp: new Date().toISOString(),
      }

      const updates: Record<string, unknown> = {
        current_turn: turnOrder[nextIndex],
        turn_index: nextIndex,
        consecutive_passes: newConsecutivePasses,
        move_history: [...(game.move_history ?? []), passHistoryEntry],
        updated_at: new Date().toISOString(),
      }

      if (isGameOver) {
        updates.status = 'finished'
        // Determine winner by score — include both human and computer/API players
        const allPlayers = game.game_players ?? []
        const allScores: { id: string; score: number }[] = [
          ...allPlayers.map(p => ({ id: p.player_id, score: p.score })),
          ...computerPlayers.map(cp => ({ id: cp.id, score: cp.score })),
        ]
        const winner = allScores.reduce((best, p) => p.score > best.score ? p : best, allScores[0])
        updates.winner = winner.id
      }

      await supabase.from('games').update(updates).eq('id', gameId)

      await supabase.from('game_moves').insert({
        game_id: gameId,
        player_id: userId,
        move_type: 'pass',
        score: 0,
      })

      if (isGameOver) {
        toast.info('Game over! All players passed.')
      } else {
        toast.info('Turn passed')
      }
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
    } catch {
      toast.error('Failed to pass')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChallenge = async () => {
    if (!game) return
    const lastMove = game.last_move as { player_id: string; words: { word: string }[]; score: number; tiles: PlacedTile[] } | null
    if (!lastMove || lastMove.player_id === userId) {
      toast.error('Nothing to challenge — you can only challenge the previous player\'s move')
      return
    }

    setSubmitting(true)
    try {
      const wordsToCheck = lastMove.words.map(w => typeof w === 'string' ? w : w.word)
      const { data, error } = await supabase.functions.invoke('validate-word', {
        body: { words: wordsToCheck },
      })

      if (error) throw error

      const results = data.results as Record<string, boolean>
      const invalidWords = Object.entries(results).filter(([, valid]) => !valid).map(([word]) => word)

      if (invalidWords.length > 0) {
        // Challenge succeeds — reverse the move
        // Remove tiles from board, restore previous state
        const newBoard = board.map(row => row.map(cell => ({ ...cell })))
        for (const pt of lastMove.tiles) {
          newBoard[pt.row][pt.col] = {
            tile: null,
            bonus: newBoard[pt.row][pt.col].bonus,
            isNew: false,
          }
        }

        // Deduct score from challenged player
        const challengedPlayer = game.game_players?.find(p => p.player_id === lastMove.player_id)
        if (challengedPlayer) {
          await supabase.from('game_players').update({
            score: Math.max(0, challengedPlayer.score - lastMove.score),
          }).eq('game_id', gameId).eq('player_id', lastMove.player_id)
        }

        await supabase.from('games').update({
          board: newBoard,
          updated_at: new Date().toISOString(),
        }).eq('id', gameId)

        await supabase.from('game_moves').insert({
          game_id: gameId,
          player_id: userId,
          move_type: 'challenge_success',
          words_formed: invalidWords,
          score: 0,
        })

        toast.success(`Challenge successful! "${invalidWords.join(', ')}" ${invalidWords.length === 1 ? 'is' : 'are'} not valid. Move reversed!`)
      } else {
        // Challenge fails — challenger loses their turn
        const turnOrder = game.turn_order as string[]
        const nextIndex = (game.turn_index + 1) % turnOrder.length

        await supabase.from('games').update({
          current_turn: turnOrder[nextIndex],
          turn_index: nextIndex,
          updated_at: new Date().toISOString(),
        }).eq('id', gameId)

        await supabase.from('game_moves').insert({
          game_id: gameId,
          player_id: userId,
          move_type: 'challenge_fail',
          words_formed: wordsToCheck,
          score: 0,
        })

        toast.error(`Challenge failed! All words are valid. You lose your turn.`)
      }

      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
      queryClient.invalidateQueries({ queryKey: ['game_moves', gameId] })
    } catch {
      toast.error('Failed to validate challenge')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleExchangeMode = () => {
    setIsExchangeMode(!isExchangeMode)
    setExchangeSelection(new Set())
    setPlacedTiles(new Map())
    setSelectedSquare(null)
  }

  const handleRackTileClick = (tile: Tile) => {
    if (isExchangeMode) {
      setExchangeSelection(prev => {
        const next = new Set(prev)
        if (next.has(tile.id)) next.delete(tile.id)
        else next.add(tile.id)
        return next
      })
      return
    }

    // If spectating, delegate to suggestion handler
    if (isSpectatingApi) {
      handleSuggestionTileClick(tile)
      return
    }

    // If a square is selected, place the tile there
    if (selectedSquare && isMyTurn) {
      placeTileOnBoard(selectedSquare.row, selectedSquare.col, tile)
      // Advance cursor
      let nextRow = selectedSquare.row
      let nextCol = selectedSquare.col
      do {
        if (direction === 'across') nextCol++
        else nextRow++
      } while (
        nextRow < 15 && nextCol < 15 &&
        (board[nextRow]?.[nextCol]?.tile || placedTiles.has(`${nextRow},${nextCol}`))
      )
      if (nextRow < 15 && nextCol < 15) {
        setSelectedSquare({ row: nextRow, col: nextCol })
      }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
        <div className="text-amber-400 animate-pulse text-lg">Loading game...</div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
        <div className="text-amber-400">Game not found</div>
      </div>
    )
  }

  const players = game.game_players ?? []
  const currentTurnPlayer = players.find(p => p.player_id === game.current_turn)
  const tileBag = (game.tile_bag ?? []) as Tile[]

  return (
    <div className={cn('min-h-screen', isMobile && 'overflow-hidden flex flex-col')} style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)', ...(isMobile && visualHeight ? { height: `${visualHeight}px` } : {}) }}>
      {/* Mobile header — compact score bar with overflow menu */}
      {isMobile && (
        <MobileGameHeader
          players={players}
          computerPlayers={computerPlayers}
          currentTurn={game.current_turn}
          userId={userId}
          isActive={isActive}
          tilesLeft={tileBag.length}
          onBack={onBack}
          onToggleHistory={() => setShowHistory(v => !v)}
          onToggleInstructional={findWordsEnabled ? () => setShowInstructional(v => !v) : undefined}
          onToggleChat={() => setMobileChat(v => !v)}
          onResign={isActive && myPlayer ? async () => {
            if (!confirm('Resign this game?')) return
            try {
              await cancelGame.mutateAsync({ gameId, userId })
              toast.success('Game resigned')
              onBack()
            } catch { toast.error('Failed to resign') }
          } : undefined}
          showHistory={showHistory}
          showInstructional={showInstructional}
          canShowInstructional={findWordsEnabled}
          gameId={gameId}
          hasApiPlayers={computerPlayers.some(cp => cp.id.startsWith('api-'))}
        />
      )}

      {/* Desktop header */}
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50 hidden lg:block">
        <div className="container mx-auto px-3 py-2.5 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-amber-200 hover:text-white hover:bg-amber-700/50">
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="text-sm">Lobby</span>
          </Button>
          <h1 className="text-xl font-bold tracking-widest text-amber-300" style={{ fontFamily: "'Playfair Display', serif" }}>
            WORDZ
          </h1>
          <div className="flex items-center gap-3">
            {computerPlayers.some(cp => cp.id.startsWith('api-')) && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(gameId)
                  toast.success('Game ID copied!')
                }}
                className="text-xs text-purple-300 hover:text-purple-100 font-mono cursor-pointer"
                title="Click to copy game ID for API/MCP use"
              >
                ID: {gameId.slice(0, 8)}...
              </button>
            )}
            <span className="text-sm font-medium text-amber-200">
              {tileBag.length} tiles left
            </span>
            {isActive && myPlayer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!confirm('Resign this game?')) return
                  try {
                    await cancelGame.mutateAsync({ gameId, userId })
                    toast.success('Game resigned')
                    onBack()
                  } catch {
                    toast.error('Failed to resign')
                  }
                }}
                disabled={cancelGame.isPending}
                className="text-red-300 hover:text-red-100 hover:bg-red-900/30 text-sm"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Resign
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawers for panels that stack on desktop */}
      {isMobile && (
        <>
          <MobileDrawer open={showHistory} onClose={() => setShowHistory(false)} title="Game History">
            <div className="px-4 pb-4">
              <GameHistoryViewer
                moveHistory={(game.move_history ?? []) as MoveHistoryEntry[]}
                emptyBoard={createEmptyBoard()}
              />
            </div>
          </MobileDrawer>
          <MobileDrawer open={showInstructional && findWordsEnabled} onClose={() => setShowInstructional(false)} title="Word List" className="bg-sky-950/95 border-t border-sky-800/50">
            <div className="px-3 pb-3">
              <InstructionalModePanel
                data={findWordsQuery.data}
                isLoading={findWordsQuery.isLoading}
                isError={findWordsQuery.isError}
                error={findWordsQuery.error as Error | null}
                stagedMoveKey={stagedFindWordsKey}
                onStageMove={stageMoveFromFindWords}
                isMyTurn={isMyTurn}
              />
            </div>
          </MobileDrawer>
          <MobileDrawer open={mobileChat} onClose={() => setMobileChat(false)} title="Game Chat">
            <div className="h-[60dvh]">
              <GameChatSidebar gameId={gameId} userId={userId} gameStatus={game.status} />
            </div>
          </MobileDrawer>
        </>
      )}

      <main className={cn(
        'container mx-auto px-2 py-4 flex flex-col lg:flex-row gap-4 items-start justify-center',
        isMobile && 'px-2 py-1 gap-1 items-center flex-1 overflow-hidden'
      )}>
        {/* Desktop-only: Scoreboard sidebar */}
        {!isMobile && <Scoreboard
          players={players}
          computerPlayers={computerPlayers}
          currentTurn={game.current_turn}
          moveHistory={moveHistory}
          userId={userId}
          isActive={isActive}
          turnElapsed={turnElapsed}
          reviewMode={reviewMode}
          reviewCurrentMove={reviewCurrentMove}
          reviewScores={reviewScores}
          reviewTilesRemaining={reviewTilesRemaining}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
          canShowInstructional={findWordsEnabled}
          showInstructional={showInstructional}
          setShowInstructional={setShowInstructional}
        />}

        {/* #10 Instructional mode panel — desktop only (mobile uses drawer) */}
        {!isMobile && findWordsEnabled && showInstructional && (
          <InstructionalModePanel
            data={findWordsQuery.data}
            isLoading={findWordsQuery.isLoading}
            isError={findWordsQuery.isError}
            error={findWordsQuery.error as Error | null}
            stagedMoveKey={stagedFindWordsKey}
            onStageMove={stageMoveFromFindWords}
            isMyTurn={isMyTurn}
          />
        )}

        {/* Game History Viewer — desktop only (mobile uses drawer) */}
        {!isMobile && showHistory && (
          <Card className="border-amber-900/30 bg-amber-950/30 w-full lg:w-56 shrink-0">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-amber-300 text-sm flex items-center gap-2">
                <History className="h-4 w-4" />
                Game Replay
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <GameHistoryViewer
                moveHistory={(game.move_history ?? []) as { player_id: string; player_name: string; type: 'play' | 'pass' | 'exchange'; words?: { word: string; score: number }[]; score?: number; board_snapshot: BoardCell[][]; timestamp: string }[]}
                emptyBoard={createEmptyBoard()}
              />
            </CardContent>
          </Card>
        )}

        {/* Board + Rack */}
        <div className={cn('flex flex-col items-center', isMobile ? 'gap-0 flex-1 min-h-0 w-full' : 'gap-4')}>
          {/* Game status */}
          {game.status === 'waiting' && (
            <div className="flex flex-col items-center gap-3 bg-amber-900/20 px-6 py-4 rounded-lg">
              <div className="text-amber-400 text-sm">
                {players.length}/4 players joined
              </div>
              {game.created_by === userId && players.length >= 2 ? (
                <Button
                  onClick={async () => {
                    try {
                      await startGame.mutateAsync(gameId)
                      toast.success('Game started!')
                      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
                    } catch {
                      toast.error('Failed to start game')
                    }
                  }}
                  disabled={startGame.isPending}
                  className="bg-green-700 hover:bg-green-600 text-white font-semibold px-8 py-5 text-lg"
                >
                  <Play className="h-5 w-5 mr-2" />
                  {startGame.isPending ? 'Starting...' : 'Start Game!'}
                </Button>
              ) : game.created_by === userId ? (
                <div className="text-amber-400 text-xs">Need at least 2 players to start</div>
              ) : (
                <div className="text-amber-400 text-xs">Waiting for the game creator to start...</div>
              )}
            </div>
          )}
          {game.status === 'finished' && (() => {
            // Determine actual winner by highest score
            const allPlayerScores = [
              ...players.map(p => ({ name: p.profiles.display_name, score: p.score })),
              ...computerPlayers.map(cp => ({ name: cp.name, score: cp.score })),
            ]
            const actualWinner = allPlayerScores.reduce((best, p) => p.score > best.score ? p : best, allPlayerScores[0])
            const isTie = allPlayerScores.filter(p => p.score === actualWinner?.score).length > 1
            return (
            <div className="flex flex-col items-center gap-2">
              <div className="px-8 py-3 rounded-lg text-center border border-amber-600/40" style={{ background: 'linear-gradient(135deg, #5c3a1e 0%, #4a2e15 100%)', boxShadow: '0 0 0 2px #6b4226, 0 4px 16px rgba(0,0,0,0.3)' }}>
                <div className="text-xl font-bold text-amber-300" style={{ fontFamily: "'Playfair Display', serif" }}>Game Over!</div>
                <div className="text-sm mt-1 text-amber-200/80">
                  {isTie ? 'Tie!' : `Winner: ${actualWinner?.name ?? 'Unknown'}`}
                </div>
              </div>
              <Button
                onClick={() => {
                  setReviewMode(r => !r)
                  if (!reviewMode) setReviewMoveIndex(moveHistory.length - 1)
                }}
                className={cn(
                  'gap-1.5',
                  reviewMode
                    ? 'bg-amber-700 hover:bg-amber-600 text-white'
                    : 'bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40'
                )}
                size="sm"
              >
                <History className="h-4 w-4" />
                {reviewMode ? 'Exit Review' : 'Review Game'}
              </Button>
            </div>
            )
          })()}
          {isActive && !isMyTurn && !isComputerTurn && !isApiTurn && (
            <div className={cn('text-amber-300 font-medium rounded-lg bg-amber-900/20', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
              Waiting for {currentTurnPlayer?.profiles.display_name} to play...
            </div>
          )}
          {isActive && isComputerTurn && currentComputerPlayer && (
            <div className={cn('text-amber-300 font-medium animate-pulse rounded-lg bg-amber-900/20', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
              {currentComputerPlayer.name} is thinking...
            </div>
          )}
          {isActive && isApiTurn && currentApiPlayer && (
            <div className={cn('text-purple-300 font-medium animate-pulse rounded-lg bg-purple-900/15', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
              Waiting for {currentApiPlayer.name} to play...
              {!isMobile && isSpectatingApi && <span className="text-amber-400/70 text-xs block mt-1 animate-none">You can suggest a move while you wait</span>}
            </div>
          )}
          {findWordsEnabled && !hideInstructionalBanner && (
            <div className="flex items-center gap-1 rounded-lg bg-sky-900/30 border border-sky-700/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowInstructional(v => !v)}
                className={cn('flex items-center gap-2 text-sky-200 font-medium hover:bg-sky-900/40 transition-colors', isMobile ? 'text-[11px] px-2 py-1' : 'text-xs px-3 py-1.5')}
                title="Toggle the word list. Hide it to find your own best play, then show it to check your work."
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {isMobile
                    ? (showInstructional ? 'Word list open' : 'Show word list')
                    : <>Instructional mode — {showInstructional ? 'word list open (click to hide)' : 'click to show the word list'}</>
                  }
                </span>
              </button>
              <button
                type="button"
                onClick={() => setHideInstructionalBanner(true)}
                className="text-sky-300/70 hover:text-sky-100 hover:bg-sky-900/50 px-1.5 py-1.5 transition-colors"
                aria-label="Dismiss instructional mode banner"
                title="Hide this banner (the toggle stays in the Scoreboard)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {isActive && isMyTurn && placedTiles.size === 0 && !hidePlayHint && (
            <div className="flex items-center gap-1 rounded-lg bg-green-900/15 overflow-hidden">
              <div className={cn('text-green-400 font-medium', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
                {selectedSquare
                  ? <>Tap tiles to place them {direction === 'across' ? '\u2192' : '\u2193'}</>
                  : <>Tap a square to start placing tiles</>
                }
              </div>
              <button
                type="button"
                onClick={() => setHidePlayHint(true)}
                className="text-green-400/70 hover:text-green-200 hover:bg-green-900/30 px-1.5 py-1.5 transition-colors"
                aria-label="Dismiss play hint"
                title="Hide this hint"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Blank tile chooser */}
          {blankTileTarget && <BlankTileDialog onChoose={handleBlankLetterChoice} />}
          {suggestionBlankTarget && <BlankTileDialog onChoose={handleSuggestionBlankChoice} />}

          <div className="relative">
            {/* Coordinate-label toggle. Stealth by default: the hover zone
                sits in the board's top-right corner and the button only
                fades in when the cursor is there (or the button has focus,
                for keyboard users). Stays visible when labels are on so
                you can find it again to turn them back off. Not a primary
                action — mostly useful when discussing a position with an
                LLM. */}
            <div className="group absolute top-0 right-0 z-10 h-10 w-16">
              <button
                onClick={() => setShowLabels(l => !l)}
                className={cn(
                  'absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium backdrop-blur-sm',
                  'transition-opacity duration-200',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400',
                  showLabels
                    ? 'bg-amber-700/70 text-amber-100 opacity-100 hover:bg-amber-700/90'
                    : 'bg-amber-950/70 text-amber-200 opacity-0 group-hover:opacity-90 focus-visible:opacity-100 hover:bg-amber-900/80'
                )}
                title="Toggle coordinate labels (A-O, 1-15)"
                aria-label="Toggle coordinate labels"
              >
                <Grid3X3 className="h-3 w-3" />
                A1
              </button>
            </div>
            <GameBoard
              board={reviewMode ? reviewBoard : board}
              selectedSquare={reviewMode ? null : isSpectatingApi ? suggestionSquare : selectedSquare}
              onSquareClick={reviewMode ? () => {} : isSpectatingApi ? handleSuggestionSquareClick : handleSquareClick}
              onDrop={reviewMode ? () => {} : handleDrop}
              onPickupTile={reviewMode ? () => {} : handlePickupTile}
              placedTiles={reviewMode ? new Map() : isSpectatingApi ? suggestionTiles : placedTiles}
              previewTiles={reviewMode ? undefined : previewedTiles}
              highlightTiles={reviewMode ? reviewHighlightTiles : undefined}
              direction={isSpectatingApi ? suggestionDirection : direction}
              showLabels={showLabels}
              cellSize={isMobile ? mobileCellSize : undefined}
            />
          </div>

          {reviewMode && (
            <ReviewControls
              moveHistory={moveHistory}
              reviewMoveIndex={reviewMoveIndex}
              setReviewMoveIndex={setReviewMoveIndex}
              reviewCurrentMove={reviewCurrentMove}
              reviewTiming={reviewTiming}
            />
          )}

          {/* Rack */}
          {isActive && myPlayer && (
            <div className={cn(isMobile ? 'space-y-1 mt-auto pb-2 w-full' : 'space-y-3')}>
              <TileRack
                tiles={rackTiles}
                onTileClick={handleRackTileClick}
                selectedTiles={exchangeSelection}
                isExchangeMode={isExchangeMode}
                onShuffle={handleShuffleRack}
                onReorder={handleReorderRack}
                onReturnFromBoard={handlePickupTile}
                tileSize={mobileTileSize}
              />

              {isMyTurn && (
                <GameControls
                  hasPlacedTiles={placedTiles.size > 0}
                  submitting={submitting}
                  isExchangeMode={isExchangeMode}
                  exchangeSelectionSize={exchangeSelection.size}
                  onSubmit={handleSubmitMove}
                  onRecall={handleRecall}
                  onToggleExchange={toggleExchangeMode}
                  onPass={handlePass}
                  onChallenge={handleChallenge}
                />
              )}
            </div>
          )}

          {/* Show computer rack when spectating (not a player) */}
          {isActive && !myPlayer && isComputerTurn && currentComputerPlayer && (
            <div className="space-y-2">
              <div className="text-center text-xs text-amber-400">
                {currentComputerPlayer.name}&apos;s rack:
              </div>
              <TileRack
                tiles={currentComputerPlayer.rack}
                onTileClick={() => {}}
                selectedTiles={new Set()}
                isExchangeMode={false}
              />
            </div>
          )}

          {isSpectatingApi && spectatingApiPlayer && (
            <SuggestionControls
              gameId={gameId}
              spectatingApiPlayerName={spectatingApiPlayer.name}
              suggestionRack={suggestionRack}
              suggestionTiles={suggestionTiles}
              suggestionSquare={suggestionSquare}
              previewedTiles={previewedTiles}
              onTileClick={handleSuggestionTileClick}
              onReturnFromBoard={handlePickupTile}
              clearSuggestion={clearSuggestion}
            />
          )}
        </div>

        {/* Per-game chat — desktop only (mobile uses drawer) */}
        {!isMobile && (
          <div className="w-full lg:w-72 shrink-0">
            <GameChatSidebar gameId={gameId} userId={userId} gameStatus={game.status} />
          </div>
        )}
      </main>
    </div>
  )
}
