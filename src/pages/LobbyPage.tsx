import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useOpenGames, useMyGames, useCreateConfiguredGame, useJoinGame, useStartGame, useCancelGame } from '@/hooks/useGames'
import type { ComputerPlayer } from '@/hooks/useGames'
import { useGameHistory } from '@/hooks/useGameHistory'
import { useState, useCallback } from 'react'
import { LogOut, Plus, Play, Users, Clock, Trophy, History, Eye, X, Sparkles, Bot, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
  const cancelGame = useCancelGame()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [ignoredGames, setIgnoredGames] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('wordz-ignored-games')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const handleIgnoreGame = useCallback((gameId: string) => {
    setIgnoredGames(prev => {
      const next = new Set(prev)
      next.add(gameId)
      localStorage.setItem('wordz-ignored-games', JSON.stringify([...next]))
      return next
    })
  }, [])

  const [apiKeysToShow, setApiKeysToShow] = useState<{ gameId: string; keys: { playerName: string; playerId: string; apiKey: string }[] } | null>(null)

  const handleCreateGame = async (config: GameConfig) => {
    try {
      const result = await createConfiguredGame.mutateAsync({ userId, config, displayName })
      setShowCreateForm(false)
      if (result.apiKeys.length > 0) {
        setApiKeysToShow({ gameId: result.gameId, keys: result.apiKeys })
        toast.success('Game created! Copy the API keys below.')
      } else {
        toast.success('Game created!')
        onOpenGame(result.gameId)
      }
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
        {/* API Keys Display */}
        {apiKeysToShow && (
          <Card className="border-purple-700/40 bg-purple-950/30 w-full max-w-lg mx-auto">
            <CardHeader className="pb-3">
              <CardTitle className="text-purple-300 text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                API Keys for LLM Players
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-amber-400/70 text-sm">
                Copy these API keys and use them to connect an LLM to this game. Each key is shown only once.
              </p>
              {apiKeysToShow.keys.map((ak) => (
                <div key={ak.playerId} className="space-y-1.5">
                  <Label className="text-purple-300/80 text-xs">{ak.playerName}</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={ak.apiKey}
                      className="bg-purple-950/60 border-purple-800/30 text-purple-200 font-mono text-xs"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(ak.apiKey)
                        toast.success('API key copied!')
                      }}
                      className="bg-purple-800/60 hover:bg-purple-700/70 text-purple-200 shrink-0"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              ))}
              <div className="pt-2 space-y-2">
                <p className="text-amber-500/60 text-xs">
                  API endpoint: <code className="text-amber-300/70">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api</code>
                </p>
                <p className="text-amber-500/60 text-xs">
                  Use header: <code className="text-amber-300/70">x-api-key: {'<key>'}</code>
                </p>
              </div>
              <Button
                onClick={() => {
                  const gid = apiKeysToShow.gameId
                  setApiKeysToShow(null)
                  onOpenGame(gid)
                }}
                className="w-full bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold"
              >
                Continue to Game
              </Button>
            </CardContent>
          </Card>
        )}

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
                          onClick={() => onOpenGame(game.id)}
                          className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold"
                        >
                          {isSpectator ? (
                            <><Eye className="h-4 w-4 mr-1" /> Watch</>
                          ) : isWaiting ? 'View' : 'Play'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            const label = isWaiting ? 'Cancel' : 'Resign'
                            if (!confirm(`${label} this game?`)) return
                            try {
                              const result = await cancelGame.mutateAsync({ gameId: game.id, userId })
                              toast.success(result.deleted ? 'Game deleted' : 'Game resigned')
                            } catch {
                              toast.error('Failed to cancel game')
                            }
                          }}
                          disabled={cancelGame.isPending}
                          className="bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/30 font-semibold"
                        >
                          <X className="h-4 w-4 mr-1" />
                          {isWaiting ? 'Cancel' : 'Resign'}
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
            ) : (() => {
              const visibleGames = (openGames ?? [])
                .filter(g => !g.game_players?.some((p: { player_id: string }) => p.player_id === userId))
                .filter(g => !ignoredGames.has(g.id))
              return visibleGames.length === 0
            })() ? (
              <p className="text-amber-600/60 text-center py-4">No open games right now. Be the first to create one!</p>
            ) : (
              <div className="space-y-3">
                {(openGames ?? [])
                  .filter(g => !g.game_players?.some((p: { player_id: string }) => p.player_id === userId))
                  .filter(g => !ignoredGames.has(g.id))
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
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleJoin(game.id)}
                            disabled={joinGame.isPending || players.length >= 4}
                            className="bg-amber-700 hover:bg-amber-600 text-amber-50"
                          >
                            {joinGame.isPending ? 'Joining...' : 'Join'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleIgnoreGame(game.id)}
                            className="bg-amber-900/40 hover:bg-amber-800/50 text-amber-500/60 border border-amber-900/30"
                          >
                            <X className="h-3 w-3 mr-1" />
                            Ignore
                          </Button>
                        </div>
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
                          {new Date(game.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} {new Date(game.updated_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — Winner: {winnerDisplay}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onOpenGame(game.id)}
                        className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold"
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
        {/* API & MCP Setup */}
        <ApiSetupSection />
      </main>
    </div>
  )
}

function ApiSetupSection() {
  const [expanded, setExpanded] = useState(false)
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api`

  const mcpConfig = JSON.stringify({
    mcpServers: {
      wordz: {
        command: "npx",
        args: ["tsx", "/path/to/mcp-server/index.ts"],
        env: {
          WORDZ_API_URL: apiUrl,
          WORDZ_API_KEY: "your-api-key-here"
        }
      }
    }
  }, null, 2)

  return (
    <Card className="border-purple-900/30 bg-purple-950/20">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="text-purple-300 flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Connect an AI (API & MCP)
          {expanded ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6 text-sm">
          <div className="space-y-3">
            <h3 className="text-purple-200 font-semibold">How it works</h3>
            <ol className="text-amber-400/70 space-y-2 list-decimal pl-4">
              <li>Create a new game and add an <strong className="text-purple-300">API Player (LLM)</strong> slot</li>
              <li>Copy the API key shown after creating the game</li>
              <li>Configure your AI assistant with the key using one of the methods below</li>
              <li>The AI will play on its turn automatically when you ask it to check the game</li>
            </ol>
          </div>

          <div className="space-y-3">
            <h3 className="text-purple-200 font-semibold">Claude Desktop (MCP)</h3>
            <p className="text-amber-400/60">
              Add this to your Claude Desktop config file. First,{' '}
              <a
                href="https://github.com/nicedash/wordz-mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                download the MCP server
              </a>{' '}
              or clone the <code className="text-purple-300 bg-purple-950/60 px-1 rounded">mcp-server/</code> folder from the repo.
            </p>
            <div className="relative">
              <pre className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 text-purple-200/80 font-mono text-xs overflow-x-auto whitespace-pre">
                {mcpConfig}
              </pre>
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(mcpConfig)
                  toast.success('Config copied!')
                }}
                className="absolute top-2 right-2 bg-purple-800/60 hover:bg-purple-700/70 text-purple-200 h-7 px-2"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-purple-200 font-semibold">REST API (ChatGPT, other LLMs)</h3>
            <p className="text-amber-400/60">
              Any HTTP client can use the REST API directly. Include your API key in the header.
            </p>
            <div className="space-y-2">
              <div className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 font-mono text-xs">
                <p className="text-purple-400/60 mb-1"># Get game state</p>
                <p className="text-purple-200/80">
                  curl -H "x-api-key: YOUR_KEY" \
                </p>
                <p className="text-purple-200/80 pl-4 break-all">
                  {apiUrl}/state
                </p>
              </div>
              <div className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 font-mono text-xs">
                <p className="text-purple-400/60 mb-1"># Play a word (0-indexed rows/cols)</p>
                <p className="text-purple-200/80">
                  curl -X POST -H "x-api-key: YOUR_KEY" \
                </p>
                <p className="text-purple-200/80 pl-4">
                  -H "Content-Type: application/json" \
                </p>
                <p className="text-purple-200/80 pl-4 break-all">
                  -d '{`{"action":"play","tiles":[{"row":7,"col":7,"letter":"H"},{"row":7,"col":8,"letter":"I"}]}`}' \
                </p>
                <p className="text-purple-200/80 pl-4 break-all">
                  {apiUrl}/move
                </p>
              </div>
            </div>
          </div>

          <div className="text-amber-500/50 text-xs border-t border-amber-900/20 pt-3">
            Actions: <code className="text-purple-300/60">play</code>, <code className="text-purple-300/60">pass</code>, <code className="text-purple-300/60">exchange</code>. All words are validated against the TWL06 dictionary.
          </div>
        </CardContent>
      )}
    </Card>
  )
}
