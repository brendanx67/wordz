import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useOpenGames, useMyGames, useCreateConfiguredGame, useJoinGame, useStartGame } from '@/hooks/useGames'
import type { ComputerPlayer } from '@/hooks/useGames'
import { useGameHistory } from '@/hooks/useGameHistory'
import { useState } from 'react'
import { LogOut, Plus, Play, Users, Clock, Trophy, History, Eye } from 'lucide-react'
import { toast } from 'sonner'
import CreateGameForm from '@/components/CreateGameForm'
import type { GameConfig } from '@/components/CreateGameForm'

function getDisplayName(profiles: { display_name: string } | { display_name: string }[] | null): string {
  if (!profiles) return 'Unknown'
  if (Array.isArray(profiles)) return profiles[0]?.display_name ?? 'Unknown'
  return profiles.display_name
}

interface LobbyPageProps {
  userId: string
  displayName: string
  onSignOut: () => void
  onOpenGame: (gameId: string) => void
}

export default function LobbyPage({ userId, displayName, onSignOut, onOpenGame }: LobbyPageProps) {
  const { data: openGames, isLoading: loadingOpen } = useOpenGames()
  const { data: myGames, isLoading: loadingMine } = useMyGames(userId)
  const { data: gameHistory, isLoading: loadingHistory } = useGameHistory(userId)
  const createConfiguredGame = useCreateConfiguredGame()
  const joinGame = useJoinGame()
  const startGame = useStartGame()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const handleCreateGame = async (config: GameConfig) => {
    try {
      const gameId = await createConfiguredGame.mutateAsync({ userId, config })
      setShowCreateForm(false)
      toast.success('Game created!')
      onOpenGame(gameId)
    } catch {
      toast.error('Failed to create game')
    }
  }

  const handleJoin = async (gameId: string) => {
    try {
      await joinGame.mutateAsync({ gameId, userId })
      toast.success('Joined the game!')
      onOpenGame(gameId)
    } catch {
      toast.error('Failed to join game')
    }
  }

  const handleStart = async (gameId: string) => {
    try {
      await startGame.mutateAsync(gameId)
      toast.success('Game started!')
      onOpenGame(gameId)
    } catch {
      toast.error('Failed to start game')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-widest text-amber-400" style={{ fontFamily: "'Playfair Display', serif" }}>
            WORDZ
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-amber-300/70 text-sm">{displayName}</span>
            <Button variant="ghost" size="sm" onClick={onSignOut} className="text-amber-500/60 hover:text-amber-300">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
        {/* Create Game */}
        {showCreateForm ? (
          <CreateGameForm
            onCreateGame={handleCreateGame}
            onCancel={() => setShowCreateForm(false)}
            isPending={createConfiguredGame.isPending}
          />
        ) : (
          <div className="flex justify-center">
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold text-lg px-8 py-6"
            >
              <Plus className="h-5 w-5 mr-2" />
              New Game
            </Button>
          </div>
        )}

        {/* My Active Games */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-300 flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              My Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMine ? (
              <div className="space-y-3">
                <Skeleton className="h-16 bg-amber-900/20" />
                <Skeleton className="h-16 bg-amber-900/20" />
              </div>
            ) : !myGames?.length ? (
              <p className="text-amber-600/60 text-center py-4">No active games. Create one or join from the lobby!</p>
            ) : (
              <div className="space-y-3">
                {myGames.map((game) => {
                  const players = game.game_players ?? []
                  const computerPlayers = (game.computer_players ?? []) as ComputerPlayer[]
                  const isCreator = game.created_by === userId
                  const isWaiting = game.status === 'waiting'
                  const isMyTurn = game.current_turn === userId
                  const isPlayer = players.some((p: { player_id: string }) => p.player_id === userId)
                  const isSpectator = !isPlayer && isCreator

                  // Build display names including computer players
                  const allNames: string[] = [
                    ...players.map((p: { profiles: unknown }) => getDisplayName(p.profiles as { display_name: string })),
                    ...computerPlayers.map(cp => cp.name),
                  ]

                  return (
                    <div
                      key={game.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-amber-950/40 border border-amber-900/20 hover:border-amber-700/40 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-amber-200 font-medium">
                            {allNames.join(' vs ')}
                          </span>
                          {isWaiting && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-800/40 text-amber-400">
                              <Clock className="h-3 w-3 inline mr-1" />
                              Waiting
                            </span>
                          )}
                          {isMyTurn && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-800/40 text-green-400 animate-pulse">
                              Your Turn!
                            </span>
                          )}
                          {isSpectator && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-800/40 text-blue-400">
                              <Eye className="h-3 w-3 inline mr-1" />
                              Spectating
                            </span>
                          )}
                        </div>
                        {!isWaiting && (
                          <div className="text-xs text-amber-600/60 mt-1">
                            {players.map((p: { profiles: unknown; score: number }) =>
                              `${getDisplayName(p.profiles as { display_name: string })}: ${p.score}`
                            ).join(' | ')}
                            {computerPlayers.map(cp => ` | ${cp.name}: ${cp.score}`).join('')}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {isWaiting && isCreator && players.length >= 2 && (
                          <Button
                            size="sm"
                            onClick={() => handleStart(game.id)}
                            className="bg-green-700 hover:bg-green-600 text-white"
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenGame(game.id)}
                          className="border-amber-700/40 text-amber-300 hover:bg-amber-800/30"
                        >
                          {isSpectator ? (
                            <><Eye className="h-4 w-4 mr-1" /> Watch</>
                          ) : isWaiting ? 'View' : 'Play'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Games Lobby */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-300 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Open Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOpen ? (
              <div className="space-y-3">
                <Skeleton className="h-16 bg-amber-900/20" />
              </div>
            ) : !openGames?.length ? (
              <p className="text-amber-600/60 text-center py-4">No open games right now. Be the first to create one!</p>
            ) : (
              <div className="space-y-3">
                {openGames
                  .filter(g => !g.game_players?.some((p: { player_id: string }) => p.player_id === userId))
                  .map((game) => {
                    const players = game.game_players ?? []
                    return (
                      <div
                        key={game.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-amber-950/40 border border-amber-900/20"
                      >
                        <div>
                          <span className="text-amber-200">
                            {players.map((p: { profiles: unknown }) => getDisplayName(p.profiles as { display_name: string })).join(', ')}
                          </span>
                          <span className="text-amber-600/60 text-sm ml-2">({players.length}/4 players)</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleJoin(game.id)}
                          disabled={joinGame.isPending || players.length >= 4}
                          className="bg-amber-700 hover:bg-amber-600 text-amber-50"
                        >
                          {joinGame.isPending ? 'Joining...' : 'Join'}
                        </Button>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Game History */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-300 flex items-center gap-2">
              <History className="h-5 w-5" />
              Game History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="space-y-3">
                <Skeleton className="h-16 bg-amber-900/20" />
              </div>
            ) : !gameHistory?.length ? (
              <p className="text-amber-600/60 text-center py-4">No completed games yet. Play some rounds!</p>
            ) : (
              <div className="space-y-3">
                {gameHistory.map((game) => {
                  const players = game.game_players ?? []
                  const cpuPlayers = (game.computer_players ?? []) as ComputerPlayer[]
                  const isPlayer = players.some((p: { player_id: string }) => p.player_id === userId)
                  const didWin = game.winner === userId
                  const isSpectatorGame = !isPlayer

                  // Build scores display combining humans and computers
                  const allScores: string[] = [
                    ...players.map((p: { profiles: unknown; score: number }) =>
                      `${getDisplayName(p.profiles as { display_name: string })}: ${p.score}`
                    ),
                    ...cpuPlayers.map(cp => `${cp.name}: ${cp.score}`),
                  ]

                  // Find winner name
                  const humanWinner = players.find((p: { player_id: string }) => p.player_id === game.winner)
                  const cpuWinner = cpuPlayers.find(cp => cp.id === game.winner)
                  const winnerDisplay = humanWinner
                    ? getDisplayName((humanWinner as { profiles: unknown }).profiles as { display_name: string })
                    : cpuWinner?.name ?? 'Unknown'

                  return (
                    <div
                      key={game.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-amber-950/40 border border-amber-900/20"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          {isSpectatorGame ? (
                            <span className="text-blue-400/70 font-medium">Spectated</span>
                          ) : (
                            <span className={didWin ? 'text-green-400 font-medium' : 'text-red-400/70 font-medium'}>
                              {didWin ? 'Won!' : 'Lost'}
                            </span>
                          )}
                          <span className="text-amber-200/70 text-sm">
                            {allScores.join(' | ')}
                          </span>
                        </div>
                        <div className="text-xs text-amber-600/50 mt-1">
                          {new Date(game.updated_at).toLocaleDateString()} — Winner: {winnerDisplay}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenGame(game.id)}
                        className="border-amber-700/40 text-amber-300 hover:bg-amber-800/30"
                      >
                        Review
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
