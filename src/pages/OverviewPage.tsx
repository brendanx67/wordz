import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Trophy, Swords, Users, Bot, Zap } from 'lucide-react'
import { useOverviewStats } from '@/hooks/useOverviewStats'

interface OverviewPageProps {
  onBack: () => void
}

export default function OverviewPage({ onBack }: OverviewPageProps) {
  const { data: stats, isLoading } = useOverviewStats()

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-amber-200 hover:text-white hover:bg-amber-700/50">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Lobby
          </Button>
          <h1 className="text-lg font-bold tracking-widest text-amber-400" style={{ fontFamily: "'Playfair Display', serif" }}>
            WORDZ
          </h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-10 max-w-3xl space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Swords className="h-4 w-4" />} label="Games Played" value={stats?.finishedGames} loading={isLoading} />
          <StatCard icon={<Zap className="h-4 w-4" />} label="Active Now" value={stats?.activeGames} loading={isLoading} />
          <StatCard icon={<Users className="h-4 w-4" />} label="Players" value={stats?.totalPlayers} loading={isLoading} />
          <StatCard icon={<Trophy className="h-4 w-4" />} label="Total Games" value={stats?.totalGames} loading={isLoading} />
        </div>

        {/* Top single moves */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-300 text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Highest Scoring Moves
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 bg-amber-900/20" />)}</div>
            ) : stats?.topMoves.length === 0 ? (
              <p className="text-amber-400/60 text-sm text-center py-4">No moves yet</p>
            ) : (
              <div className="space-y-1.5">
                {stats?.topMoves.map((move, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-amber-950/40 border border-amber-900/20">
                    <div className="flex items-center gap-3">
                      <span className="text-amber-500/60 text-xs w-5 text-right font-mono">{i + 1}.</span>
                      <div>
                        <span className="text-amber-200 text-sm font-medium">{move.words.join(', ')}</span>
                        <span className="text-amber-400/60 text-xs ml-2">by {move.playerName}</span>
                      </div>
                    </div>
                    <span className="text-amber-300 font-bold text-sm tabular-nums">{move.score}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top game scores */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-300 text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Highest Game Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 bg-amber-900/20" />)}</div>
            ) : stats?.topGameScores.length === 0 ? (
              <p className="text-amber-400/60 text-sm text-center py-4">No finished games yet</p>
            ) : (
              <div className="space-y-1.5">
                {stats?.topGameScores.map((game, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-amber-950/40 border border-amber-900/20">
                    <div className="flex items-center gap-3">
                      <span className="text-amber-500/60 text-xs w-5 text-right font-mono">{i + 1}.</span>
                      <span className="text-amber-200 text-sm">{game.playerName}</span>
                    </div>
                    <span className="text-amber-300 font-bold text-sm tabular-nums">{game.score} pts</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Player leaderboard */}
          <Card className="border-amber-900/30 bg-amber-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-amber-300 text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Human Players
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 bg-amber-900/20" />)}</div>
              ) : stats?.playerLeaderboard.length === 0 ? (
                <p className="text-amber-400/60 text-sm text-center py-4">No players yet</p>
              ) : (
                <div className="space-y-2">
                  {stats?.playerLeaderboard.map((player, i) => (
                    <div key={i} className="py-2 px-3 rounded-lg bg-amber-950/40 border border-amber-900/20">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-200 text-sm font-medium">{player.displayName}</span>
                        <span className="text-green-400 text-xs font-medium">
                          {player.gamesWon}W / {player.gamesPlayed - player.gamesWon}L
                        </span>
                      </div>
                      <div className="text-amber-400/60 text-xs mt-0.5">
                        {player.gamesPlayed} games | Avg {Math.round(player.totalScore / player.gamesPlayed)} pts
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Computer player stats */}
          <Card className="border-amber-900/30 bg-amber-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-amber-300 text-base flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Computer & LLM Players
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 bg-amber-900/20" />)}</div>
              ) : stats?.computerStats.length === 0 ? (
                <p className="text-amber-400/60 text-sm text-center py-4">No computer games yet</p>
              ) : (
                <div className="space-y-2">
                  {stats?.computerStats.map((cp, i) => (
                    <div key={i} className="py-2 px-3 rounded-lg bg-amber-950/40 border border-amber-900/20">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-200 text-sm font-medium">{cp.name}</span>
                        <span className="text-green-400 text-xs font-medium">
                          {cp.gamesWon}W / {cp.gamesPlayed - cp.gamesWon}L
                        </span>
                      </div>
                      <div className="text-amber-400/60 text-xs mt-0.5">
                        {cp.gamesPlayed} games | Avg {cp.avgScore} pts
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value?: number; loading: boolean }) {
  return (
    <Card className="border-amber-900/30 bg-amber-950/30">
      <CardContent className="p-4 flex flex-col items-center gap-1">
        <div className="text-amber-500/70">{icon}</div>
        {loading ? (
          <Skeleton className="h-7 w-12 bg-amber-900/20" />
        ) : (
          <span className="text-2xl font-bold text-amber-200 tabular-nums">{value ?? 0}</span>
        )}
        <span className="text-amber-400/60 text-xs">{label}</span>
      </CardContent>
    </Card>
  )
}
