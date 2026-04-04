import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const AI_PLAYER_ID = 'computer-player'

export function isComputerPlayer(playerId: string): boolean {
  return playerId === AI_PLAYER_ID
}

export function getComputerPlayerId(): string {
  return AI_PLAYER_ID
}

export function useComputerPlayer(gameId: string, _difficulty: string = 'medium') {
  const queryClient = useQueryClient()
  const isThinking = useRef(false)

  const playComputerTurn = useCallback(async () => {
    if (isThinking.current) return
    isThinking.current = true

    try {
      toast.info('Computer is thinking...', { duration: 5000 })

      const { data, error } = await supabase.functions.invoke('computer-turn', {
        body: { game_id: gameId },
      })

      if (error) {
        console.error('Computer turn error:', error)
        toast.error('Computer player encountered an error')
        return
      }

      if (data.action === 'pass') {
        toast.info(data.game_over ? 'Game over!' : 'Computer passed (no valid moves)')
      } else if (data.action === 'play') {
        const wordList = data.words.join(', ')
        toast.success(`Computer played ${wordList} for ${data.score} points!`)
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
