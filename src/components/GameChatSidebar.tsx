import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import ChatChannelView from './ChatChannelView'
import { useChatChannel } from '@/hooks/useChatChannel'

interface GameChatSidebarProps {
  gameId: string
  userId: string
  gameStatus: string
}

// Lightweight collapsible chat panel for the game page. Loads the
// per-game chat channel (`game-<uuid>`) which is auto-provisioned by the
// migration trigger when the game becomes active. Members are every human
// player + every API-key owner.
export default function GameChatSidebar({ gameId, userId, gameStatus }: GameChatSidebarProps) {
  const [expanded, setExpanded] = useState(false)
  const channelName = `game-${gameId}`
  const { messages, unreadCount, isError, isLoading } = useChatChannel(channelName)

  // The channel may not exist if the game is still in 'waiting' state — the
  // trigger only fires once status flips to 'active'. Hide the panel until
  // it does, rather than rendering a "Channel not found" error.
  if (isError && !isLoading) return null

  // Once a game is finished, the chat is only useful as a record of what was
  // said during play. If nothing was said, hide the panel entirely so the
  // post-game review screen isn't cluttered with an empty chat.
  if (gameStatus === 'finished' && !isLoading && messages.length === 0) return null

  return (
    <Card className="border-amber-900/30 bg-amber-950/30">
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={() => setExpanded((e) => !e)}
      >
        <CardTitle className="text-amber-300 flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Game Chat
            {unreadCount > 0 && !expanded && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-700 text-amber-50 text-xs font-semibold">
                {unreadCount}
              </span>
            )}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-amber-400/60" />
          ) : (
            <ChevronDown className="h-4 w-4 text-amber-400/60" />
          )}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent>
          <ChatChannelView
            channelName={channelName}
            currentUserId={userId}
            active={expanded}
            scrollHeightClass="h-64"
          />
        </CardContent>
      )}
    </Card>
  )
}
