import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { validateAndScoreMove } from '@/lib/scoring'
import { drawTiles } from '@/lib/gameConstants'
import type { Tile, BoardCell, PlacedTile } from '@/lib/gameConstants'
import type { ComputerPlayer } from '@/hooks/useGames'
import { toast } from 'sonner'

// Extracted from GamePage.tsx (#16 refactor). Contains all move mutation
// logic: play, pass, exchange, and challenge.

interface UseMoveMutationsArgs {
  gameId: string
  userId: string
  game: {
    tile_bag: unknown
    turn_order: unknown
    turn_index: number
    consecutive_passes: number
    move_history: unknown
    last_move: unknown
    has_computer: boolean
    game_players: { player_id: string; score: number; rack: unknown; profiles: { display_name: string } }[] | null
    board: unknown
    current_turn: string | null | undefined
  } | null | undefined
  board: BoardCell[][]
  isFirstMove: boolean
  isMyTurn: boolean
  fullRack: Tile[]
  rackTiles: Tile[]
  computerPlayers: ComputerPlayer[]
  placedTiles: Map<string, Tile>
  setPlacedTiles: (v: Map<string, Tile>) => void
  setSelectedSquare: (v: { row: number; col: number } | null) => void
  setStagedFindWordsKey: (v: string | null) => void
  isExchangeMode: boolean
  setIsExchangeMode: (v: boolean) => void
  exchangeSelection: Set<string>
  setExchangeSelection: (v: Set<string>) => void
}

export function useMoveMutations({
  gameId,
  userId,
  game,
  board,
  isFirstMove,
  isMyTurn,
  fullRack,
  rackTiles,
  computerPlayers,
  placedTiles,
  setPlacedTiles,
  setSelectedSquare,
  setStagedFindWordsKey,
  isExchangeMode,
  setIsExchangeMode,
  exchangeSelection,
  setExchangeSelection,
}: UseMoveMutationsArgs) {
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  const players = game?.game_players ?? []
  const myPlayer = players.find(p => p.player_id === userId)

  const invalidateGame = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['game', gameId] })
    queryClient.invalidateQueries({ queryKey: ['game_moves', gameId] })
  }, [queryClient, gameId])

  const handleSubmitMove = useCallback(async () => {
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
        rack_before: fullRack,
        rack_snapshot: fullRack.map(t => ({ letter: t.letter, value: t.value, isBlank: t.isBlank })),
        board_snapshot: newBoard,
        timestamp: new Date().toISOString(),
      }
      const updatedHistory = [...(game.move_history as unknown[] ?? []), moveHistoryEntry]

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
        let bonusFromOthers = 0

        const otherHumans = players.filter(p => p.player_id !== userId)
        for (const op of otherHumans) {
          const opRack = (op.rack ?? []) as Tile[]
          const rackValue = opRack.reduce((sum, t) => sum + t.value, 0)
          bonusFromOthers += rackValue
          await supabase.from('game_players').update({
            score: Math.max(0, op.score - rackValue),
          }).eq('game_id', gameId).eq('player_id', op.player_id)
        }

        const adjustedComputerPlayers = computerPlayers.map(cp => {
          const cpRack = (cp.rack ?? []) as Tile[]
          const rackValue = cpRack.reduce((sum, t) => sum + t.value, 0)
          bonusFromOthers += rackValue
          return { ...cp, score: Math.max(0, cp.score - rackValue) }
        })

        const finalScore = myNewScore + bonusFromOthers
        await supabase.from('game_players').update({ score: finalScore })
          .eq('game_id', gameId).eq('player_id', userId)

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
        toast.success(`${result.words.map(w => w.word).join(', ')} — ${result.totalScore} points!`)
      }
      // Optimistically update the query cache BEFORE clearing the local
      // overlay so the board doesn't flash back to the pre-move state.
      queryClient.setQueryData(['game', gameId], (old: Record<string, unknown> | undefined) => {
        if (!old) return old
        return {
          ...old,
          board: newBoard,
          tile_bag: remaining,
          current_turn: nextPlayer,
          turn_index: nextIndex,
          consecutive_passes: 0,
          move_history: updatedHistory,
          game_players: (old.game_players as { player_id: string }[] | undefined)?.map(p =>
            p.player_id === userId ? { ...p, rack: newRack, score: (myPlayer?.score ?? 0) + result.totalScore } : p
          ),
        }
      })
      setPlacedTiles(new Map())
      setSelectedSquare(null)
      invalidateGame()
    } catch (err) {
      toast.error('Failed to submit move')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }, [game, isMyTurn, placedTiles, board, isFirstMove, rackTiles, fullRack, userId, myPlayer, players, computerPlayers, gameId, setPlacedTiles, setSelectedSquare, invalidateGame])

  const handlePass = useCallback(async () => {
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
        for (let i = newBag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newBag[i], newBag[j]] = [newBag[j], newBag[i]]
        }

        const turnOrder = game.turn_order as string[]
        const nextIndex = (game.turn_index + 1) % turnOrder.length

        const exchangeHistoryEntry = {
          player_id: userId,
          player_name: myPlayer?.profiles?.display_name ?? 'Player',
          type: 'exchange',
          rack_before: fullRack,
          board_snapshot: board,
          timestamp: new Date().toISOString(),
        }

        await supabase.from('games').update({
          tile_bag: newBag,
          current_turn: turnOrder[nextIndex],
          turn_index: nextIndex,
          consecutive_passes: game.consecutive_passes + 1,
          move_history: [...(game.move_history as unknown[] ?? []), exchangeHistoryEntry],
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
        invalidateGame()
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
      const isGameOver = newConsecutivePasses >= turnOrder.length * 2

      const passHistoryEntry = {
        player_id: userId,
        player_name: myPlayer?.profiles?.display_name ?? 'Player',
        type: 'pass',
        rack_before: fullRack,
        rack_snapshot: fullRack.map(t => ({ letter: t.letter, value: t.value, isBlank: t.isBlank })),
        board_snapshot: board,
        timestamp: new Date().toISOString(),
      }

      const updates: Record<string, unknown> = {
        current_turn: turnOrder[nextIndex],
        turn_index: nextIndex,
        consecutive_passes: newConsecutivePasses,
        move_history: [...(game.move_history as unknown[] ?? []), passHistoryEntry],
        updated_at: new Date().toISOString(),
      }

      if (isGameOver) {
        updates.status = 'finished'
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
      invalidateGame()
    } catch {
      toast.error('Failed to pass')
    } finally {
      setSubmitting(false)
    }
  }, [game, isMyTurn, isExchangeMode, exchangeSelection, fullRack, board, userId, myPlayer, computerPlayers, gameId, setExchangeSelection, setIsExchangeMode, invalidateGame])

  const handleChallenge = useCallback(async () => {
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
        const newBoard = board.map(row => row.map(cell => ({ ...cell })))
        for (const pt of lastMove.tiles) {
          newBoard[pt.row][pt.col] = {
            tile: null,
            bonus: newBoard[pt.row][pt.col].bonus,
            isNew: false,
          }
        }

        const challengedPlayer = (game.game_players ?? []).find(p => p.player_id === lastMove.player_id)
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

        toast.error('Challenge failed! All words are valid. You lose your turn.')
      }

      invalidateGame()
    } catch {
      toast.error('Failed to validate challenge')
    } finally {
      setSubmitting(false)
    }
  }, [game, userId, board, gameId, invalidateGame])

  const toggleExchangeMode = useCallback(() => {
    setIsExchangeMode(!isExchangeMode)
    setExchangeSelection(new Set())
    setPlacedTiles(new Map())
    setSelectedSquare(null)
    setStagedFindWordsKey(null)
  }, [isExchangeMode, setIsExchangeMode, setExchangeSelection, setPlacedTiles, setSelectedSquare, setStagedFindWordsKey])

  return {
    submitting,
    handleSubmitMove,
    handlePass,
    handleChallenge,
    toggleExchangeMode,
  }
}
