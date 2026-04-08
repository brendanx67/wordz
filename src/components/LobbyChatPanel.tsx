import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import { useChatChannels, type ChatChannel } from '@/hooks/useChatChannel'
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

export default function LobbyChatPanel({ userId, onOpenGame }: LobbyChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const { data: channels, isLoading } = useChatChannels()
  const [selectedName, setSelectedName] = useState<string>('suggestions')

  const sortedChannels = useMemo(() => {
    if (!channels) return []
    return [...channels].sort((a, b) => {
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
    // We don't have per-message counts at the channel-list level; the most
    // honest signal we have is "channels with last_read_at older than the
    // most recent message". The per-channel hook computes the precise count
    // when you open it. As a header indicator we show the number of channels
    // with unread activity, which is good enough for a lobby badge.
    return channels.filter((c) => c.last_read_at === null).length
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
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
            {/* Channel switcher */}
            <div className="space-y-1 md:border-r md:border-amber-900/20 md:pr-4">
              {isLoading ? (
                <p className="text-amber-500/60 text-xs">Loading channels…</p>
              ) : sortedChannels.length === 0 ? (
                <p className="text-amber-500/60 text-xs">No channels.</p>
              ) : (
                sortedChannels.map((c) => {
                  const isSelected = c.name === selectedName
                  const label = formatChannelLabel(c)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setSelectedName(c.name)}
                      className={
                        'w-full text-left px-2 py-1.5 rounded text-sm transition-colors ' +
                        (isSelected
                          ? 'bg-amber-800/50 text-amber-100 font-semibold'
                          : 'text-amber-300/80 hover:bg-amber-900/30 hover:text-amber-200')
                      }
                    >
                      <span className="text-amber-500/60 mr-1">{channelPrefix(c)}</span>
                      {label}
                    </button>
                  )
                })
              )}
            </div>

            {/* Active channel content */}
            <div>
              {selectedName ? (
                <ChatChannelView
                  key={selectedName}
                  channelName={selectedName}
                  currentUserId={userId}
                  active={expanded}
                  onOpenGame={onOpenGame}
                />
              ) : (
                <p className="text-amber-500/60 text-sm">Pick a channel.</p>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function channelPrefix(c: ChatChannel): string {
  if (c.visibility === 'direct') return '@'
  if (c.name.startsWith('game-')) return '♜'
  return '#'
}

function formatChannelLabel(c: ChatChannel): string {
  if (c.name.startsWith('game-')) {
    // The display_name comes back as 'Game Chat' for every game channel — show
    // a short id suffix so the user can tell them apart.
    const id = c.name.slice('game-'.length)
    return `Game ${id.slice(0, 4)}`
  }
  return c.display_name
}
