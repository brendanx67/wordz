import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface TopMove {
  score: number
  words: string[]
  playerName: string
}

interface TopGame {
  score: number
  playerName: string
  gameId: string
}

interface PlayerStats {
  displayName: string
  gamesPlayed: number
  gamesWon: number
  totalScore: number
}

interface ComputerStats {
  name: string
  gamesPlayed: number
  gamesWon: number
  avgScore: number
}

export interface OverviewStats {
  totalGames: number
  finishedGames: number
  activeGames: number
  totalPlayers: number
  topMoves: TopMove[]
  topGameScores: TopGame[]
  playerLeaderboard: PlayerStats[]
  computerStats: ComputerStats[]
}

export function useOverviewStats() {
  return useQuery({
    queryKey: ['overview-stats'],
    queryFn: async (): Promise<OverviewStats> => {
      // Run queries in parallel
      const [gamesRes, movesRes, playersRes, profilesRes] = await Promise.all([
        supabase
          .from('games')
          .select('id, status, winner, computer_players, game_players(player_id, score)')
          .eq('status', 'finished'),
        supabase
          .from('game_moves')
          .select('score, words_formed, player_id, profiles:player_id(display_name)')
          .eq('move_type', 'play')
          .gt('score', 0)
          .order('score', { ascending: false })
          .limit(10),
        supabase
          .from('game_players')
          .select('player_id, score, game_id, games!inner(status)')
          .eq('games.status', 'finished'),
        supabase
          .from('profiles')
          .select('id, display_name'),
      ])

      const games = gamesRes.data ?? []
      const moves = movesRes.data ?? []
      const playerRows = playersRes.data ?? []
      const profiles = profilesRes.data ?? []

      const profileMap = new Map(profiles.map(p => [p.id, p.display_name]))

      // Active games count
      const { count: activeCount } = await supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')

      // Top moves
      const topMoves: TopMove[] = moves.map(m => {
        const p = m.profiles as { display_name: string } | { display_name: string }[] | null
        const name = p ? (Array.isArray(p) ? p[0]?.display_name : p.display_name) : 'Unknown'
        return {
          score: m.score,
          words: (m.words_formed ?? []) as string[],
          playerName: name,
        }
      })

      // Top game scores
      const topGameScores: TopGame[] = playerRows
        .map(r => ({
          score: r.score,
          playerName: profileMap.get(r.player_id) ?? 'Unknown',
          gameId: r.game_id,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)

      // Player leaderboard
      const playerMap = new Map<string, { gamesPlayed: number; gamesWon: number; totalScore: number }>()
      for (const row of playerRows) {
        const entry = playerMap.get(row.player_id) ?? { gamesPlayed: 0, gamesWon: 0, totalScore: 0 }
        entry.gamesPlayed++
        entry.totalScore += row.score
        playerMap.set(row.player_id, entry)
      }
      // Count wins
      for (const game of games) {
        if (game.winner && playerMap.has(game.winner)) {
          playerMap.get(game.winner)!.gamesWon++
        }
      }
      const playerLeaderboard: PlayerStats[] = Array.from(playerMap.entries())
        .map(([id, stats]) => ({
          displayName: profileMap.get(id) ?? 'Unknown',
          ...stats,
        }))
        .sort((a, b) => b.gamesWon - a.gamesWon || b.totalScore - a.totalScore)

      // Computer player stats from JSONB
      const cpMap = new Map<string, { gamesPlayed: number; gamesWon: number; totalScore: number }>()
      for (const game of games) {
        const cps = (game.computer_players ?? []) as { id: string; name: string; score: number }[]
        for (const cp of cps) {
          // Normalize the name: strip "(on behalf of ...)" for grouping
          const baseName = cp.name.replace(/\s*\(on behalf of .*\)$/, '')
          // Group by base name (e.g., "Computer 1 (Easy)" or "Claude")
          const key = cp.id.startsWith('api-') ? 'LLM Players' : baseName
          const entry = cpMap.get(key) ?? { gamesPlayed: 0, gamesWon: 0, totalScore: 0 }
          entry.gamesPlayed++
          entry.totalScore += cp.score
          if (game.winner === cp.id) entry.gamesWon++
          cpMap.set(key, entry)
        }
      }
      const computerStats: ComputerStats[] = Array.from(cpMap.entries())
        .map(([name, stats]) => ({
          name,
          ...stats,
          avgScore: stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0,
        }))
        .sort((a, b) => b.gamesPlayed - a.gamesPlayed)

      return {
        totalGames: games.length + (activeCount ?? 0),
        finishedGames: games.length,
        activeGames: activeCount ?? 0,
        totalPlayers: profiles.length,
        topMoves,
        topGameScores,
        playerLeaderboard,
        computerStats,
      }
    },
    staleTime: 30_000,
  })
}
