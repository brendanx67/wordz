import { useState, useCallback, useEffect, useMemo } from 'react'
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
import { ArrowLeft, RotateCcw, Send, Flag, RefreshCw, Play, History, LogOut } from 'lucide-react'
import { createEmptyBoard } from '@/lib/gameConstants'
import GameHistoryViewer from '@/components/GameHistoryViewer'
import { cn } from '@/lib/utils'
import { useGameRealtime } from '@/hooks/useGameRealtime'
import { useComputerPlayer } from '@/hooks/useComputerPlayer'

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

  // Trigger computer's turn automatically via Edge Function
  useEffect(() => {
    if (!game || !isActive || !isComputerTurn) return
    const cpId = game.current_turn as string
    const delay = Math.max(1500, (game.computer_delay ?? 0) * 1000)

    const timer = setTimeout(() => {
      playComputerTurn(cpId)
    }, delay)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.current_turn, game?.status])

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
  }, [board, placedTiles])

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

  const handleDrop = useCallback((row: number, col: number, tile: Tile) => {
    if (!isMyTurn || !isActive) return
    placeTileOnBoard(row, col, tile)
  }, [isMyTurn, isActive, placeTileOnBoard])

  // Keyboard support: type letters to place tiles
  useEffect(() => {
    if (!isMyTurn || !isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Blank tile letter selection
      if (blankTileTarget) {
        if (/^[a-zA-Z]$/.test(e.key)) {
          handleBlankLetterChoice(e.key)
        } else if (e.key === 'Escape') {
          setBlankTileTarget(null)
        }
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setDirection(e.key === 'ArrowDown' ? 'down' : 'across')
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        // Remove the last placed tile
        const entries = Array.from(placedTiles.entries())
        if (entries.length > 0) {
          const lastKey = entries[entries.length - 1][0]
          setPlacedTiles(prev => {
            const next = new Map(prev)
            next.delete(lastKey)
            return next
          })
          // Move selection back
          const [r, c] = lastKey.split(',').map(Number)
          setSelectedSquare({ row: r, col: c })
        }
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (placedTiles.size > 0) handleSubmitMove()
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        handleRecall()
        return
      }

      if (!selectedSquare) return

      const letter = e.key.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return
      e.preventDefault()

      // Find a matching tile in the rack
      const matchingTile = rackTiles.find(t => t.letter === letter)
      // Also check for blank tiles if no regular match
      const tileToPlace = matchingTile || rackTiles.find(t => t.isBlank)
      if (!tileToPlace) return

      if (tileToPlace.isBlank) {
        // For blank, assign the typed letter
        const blankAsLetter: Tile = { ...tileToPlace, letter, value: 0 }
        setPlacedTiles(prev => {
          const next = new Map(prev)
          next.set(`${selectedSquare.row},${selectedSquare.col}`, blankAsLetter)
          return next
        })
      } else {
        placeTileOnBoard(selectedSquare.row, selectedSquare.col, tileToPlace)
      }

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

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, isActive, selectedSquare, direction, rackTiles, placedTiles, board, blankTileTarget])

  const handleRecall = () => {
    setPlacedTiles(new Map())
    setSelectedSquare(null)
  }

  const handlePickupTile = useCallback((row: number, col: number) => {
    const key = `${row},${col}`
    if (placedTiles.has(key)) {
      setPlacedTiles(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    }
  }, [placedTiles])

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
        // End-game scoring: deduct remaining tile values from other players, add to this player
        let bonusFromOthers = 0
        const otherPlayers = players.filter(p => p.player_id !== userId)
        for (const op of otherPlayers) {
          const opRack = (op.rack ?? []) as Tile[]
          const rackValue = opRack.reduce((sum, t) => sum + t.value, 0)
          bonusFromOthers += rackValue
          await supabase.from('game_players').update({
            score: Math.max(0, op.score - rackValue),
          }).eq('game_id', gameId).eq('player_id', op.player_id)
        }

        const finalScore = myNewScore + bonusFromOthers
        await supabase.from('game_players').update({ score: finalScore })
          .eq('game_id', gameId).eq('player_id', userId)

        // Find winner (highest score)
        const allScores = [
          { id: userId, score: finalScore },
          ...otherPlayers.map(op => {
            const opRack = (op.rack ?? []) as Tile[]
            const rackValue = opRack.reduce((sum, t) => sum + t.value, 0)
            return { id: op.player_id, score: Math.max(0, op.score - rackValue) }
          }),
        ]
        const winner = allScores.reduce((best, p) => p.score > best.score ? p : best)

        await supabase.from('games').update({
          status: 'finished',
          winner: winner.id,
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
        // Determine winner by score
        const players = game.game_players ?? []
        const winner = players.reduce((best, p) =>
          p.score > best.score ? p : best, players[0])
        updates.winner = winner.player_id
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
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
      {/* Header */}
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-3 py-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-amber-400/80 hover:text-amber-200">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Lobby
          </Button>
          <h1 className="text-lg font-bold tracking-widest text-amber-400" style={{ fontFamily: "'Playfair Display', serif" }}>
            WORDZ
          </h1>
          <div className="flex items-center gap-3">
            {computerPlayers.some(cp => cp.id.startsWith('api-')) && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(gameId)
                  toast.success('Game ID copied!')
                }}
                className="text-[10px] text-purple-300/70 hover:text-purple-200 font-mono cursor-pointer"
                title="Click to copy game ID for API/MCP use"
              >
                ID: {gameId.slice(0, 8)}...
              </button>
            )}
            <span className="text-xs text-amber-400/70">
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
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20 text-xs"
              >
                <LogOut className="h-3 w-3 mr-1" />
                Resign
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-2 py-4 flex flex-col lg:flex-row gap-4 items-start justify-center">
        {/* Scoreboard sidebar */}
        <Card className="border-amber-900/30 bg-amber-950/30 w-full lg:w-56 shrink-0">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-amber-300 text-sm">Scoreboard</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {players.map((p) => (
              <div
                key={p.player_id}
                className={cn(
                  'flex items-center justify-between py-2 px-3 rounded-lg transition-colors',
                  p.player_id === game.current_turn && 'bg-amber-800/20 ring-1 ring-amber-600/30'
                )}
              >
                <div>
                  <div className={cn(
                    'font-medium text-sm',
                    p.player_id === game.current_turn ? 'text-amber-100' : 'text-amber-300'
                  )}>
                    {p.profiles.display_name}
                    {p.player_id === userId && ' (you)'}
                  </div>
                  {p.player_id === game.current_turn && isActive && (
                    <div className="text-[10px] text-green-400 animate-pulse">Playing...</div>
                  )}
                </div>
                <span className="text-xl font-bold text-amber-300" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {p.score}
                </span>
              </div>
            ))}
            {/* Computer players in scoreboard */}
            {computerPlayers.map((cp) => (
              <div
                key={cp.id}
                className={cn(
                  'flex items-center justify-between py-2 px-3 rounded-lg transition-colors',
                  game.current_turn === cp.id && 'bg-amber-800/20 ring-1 ring-amber-600/30'
                )}
              >
                <div>
                  <div className={cn(
                    'font-medium text-sm',
                    game.current_turn === cp.id ? 'text-amber-100' : 'text-amber-300'
                  )}>
                    {cp.name}
                  </div>
                  {game.current_turn === cp.id && isActive && (
                    <div className="text-[10px] text-green-400 animate-pulse">Thinking...</div>
                  )}
                </div>
                <span className="text-xl font-bold text-amber-300" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {cp.score}
                </span>
              </div>
            ))}
          </CardContent>

          {/* Recent moves */}
          {game.move_history && (game.move_history as unknown[]).length > 0 && !showHistory && (
            <CardContent className="px-4 pb-4 border-t border-amber-900/20 pt-3">
              <p className="text-amber-300 text-xs font-medium mb-2">Recent Moves</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {([...(game.move_history as { player_name: string; type: string; words?: { word: string; score: number }[]; score?: number }[])].reverse().slice(0, 10)).map((m, i) => (
                  <div key={i} className="text-xs text-amber-400/80">
                    <span className="text-amber-200">{m.player_name}</span>
                    {m.type === 'play' && (
                      <> played {m.words?.map(w => w.word).join(', ')} for <span className="text-amber-200">{m.score}</span> pts</>
                    )}
                    {m.type === 'pass' && <> passed</>}
                    {m.type === 'exchange' && <> exchanged tiles</>}
                  </div>
                ))}
              </div>
            </CardContent>
          )}

          {/* History toggle */}
          <CardContent className="px-4 pb-4 border-t border-amber-900/20 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full text-amber-300 hover:text-amber-200 hover:bg-amber-900/20 text-xs"
            >
              <History className="h-3 w-3 mr-1" />
              {showHistory ? 'Hide History' : 'Game History'}
            </Button>
          </CardContent>
        </Card>

        {/* Game History Viewer */}
        {showHistory && (
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
        <div className="flex flex-col items-center gap-4">
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
          {game.status === 'finished' && (
            <div className="px-8 py-3 rounded-lg text-center border border-amber-600/40" style={{ background: 'linear-gradient(135deg, #5c3a1e 0%, #4a2e15 100%)', boxShadow: '0 0 0 2px #6b4226, 0 4px 16px rgba(0,0,0,0.3)' }}>
              <div className="text-xl font-bold text-amber-300" style={{ fontFamily: "'Playfair Display', serif" }}>Game Over!</div>
              <div className="text-sm mt-1 text-amber-200/80">
                Winner: {
                  players.find(p => p.player_id === game.winner)?.profiles.display_name
                  ?? computerPlayers.find(cp => cp.id === game.winner)?.name
                  ?? 'Unknown'
                }
              </div>
            </div>
          )}
          {isActive && !isMyTurn && !isComputerTurn && (
            <div className="text-amber-300 text-sm font-medium px-4 py-2 rounded-lg bg-amber-900/20">
              Waiting for {currentTurnPlayer?.profiles.display_name} to play...
            </div>
          )}
          {isActive && isComputerTurn && currentComputerPlayer && (
            <div className="text-amber-300 text-sm font-medium animate-pulse px-4 py-2 rounded-lg bg-amber-900/20">
              {currentComputerPlayer.name} is thinking...
            </div>
          )}
          {isActive && isApiTurn && currentApiPlayer && (
            <div className="text-purple-300 text-sm font-medium animate-pulse px-4 py-2 rounded-lg bg-purple-900/15">
              Waiting for {currentApiPlayer.name} to play...
            </div>
          )}
          {isActive && isMyTurn && (
            <div className="text-green-400 text-sm font-medium px-4 py-2 rounded-lg bg-green-900/15">
              Your turn &mdash; place tiles on the board
            </div>
          )}

          {/* Blank tile chooser */}
          {blankTileTarget && (
            <div className="bg-amber-950/90 border border-amber-700/50 rounded-lg p-4 text-center">
              <p className="text-amber-200 text-sm mb-2">Choose a letter for the blank tile:</p>
              <div className="flex flex-wrap gap-1 justify-center max-w-xs">
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
                  <button
                    key={letter}
                    onClick={() => handleBlankLetterChoice(letter)}
                    className="w-8 h-8 rounded bg-amber-800/40 text-amber-200 hover:bg-amber-700/60 text-sm font-bold transition-colors"
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>
          )}

          <GameBoard
            board={board}
            selectedSquare={selectedSquare}
            onSquareClick={handleSquareClick}
            onDrop={handleDrop}
            onPickupTile={handlePickupTile}
            placedTiles={placedTiles}
            direction={direction}
          />

          {/* Rack */}
          {isActive && myPlayer && (
            <div className="space-y-3">
              <TileRack
                tiles={rackTiles}
                onTileClick={handleRackTileClick}
                selectedTiles={exchangeSelection}
                isExchangeMode={isExchangeMode}
                onShuffle={handleShuffleRack}
                onReorder={handleReorderRack}
                onReturnFromBoard={handlePickupTile}
              />

              {/* Action buttons */}
              {isMyTurn && (
                <div className="flex gap-2 justify-center flex-wrap">
                  {placedTiles.size > 0 && (
                    <>
                      <Button
                        onClick={handleSubmitMove}
                        disabled={submitting}
                        className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5"
                      >
                        <Send className="h-4 w-4 mr-1" />
                        {submitting ? 'Submitting...' : 'Submit Word'}
                      </Button>
                      <Button
                        onClick={handleRecall}
                        className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold"
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Recall
                      </Button>
                    </>
                  )}
                  {placedTiles.size === 0 && (
                    <>
                      <Button
                        onClick={toggleExchangeMode}
                        className={isExchangeMode
                          ? 'bg-red-800 hover:bg-red-700 text-white font-semibold'
                          : 'bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold'
                        }
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        {isExchangeMode ? 'Cancel Exchange' : 'Exchange'}
                      </Button>
                      {isExchangeMode && exchangeSelection.size > 0 && (
                        <Button
                          onClick={handlePass}
                          disabled={submitting}
                          className="bg-amber-700 hover:bg-amber-600 text-white font-semibold"
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Exchange {exchangeSelection.size} tile(s)
                        </Button>
                      )}
                      {!isExchangeMode && (
                        <>
                          <Button
                            onClick={handlePass}
                            disabled={submitting}
                            className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold"
                          >
                            <Flag className="h-4 w-4 mr-1" />
                            Pass
                          </Button>
                          <Button
                            onClick={handleChallenge}
                            className="bg-red-900/60 hover:bg-red-800/70 text-red-200 border border-red-700/40 font-semibold"
                          >
                            Challenge
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
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

          {/* Show API player racks for the owning user */}
          {isActive && myApiPlayers.length > 0 && myApiPlayers.map(ap => (
            <div key={ap.id} className="space-y-2">
              <div className="text-center text-xs text-purple-300">
                {ap.name}&apos;s rack:
              </div>
              <TileRack
                tiles={ap.rack}
                onTileClick={() => {}}
                selectedTiles={new Set()}
                isExchangeMode={false}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
