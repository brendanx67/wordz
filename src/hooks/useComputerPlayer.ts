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
  const isThinking = useRef(false)

  const playComputerTurn = useCallback(async (computerPlayerId: string) => {
    if (isThinking.current) return
    isThinking.current = true

    try {
      const { data, error } = await supabase.functions.invoke('computer-turn', {
        body: { game_id: gameId, player_id: computerPlayerId },
      })

      if (error) {
        console.error('Computer turn error:', error)
        toast.error('Computer player encountered an error')
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
    } finally {
      isThinking.current = false
    }
  }, [gameId, queryClient])

  return { playComputerTurn, isThinking: isThinking.current }
}
