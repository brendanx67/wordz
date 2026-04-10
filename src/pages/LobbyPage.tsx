import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useOpenGames, useMyGames, useCreateConfiguredGame, useJoinGame, useStartGame, useCancelGame, useApiKeys, useCreateApiKey, useDeleteApiKey, resolvePlayerName } from '@/hooks/useGames'
import type { ComputerPlayer } from '@/hooks/useGames'
import { useGameHistory } from '@/hooks/useGameHistory'
import { useState, useCallback } from 'react'
import { LogOut, Plus, Play, Users, Clock, Trophy, History, Eye, X, Bot, Copy, ChevronDown, ChevronUp, BookOpen, Settings } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import CreateGameForm from '@/components/CreateGameForm'
import type { GameConfig } from '@/components/CreateGameForm'
import LobbyChatPanel from '@/components/LobbyChatPanel'

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
  onOpenAccount?: () => void
  onOpenOverview?: () => void
}

export default function LobbyPage({ userId, displayName, onSignOut, onOpenGame, onOpenAccount, onOpenOverview }: LobbyPageProps) {
  const { data: openGames, isLoading: loadingOpen } = useOpenGames()
  const { data: myGames, isLoading: loadingMine } = useMyGames(userId)
  const { data: gameHistory, isLoading: loadingHistory } = useGameHistory(userId)
  const createConfiguredGame = useCreateConfiguredGame()
  const joinGame = useJoinGame()
  const startGame = useStartGame()
  const cancelGame = useCancelGame()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [resignGameId, setResignGameId] = useState<string | null>(null)
  const resignGame = myGames?.find((g: { id: string }) => g.id === resignGameId)
  const resignLabel = resignGame?.status === 'waiting' ? 'Cancel' : 'Resign'
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

  const handleCreateGame = async (config: GameConfig) => {
    try {
      const result = await createConfiguredGame.mutateAsync({ userId, config, displayName })
      setShowCreateForm(false)
      toast.success('Game created!')
      onOpenGame(result.gameId)
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
          <button
            onClick={onOpenOverview}
            className="text-2xl font-bold tracking-widest text-amber-400 hover:text-amber-300 transition-colors"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            WORDZ
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenAccount}
              className="text-amber-300/70 text-sm hover:text-amber-200 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {displayName}
              <Settings className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
            </button>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onSignOut} className="text-amber-400/80 hover:text-amber-200 hover:bg-amber-900/40">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-amber-950 border-amber-700/50 text-amber-200">
                  Log out
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl space-y-6 sm:space-y-8">
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
              <p className="text-amber-400 text-center py-4">No active games. Create one or join from the lobby!</p>
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

                  // Build display names including computer players. We render
                  // these as JSX rather than a joined string so we can stamp
                  // the #10 instructional-mode icon next to the seats that
                  // have it on. Visible to everyone in the lobby.
                  const nameNodes: { key: string; name: string; instructional: boolean }[] = [
                    ...players.map((p: { player_id: string; profiles: unknown; find_words_enabled?: boolean }) => ({
                      key: `h-${p.player_id}`,
                      name: getDisplayName(p.profiles as { display_name: string }),
                      instructional: !!p.find_words_enabled,
                    })),
                    ...computerPlayers.map(cp => ({
                      key: `c-${cp.id}`,
                      name: resolvePlayerName(cp, players as Parameters<typeof resolvePlayerName>[1]),
                      instructional: !!cp.find_words_enabled,
                    })),
                  ]

                  return (
                    <div
                      key={game.id}
                      className="p-4 rounded-lg bg-amber-950/40 border border-amber-900/20 hover:border-amber-700/40 transition-colors space-y-2"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-amber-200 font-medium inline-flex items-center gap-1 flex-wrap">
                          {nameNodes.map((n, idx) => (
                            <span key={n.key} className="inline-flex items-center gap-1">
                              {idx > 0 && <span className="text-amber-500/70 mx-0.5">vs</span>}
                              <span>{n.name}</span>
                              {n.instructional && (
                                <span title="Instructional mode — A&amp;J word list" className="inline-flex">
                                  <BookOpen className="h-3 w-3 text-sky-300 shrink-0" aria-label="Instructional mode" />
                                </span>
                              )}
                            </span>
                          ))}
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
                        <div className="text-xs text-amber-400">
                          {players.map((p: { profiles: unknown; score: number }) =>
                            `${getDisplayName(p.profiles as { display_name: string })}: ${p.score}`
                          ).join(' | ')}
                          {computerPlayers.map(cp => ` | ${resolvePlayerName(cp, players as Parameters<typeof resolvePlayerName>[1])}: ${cp.score}`).join('')}
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
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
                          onClick={() => setResignGameId(game.id)}
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
              <p className="text-amber-400 text-center py-4">No open games right now. Be the first to create one!</p>
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
                        className="p-4 rounded-lg bg-amber-950/40 border border-amber-900/20 space-y-2"
                      >
                        <div>
                          <span className="text-amber-200">
                            {players.map((p: { profiles: unknown }) => getDisplayName(p.profiles as { display_name: string })).join(', ')}
                          </span>
                          <span className="text-amber-400 text-sm ml-2">({players.length}/4 players)</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
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
                            className="bg-amber-900/40 hover:bg-amber-800/50 text-amber-400/80 border border-amber-900/30"
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
              <p className="text-amber-400 text-center py-4">No completed games yet. Play some rounds!</p>
            ) : (
              <div className="space-y-3">
                {gameHistory.map((game) => {
                  const players = game.game_players ?? []
                  const cpuPlayers = (game.computer_players ?? []) as ComputerPlayer[]
                  const isPlayer = players.some((p: { player_id: string }) => p.player_id === userId)
                  const myApiPlayer = cpuPlayers.find(cp => cp.id.startsWith('api-') && (cp as ComputerPlayer & { owner_id?: string }).owner_id === userId)
                  const didWin = game.winner === userId || (myApiPlayer && game.winner === myApiPlayer.id)
                  const isSpectatorGame = !isPlayer && !myApiPlayer

                  // Detect resignation: user was a player but their score was highest yet they "lost"
                  const myPlayer = players.find((p: { player_id: string }) => p.player_id === userId)
                  const myScore = myPlayer ? (myPlayer as { score: number }).score : 0
                  const winnerScore = (() => {
                    const hw = players.find((p: { player_id: string }) => p.player_id === game.winner)
                    if (hw) return (hw as { score: number }).score
                    const cw = cpuPlayers.find(cp => cp.id === game.winner)
                    if (cw) return cw.score
                    return 0
                  })()
                  const didResign = isPlayer && !didWin && myScore > winnerScore

                  // Build scores display combining humans and computers
                  const allScores: string[] = [
                    ...players.map((p: { profiles: unknown; score: number }) =>
                      `${getDisplayName(p.profiles as { display_name: string })}: ${p.score}`
                    ),
                    ...cpuPlayers.map(cp => `${resolvePlayerName(cp, players as Parameters<typeof resolvePlayerName>[1])}: ${cp.score}`),
                  ]

                  // Find winner name
                  const humanWinner = players.find((p: { player_id: string }) => p.player_id === game.winner)
                  const cpuWinner = cpuPlayers.find(cp => cp.id === game.winner)
                  const winnerDisplay = humanWinner
                    ? getDisplayName((humanWinner as { profiles: unknown }).profiles as { display_name: string })
                    : cpuWinner ? resolvePlayerName(cpuWinner, players as Parameters<typeof resolvePlayerName>[1]) : 'Unknown'

                  return (
                    <div
                      key={game.id}
                      className="p-4 rounded-lg bg-amber-950/40 border border-amber-900/20 space-y-2"
                    >
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {isSpectatorGame ? (
                            <span className="text-blue-400 font-medium">Spectated</span>
                          ) : didResign ? (
                            <span className="text-amber-400 font-medium">Resigned</span>
                          ) : (
                            <span className={didWin ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                              {didWin ? 'Won!' : 'Lost'}
                            </span>
                          )}
                          <span className="text-amber-200/70 text-sm">
                            {allScores.join(' | ')}
                          </span>
                        </div>
                        <div className="text-xs text-amber-400/70 mt-1">
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

        {/* Chat (suggestions, game chats, DMs) */}
        <LobbyChatPanel userId={userId} onOpenGame={onOpenGame} />

        {/* API & MCP Setup */}
        <ApiSetupSection userId={userId} />
      </main>

      {/* Resign / Cancel confirmation dialog */}
      <AlertDialog open={!!resignGameId} onOpenChange={(open) => { if (!open) setResignGameId(null) }}>
        <AlertDialogContent className="bg-amber-950 border-amber-700/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-200">{resignLabel} this game?</AlertDialogTitle>
            <AlertDialogDescription className="text-amber-400/80">
              {resignLabel === 'Cancel'
                ? 'This will delete the game. This action cannot be undone.'
                : 'You will forfeit the game and the remaining player will win.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border-amber-700/40">
              Never mind
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/30"
              onClick={async () => {
                if (!resignGameId) return
                try {
                  const result = await cancelGame.mutateAsync({ gameId: resignGameId, userId })
                  toast.success(result.deleted ? 'Game deleted' : 'Game resigned')
                } catch {
                  toast.error('Failed to cancel game')
                }
                setResignGameId(null)
              }}
            >
              {resignLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ApiSetupSection({ userId }: { userId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const { data: apiKeys, isLoading } = useApiKeys(userId)
  const createKey = useCreateApiKey()
  const deleteKey = useDeleteApiKey()
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api`

  const credentialsJson = JSON.stringify({
    api_url: apiUrl,
    api_key: "your-api-key-here"
  }, null, 2)

  const mcpConfig = JSON.stringify({
    mcpServers: {
      wordz: {
        command: "npx",
        args: ["tsx", "~/.wordz-mcp/index.ts"]
      }
    }
  }, null, 2)

  const handleCreateKey = async () => {
    const name = newKeyName.trim()
    if (!name) return
    try {
      const result = await createKey.mutateAsync({ userId, name })
      setJustCreatedKey(result.api_key)
      setNewKeyName('')
      toast.success('API key created! Copy it now — it won\'t be shown again.')
    } catch {
      toast.error('Failed to create API key')
    }
  }

  const handleDeleteKey = (keyId: string, keyName: string) => {
    setRevokeTarget({ id: keyId, name: keyName })
  }

  return (
    <>
    <Card className="border-purple-900/30 bg-purple-950/20">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="text-purple-300 flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Connect an AI (API & MCP)
          {apiKeys && apiKeys.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-800/40 text-purple-300 font-normal">
              {apiKeys.length} key{apiKeys.length !== 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6 text-sm">
          {/* API Key Management */}
          <div className="space-y-3">
            <h3 className="text-purple-200 font-semibold">Your API Keys</h3>
            <p className="text-amber-300 text-xs">
              Create a named API key to connect any AI assistant. One key works across all your games.
            </p>

            {/* Create new key */}
            <div className="flex gap-2">
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g. Claude Desktop, ChatGPT)"
                className="bg-purple-950/60 border-purple-800/30 text-purple-200 h-9 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
              />
              <Button
                size="sm"
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || createKey.isPending}
                className="bg-purple-700 hover:bg-purple-600 text-purple-100 shrink-0 h-9"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </div>

            {/* Just-created key (show once) */}
            {justCreatedKey && (
              <div className="bg-green-950/40 border border-green-700/40 rounded-lg p-3 space-y-2">
                <p className="text-green-300 text-xs font-semibold">
                  Copy this key now — it will never be shown again!
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={justCreatedKey}
                    className="bg-green-950/60 border-green-800/30 text-green-200 font-mono text-xs"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(justCreatedKey)
                      toast.success('API key copied!')
                    }}
                    className="bg-green-700 hover:bg-green-600 text-green-100 shrink-0"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setJustCreatedKey(null)}
                  className="text-green-400 hover:text-green-300 text-xs h-7"
                >
                  I've saved it — dismiss
                </Button>
              </div>
            )}

            {/* Existing keys */}
            {isLoading ? (
              <Skeleton className="h-10 bg-purple-900/20" />
            ) : apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-purple-950/40 border border-purple-800/20"
                  >
                    <div>
                      <span className="text-purple-200 text-sm font-medium">{key.name}</span>
                      <span className="text-purple-400/70 text-xs ml-2">
                        Created {new Date(key.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteKey(key.id, key.name)}
                      disabled={deleteKey.isPending}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/30 h-7 px-2"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            ) : !justCreatedKey ? (
              <p className="text-purple-400/70 text-xs text-center py-2">No API keys yet. Create one to get started.</p>
            ) : null}
          </div>

          {/* How it works */}
          <div className="space-y-3 border-t border-purple-800/20 pt-4">
            <h3 className="text-purple-200 font-semibold">How it works</h3>
            <ol className="text-amber-400/70 space-y-2 list-decimal pl-4">
              <li>Create an API key above and copy it</li>
              <li>
                <a href="/wordz-mcp.zip" download className="text-purple-400 hover:text-purple-300 underline font-semibold">
                  Download the MCP server
                </a>{' '}
                and extract to <code className="text-purple-300 bg-purple-950/60 px-1 rounded">~/.wordz-mcp</code>
              </li>
              <li>Run <code className="text-purple-300 bg-purple-950/60 px-1 rounded">cd ~/.wordz-mcp && npm install</code></li>
              <li>Create <code className="text-purple-300 bg-purple-950/60 px-1 rounded">~/.wordz-mcp/credentials.json</code> with your key</li>
              <li>Add the MCP server to Claude</li>
              <li>Create a game with an API Player slot, then tell your AI: <em className="text-purple-300">"I started a new Wordz game with you. Please join."</em></li>
            </ol>
          </div>

          {/* Credentials */}
          <div className="space-y-3 border-t border-purple-800/20 pt-4">
            <h3 className="text-purple-200 font-semibold">credentials.json</h3>
            <p className="text-amber-300">
              Create this file at <code className="text-purple-300 bg-purple-950/60 px-1 rounded">~/.wordz-mcp/credentials.json</code>:
            </p>
            <div className="relative">
              <pre className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 text-purple-200/80 font-mono text-xs overflow-x-auto whitespace-pre">
                {credentialsJson}
              </pre>
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(credentialsJson)
                  toast.success('Copied!')
                }}
                className="absolute top-2 right-2 bg-purple-800/60 hover:bg-purple-700/70 text-purple-200 h-7 px-2"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
          </div>

          {/* Claude Code / Desktop setup */}
          <div className="space-y-3 border-t border-purple-800/20 pt-4">
            <h3 className="text-purple-200 font-semibold">Add to Claude</h3>
            <div className="space-y-2">
              <p className="text-amber-300">
                <strong className="text-purple-300">Claude Code:</strong>
              </p>
              <div className="relative">
                <div className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 font-mono text-xs text-purple-200/80 pr-16">
                  claude mcp add wordz -- npx tsx ~/.wordz-mcp/index.ts
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText('claude mcp add wordz -- npx tsx ~/.wordz-mcp/index.ts')
                    toast.success('Command copied!')
                  }}
                  className="absolute top-2 right-2 bg-purple-800/60 hover:bg-purple-700/70 text-purple-200 h-7 px-2"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
              <p className="text-amber-300 pt-2">
                <strong className="text-purple-300">Claude Desktop:</strong> Add to config file
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
          </div>

          {/* REST API */}
          <div className="space-y-3 border-t border-purple-800/20 pt-4">
            <h3 className="text-purple-200 font-semibold">REST API (ChatGPT, other LLMs)</h3>
            <p className="text-amber-300">
              Any HTTP client can use the REST API directly. Include your API key and the game ID.
            </p>
            <div className="space-y-2">
              <div className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 font-mono text-xs">
                <p className="text-purple-400/60 mb-1"># List your games</p>
                <p className="text-purple-200/80 break-all">
                  curl -H "x-api-key: YOUR_KEY" {apiUrl}/games
                </p>
              </div>
              <div className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 font-mono text-xs">
                <p className="text-purple-400/60 mb-1"># Get game state</p>
                <p className="text-purple-200/80 break-all">
                  curl -H "x-api-key: YOUR_KEY" \
                </p>
                <p className="text-purple-200/80 pl-4 break-all">
                  {apiUrl}/state?game_id=GAME_ID
                </p>
              </div>
              <div className="bg-purple-950/60 border border-purple-800/30 rounded-lg p-3 font-mono text-xs">
                <p className="text-purple-400/60 mb-1"># Play a word (0-indexed rows/cols)</p>
                <p className="text-purple-200/80 break-all">
                  curl -X POST -H "x-api-key: YOUR_KEY" \
                </p>
                <p className="text-purple-200/80 pl-4">
                  -H "Content-Type: application/json" \
                </p>
                <p className="text-purple-200/80 pl-4 break-all">
                  -d '{`{"game_id":"GAME_ID","action":"play","tiles":[...]}`}' \
                </p>
                <p className="text-purple-200/80 pl-4 break-all">
                  {apiUrl}/move
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-purple-800/20 pt-4">
            <h3 className="text-purple-200 font-semibold">Source code</h3>
            <p className="text-amber-300">
              The full Wordz source: React app, Supabase edge functions, MCP server, and migrations — with complete git history.
            </p>
            <a
              href="/wordz-source.zip"
              download
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-800/40 border border-purple-700/50 text-purple-200 hover:text-purple-100 hover:bg-purple-800/60 text-sm font-semibold"
            >
              Download wordz-source.zip
            </a>
            <p className="text-amber-400/70 text-xs">
              Includes <code className="text-purple-300 bg-purple-950/60 px-1 rounded">.git</code> — run <code className="text-purple-300 bg-purple-950/60 px-1 rounded">git log</code> after extracting to see every commit. Excludes <code className="text-purple-300 bg-purple-950/60 px-1 rounded">node_modules</code>, build output, and <code className="text-purple-300 bg-purple-950/60 px-1 rounded">.env</code> files. Run <code className="text-purple-300 bg-purple-950/60 px-1 rounded">bun install</code> after extracting.
            </p>
          </div>

          <div className="text-amber-500/50 text-xs border-t border-amber-900/20 pt-3">
            Actions: <code className="text-purple-300/60">play</code>, <code className="text-purple-300/60">pass</code>, <code className="text-purple-300/60">exchange</code>. All words are validated against the TWL06 dictionary.
          </div>
        </CardContent>
      )}
    </Card>

      {/* Revoke API key confirmation dialog */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}>
        <AlertDialogContent className="bg-purple-950 border-purple-700/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-purple-200">Revoke "{revokeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-purple-400/80">
              Any MCP server or integration using this key will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-purple-900/60 hover:bg-purple-800/70 text-purple-200 border-purple-700/40">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/30"
              onClick={async () => {
                if (!revokeTarget) return
                try {
                  await deleteKey.mutateAsync(revokeTarget.id)
                  toast.success('API key revoked')
                } catch {
                  toast.error('Failed to revoke key')
                }
                setRevokeTarget(null)
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
