import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function isComputerPlayer(playerId: string): boolean {
  return playerId.startsWith('computer-')
}

export function getComputerPlayerId(): string {
  return 'computer-1'
}

export function useComputerPlayer(gameId: string) {
  const queryClient = useQueryClient()
  // Track by per-turn key so we dedupe the same turn (StrictMode / rerender)
  // but NEVER block a new turn from firing. The previous `isThinking` boolean
  // could stay stuck across a turn boundary if a refetch raced the finally
  // block, deadlocking all-computer games. The key `${playerId}:${moveCount}`
  // is unique per turn, so a different turn is never mistaken for a duplicate.
  const triggeredKey = useRef<string | null>(null)

  const playComputerTurn = useCallback(async (computerPlayerId: string, turnKey?: string) => {
    if (turnKey && triggeredKey.current === turnKey) return
    if (turnKey) triggeredKey.current = turnKey

    try {
      const { data, error } = await supabase.functions.invoke('computer-turn', {
        body: { game_id: gameId, player_id: computerPlayerId },
      })

      if (error) {
        console.warn('Computer turn error (watchdog will retry):', error)
        if (turnKey) triggeredKey.current = null
        return
      }

      if (data.error) {
        console.error('Computer turn server error:', data.error)
        toast.error(`Computer player error: ${data.error}`)
        if (turnKey) triggeredKey.current = null
        return
      }

      if (data.action === 'pass') {
        toast.info(data.game_over ? 'Game over!' : `${data.player_name || 'Computer'} passed (no valid moves)`)
      } else if (data.action === 'play') {
        const wordList = data.words.join(', ')
        toast.success(`${data.player_name || 'Computer'} played ${wordList} for ${data.score} points!`)
      }

      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
      queryClient.invalidateQueries({ queryKey: ['game_moves', gameId] })
    } catch (err) {
      console.error('Computer player error:', err)
      toast.error('Computer player encountered an error')
      if (turnKey) triggeredKey.current = null
    }
  }, [gameId, queryClient])

  return { playComputerTurn }
}
