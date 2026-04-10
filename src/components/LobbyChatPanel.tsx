import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MessageSquare, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useChatChannels, type ChatChannel } from '@/hooks/useChatChannel'
import { resolvePlayerName, type ComputerPlayer } from '@/hooks/useGames'
import { supabase } from '@/lib/supabase'
import ChatChannelView from './ChatChannelView'

interface LobbyChatPanelProps {
  userId: string
  onOpenGame?: (gameId: string) => void
}

// Channel display order: suggestions first, then game chats, then DMs.
function channelSortKey(c: ChatChannel): number {
  if (c.name === 'suggestions') return 0
  if (c.name.startsWith('game-')) return 1
  if (c.visibility === 'direct') return 2
  return 3
}

interface GameInfo {
  title: string // "Alice vs Computer 1 (Easy)"
  startedAt: string // localized date-time
  startedAtIso: string // ISO timestamp for formatting
  status: string
}

function getDisplayName(
  profiles: { display_name: string } | { display_name: string }[] | null
): string {
  if (!profiles) return 'Unknown'
  if (Array.isArray(profiles)) return profiles[0]?.display_name ?? 'Unknown'
  return profiles.display_name
}

function buildGameInfo(game: {
  status: string
  created_at: string
  game_players?: { player_id?: string; profiles: unknown }[] | null
  computer_players?: unknown
}): GameInfo {
  const humans = (game.game_players ?? []).map((p) =>
    getDisplayName(p.profiles as { display_name: string })
  )
  const cps = (game.computer_players ?? []) as ComputerPlayer[]
  const gamePlayers = (game.game_players ?? []).map(p => ({
    player_id: p.player_id ?? '',
    profiles: p.profiles as { display_name: string },
  }))
  const computers = cps.map((cp) => resolvePlayerName(cp, gamePlayers))
  const title = [...humans, ...computers].join(' vs ') || 'Game'
  return {
    title,
    startedAt: new Date(game.created_at).toLocaleString(),
    startedAtIso: game.created_at,
    status: game.status,
  }
}

/** Fetch game info for specific game IDs — works for any status (active,
 *  finished, waiting). Only enabled when there are IDs to fetch. */
function useGameInfoByIds(gameIds: string[]) {
  return useQuery({
    queryKey: ['games', 'chat-info', ...gameIds.sort()],
    enabled: gameIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('games')
        .select('id, status, created_at, computer_players, game_players(player_id, profiles(display_name))')
        .in('id', gameIds)
      const m = new Map<string, GameInfo>()
      for (const g of data ?? []) m.set(g.id, buildGameInfo(g))
      return m
    },
    staleTime: 60_000,
  })
}

export default function LobbyChatPanel({ userId, onOpenGame }: LobbyChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const { data: channels, isLoading } = useChatChannels()
  const [selectedName, setSelectedName] = useState<string>('suggestions')

  // Extract game IDs from game-* channel names so we can fetch info for all
  // of them (including finished games, which useMyGames doesn't cover).
  const gameChannelIds = useMemo(() => {
    if (!channels) return []
    return channels
      .filter(c => c.name.startsWith('game-'))
      .map(c => c.name.slice('game-'.length))
  }, [channels])

  const { data: gameInfoById } = useGameInfoByIds(gameChannelIds)

  const sortedChannels = useMemo(() => {
    if (!channels) return []
    return [...channels]
      // Hide game channels that have zero messages (stale/abandoned games)
      .filter(c => {
        if (!c.name.startsWith('game-')) return true
        return c.message_count > 0
      })
      .sort((a, b) => {
        const ka = channelSortKey(a)
        const kb = channelSortKey(b)
        if (ka !== kb) return ka - kb
        return a.display_name.localeCompare(b.display_name)
      })
  }, [channels])

  // If the selected channel disappears (e.g. on initial load before the
  // suggestions channel is fetched), fall back to the first available.
  useEffect(() => {
    if (!sortedChannels.length) return
    if (!sortedChannels.some((c) => c.name === selectedName)) {
      setSelectedName(sortedChannels[0].name)
    }
  }, [sortedChannels, selectedName])

  const totalUnread = useMemo(() => {
    if (!channels) return 0
    // Count channels that have messages but haven't been read yet.
    return channels.filter((c) => c.last_read_at === null && c.message_count > 0).length
  }, [channels])

  return (
    <Card className="border-amber-900/30 bg-amber-950/30">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <CardTitle className="text-amber-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat
            {totalUnread > 0 && !expanded && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-700 text-amber-50 text-xs font-semibold">
                {totalUnread}
              </span>
            )}
          </span>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-amber-400/60" />
          ) : (
            <ChevronDown className="h-5 w-5 text-amber-400/60" />
          )}
        </CardTitle>
        <p className="text-amber-400/70 text-xs mt-1">
          Suggestions, game chats, and direct messages.
        </p>
      </CardHeader>
      {expanded && (
        <CardContent>
          <TooltipProvider delayDuration={300}>
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
              {/* Channel switcher */}
              <div className="space-y-1 md:border-r md:border-amber-900/20 md:pr-4">
                {isLoading ? (
                  <p className="text-amber-500/60 text-xs">Loading channels…</p>
                ) : sortedChannels.length === 0 ? (
                  <p className="text-amber-500/60 text-xs">No channels.</p>
                ) : (
                  sortedChannels.map((c) => {
                    const isSelected = c.name === selectedName
                    const gameInfo = gameInfoForChannel(c, gameInfoById)
                    const label = formatChannelLabel(c, gameInfo)
                    const button = (
                      <button
                        type="button"
                        onClick={() => setSelectedName(c.name)}
                        className={
                          'w-full text-left px-2 py-1.5 rounded text-sm transition-colors truncate ' +
                          (isSelected
                            ? 'bg-amber-800/50 text-amber-100 font-semibold'
                            : 'text-amber-300/80 hover:bg-amber-900/30 hover:text-amber-200')
                        }
                      >
                        <span className="text-amber-500/60 mr-1">{channelPrefix(c)}</span>
                        {label}
                      </button>
                    )
                    if (gameInfo) {
                      return (
                        <Tooltip key={c.id}>
                          <TooltipTrigger asChild>{button}</TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <div className="space-y-0.5">
                              <div className="font-semibold">{gameInfo.title}</div>
                              <div className="text-xs opacity-80">
                                Started {gameInfo.startedAt}
                              </div>
                              <div className="text-xs opacity-60 capitalize">
                                Status: {gameInfo.status}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )
                    }
                    return <div key={c.id}>{button}</div>
                  })
                )}
              </div>

              {/* Active channel content */}
              <div>
                {selectedName ? (
                  <ActiveChannelPane
                    channel={sortedChannels.find((c) => c.name === selectedName)}
                    channelName={selectedName}
                    gameInfo={(() => {
                      const c = sortedChannels.find((c) => c.name === selectedName)
                      return c ? gameInfoForChannel(c, gameInfoById) : null
                    })()}
                    userId={userId}
                    expanded={expanded}
                    onOpenGame={onOpenGame}
                  />
                ) : (
                  <p className="text-amber-500/60 text-sm">Pick a channel.</p>
                )}
              </div>
            </div>
          </TooltipProvider>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Active channel pane ────────────────────────────────────────────────────

function ActiveChannelPane({
  channel,
  channelName,
  gameInfo,
  userId,
  expanded,
  onOpenGame,
}: {
  channel: ChatChannel | undefined
  channelName: string
  gameInfo: GameInfo | null
  userId: string
  expanded: boolean
  onOpenGame?: (gameId: string) => void
}) {
  // Game channels start with `game-<uuid>` — pull the id out so the header
  // can offer a "jump to board" link without re-parsing it elsewhere.
  const gameId =
    channel?.name.startsWith('game-') ? channel.name.slice('game-'.length) : null

  return (
    <div className="space-y-2">
      {gameInfo ? (
        <div className="border-b border-amber-900/30 pb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-amber-200 font-semibold text-sm truncate">{gameInfo.title}</h3>
            <p className="text-amber-500/70 text-xs">
              Started {gameInfo.startedAt} · {gameInfo.status}
            </p>
          </div>
          {gameId && onOpenGame && (
            <button
              type="button"
              onClick={() => onOpenGame(gameId)}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-800/40 hover:bg-amber-700/60 text-amber-100 border border-amber-700/40 transition-colors"
              title="Open this game"
            >
              <ExternalLink className="h-3 w-3" />
              Open game
            </button>
          )}
        </div>
      ) : channel && channel.name !== 'suggestions' ? (
        <div className="border-b border-amber-900/30 pb-2">
          <h3 className="text-amber-200 font-semibold text-sm">{channel.display_name}</h3>
        </div>
      ) : null}
      <ChatChannelView
        key={channelName}
        channelName={channelName}
        currentUserId={userId}
        active={expanded}
        onOpenGame={onOpenGame}
      />
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function channelPrefix(c: ChatChannel): string {
  if (c.visibility === 'direct') return '@'
  if (c.name.startsWith('game-')) return '♜'
  return '#'
}

function gameInfoForChannel(
  c: ChatChannel,
  byId: Map<string, GameInfo> | undefined
): GameInfo | null {
  if (!c.name.startsWith('game-') || !byId) return null
  const id = c.name.slice('game-'.length)
  return byId.get(id) ?? null
}

function formatChannelLabel(c: ChatChannel, gameInfo: GameInfo | null): string {
  if (c.name.startsWith('game-')) {
    if (gameInfo) {
      // Show a compact label: player names + short date
      const date = new Date(gameInfo.startedAtIso)
      const short = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return `${gameInfo.title} · ${short}`
    }
    const id = c.name.slice('game-'.length)
    return `Game ${id.slice(0, 4)}`
  }
  return c.display_name
}
