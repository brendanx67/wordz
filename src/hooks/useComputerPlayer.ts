import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { loadDictionary } from '@/lib/trie'
import { generateAllMoves, selectMove } from '@/lib/moveGenerator'
import type { Difficulty } from '@/lib/moveGenerator'
import { drawTiles } from '@/lib/gameConstants'
import type { Tile, BoardCell } from '@/lib/gameConstants'
import { toast } from 'sonner'

const AI_PLAYER_ID = 'computer-player'

export function isComputerPlayer(playerId: string): boolean {
  return playerId === AI_PLAYER_ID
}

export function getComputerPlayerId(): string {
  return AI_PLAYER_ID
}

export function useComputerPlayer(gameId: string, difficulty: Difficulty = 'medium') {
  const queryClient = useQueryClient()
  const isThinking = useRef(false)

  const playComputerTurn = useCallback(async (
    board: BoardCell[][],
    computerRack: Tile[],
    tileBag: Tile[],
    turnOrder: string[],
    turnIndex: number,
    consecutivePasses: number,
    computerScore: number,
    allPlayers: { player_id: string; score: number; rack: Tile[] }[]
  ) => {
    if (isThinking.current) return
    isThinking.current = true

    try {
      toast.info('Computer is thinking...', { duration: 2000 })

      // Load dictionary (cached after first load)
      const trie = await loadDictionary()

      // Generate all possible moves
      const moves = generateAllMoves(board, computerRack, trie)

      // Select a move based on difficulty
      const selectedMoveResult = selectMove(moves, difficulty)

      if (!selectedMoveResult) {
        // No valid moves — pass
        const nextIndex = (turnIndex + 1) % turnOrder.length
        const newConsecutivePasses = consecutivePasses + 1
        const isGameOver = newConsecutivePasses >= turnOrder.length * 2

        const updates: Record<string, unknown> = {
          current_turn: turnOrder[nextIndex],
          turn_index: nextIndex,
          consecutive_passes: newConsecutivePasses,
          updated_at: new Date().toISOString(),
        }

        if (isGameOver) {
          updates.status = 'finished'
          const winner = allPlayers.reduce((best, p) =>
            p.score > best.score ? p : best, allPlayers[0])
          updates.winner = winner.player_id
        }

        updates.last_move = { player_id: AI_PLAYER_ID, type: 'pass' }
        await supabase.from('games').update(updates).eq('id', gameId)

        toast.info(isGameOver ? 'Game over!' : 'Computer passed (no valid moves)')
      } else {
        // Place tiles on the board
        const newBoard = board.map(row => row.map(cell => ({ ...cell })))
        for (const pt of selectedMoveResult.tiles) {
          newBoard[pt.row][pt.col] = {
            tile: pt.tile,
            bonus: newBoard[pt.row][pt.col].bonus,
            isNew: false,
          }
        }

        // Draw new tiles
        const { drawn, remaining } = drawTiles(tileBag, selectedMoveResult.tiles.length)
        const newRack = computerRack.filter(
          t => !selectedMoveResult.tiles.some(pt => pt.tile.id === t.id)
        )
        newRack.push(...drawn)

        const nextIndex = (turnIndex + 1) % turnOrder.length

        // Check game over (empty rack + empty bag)
        const gameOver = newRack.length === 0 && remaining.length === 0

        const gameUpdates: Record<string, unknown> = {
          board: newBoard,
          tile_bag: remaining,
          current_turn: turnOrder[nextIndex],
          turn_index: nextIndex,
          consecutive_passes: 0,
          last_move: {
            player_id: AI_PLAYER_ID,
            type: 'play',
            tiles: selectedMoveResult.tiles,
            words: selectedMoveResult.words,
            score: selectedMoveResult.totalScore,
          },
          updated_at: new Date().toISOString(),
        }

        let newScore = computerScore + selectedMoveResult.totalScore

        if (gameOver) {
          // End-game scoring
          let bonusFromOthers = 0
          const otherPlayers = allPlayers.filter(p => p.player_id !== AI_PLAYER_ID)
          for (const op of otherPlayers) {
            const rackValue = (op.rack ?? []).reduce((sum: number, t: Tile) => sum + t.value, 0)
            bonusFromOthers += rackValue
            await supabase.from('game_players').update({
              score: Math.max(0, op.score - rackValue),
            }).eq('game_id', gameId).eq('player_id', op.player_id)
          }
          newScore += bonusFromOthers

          const allScores = [
            { id: AI_PLAYER_ID, score: newScore },
            ...otherPlayers.map(op => ({
              id: op.player_id,
              score: Math.max(0, op.score - (op.rack ?? []).reduce((s: number, t: Tile) => s + t.value, 0)),
            })),
          ]
          const winner = allScores.reduce((best, p) => p.score > best.score ? p : best)
          gameUpdates.status = 'finished'
          gameUpdates.winner = winner.id
        }

        gameUpdates.computer_rack = newRack
        gameUpdates.computer_score = newScore

        await supabase.from('games').update(gameUpdates).eq('id', gameId)

        // Note: we don't insert into game_moves for computer because the FK requires
        // a profiles entry. The move is recorded in games.last_move instead.

        const wordList = selectedMoveResult.words.map(w => w.word).join(', ')
        toast.success(`Computer played ${wordList} for ${selectedMoveResult.totalScore} points!`)
      }

      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
      queryClient.invalidateQueries({ queryKey: ['game_moves', gameId] })
    } catch (err) {
      console.error('Computer player error:', err)
      toast.error('Computer player encountered an error')
    } finally {
      isThinking.current = false
    }
  }, [gameId, difficulty, queryClient])

  return { playComputerTurn, isThinking: isThinking.current }
}
