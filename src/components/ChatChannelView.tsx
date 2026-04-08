import { useEffect, useRef, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Send } from 'lucide-react'
import { useChatChannel, type ChatMessage } from '@/hooks/useChatChannel'
import { toast } from 'sonner'

const MESSAGE_MAX = 4000
const COUNTER_THRESHOLD = MESSAGE_MAX - 500
const GITHUB_REPO_URL = 'https://github.com/brendanx67/wordz'

interface ChatChannelViewProps {
  channelName: string
  currentUserId: string
  // Outer container controls visibility/expand state; this view assumes it
  // should mark messages read whenever it's mounted (the panel above is
  // already responsible for hiding it when collapsed).
  active?: boolean
  // Optional callback so the parent can navigate to a referenced game.
  onOpenGame?: (gameId: string) => void
  // Optional height override for the message scroll area.
  scrollHeightClass?: string
}

export default function ChatChannelView({
  channelName,
  currentUserId,
  active = true,
  onOpenGame,
  scrollHeightClass = 'h-80',
}: ChatChannelViewProps) {
  const [draft, setDraft] = useState('')

  const { messages, isLoading, isError, postMessage, isPosting, markRead, unreadCount } =
    useChatChannel(channelName)

  // Mark as read once messages have hydrated. Re-runs whenever the unread
  // count drops to zero so we don't spam the endpoint.
  useEffect(() => {
    if (!active || isLoading || messages.length === 0) return
    if (unreadCount > 0) markRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isLoading, messages.length, unreadCount])

  const handleSend = async () => {
    const body = draft.trim()
    if (!body) return
    if (body.length > MESSAGE_MAX) {
      toast.error(`Message too long (max ${MESSAGE_MAX} characters)`)
      return
    }
    const refs = parseReferences(body)
    const previous = draft
    setDraft('')
    try {
      await postMessage({ body, ...refs })
    } catch (err) {
      setDraft(previous)
      toast.error(`Failed to send: ${(err as Error).message}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const charsRemaining = MESSAGE_MAX - draft.length
  const showCounter = draft.length >= COUNTER_THRESHOLD

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 bg-amber-900/20" />
          <Skeleton className="h-12 bg-amber-900/20" />
          <Skeleton className="h-12 bg-amber-900/20" />
        </div>
      ) : isError ? (
        <p className="text-red-400 text-sm">Failed to load messages.</p>
      ) : (
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          onOpenGame={onOpenGame}
          scrollHeightClass={scrollHeightClass}
        />
      )}

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Share a message. Enter to send, Shift+Enter for newline. Reference issues with #N."
          maxLength={MESSAGE_MAX}
          rows={3}
          className="bg-amber-950/40 border-amber-900/30 text-amber-100 placeholder:text-amber-500/40 focus-visible:ring-amber-600"
          disabled={isPosting}
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-amber-500/60">
            {showCounter && (
              <span
                className={
                  charsRemaining < 0
                    ? 'text-red-400 font-semibold'
                    : charsRemaining < 100
                      ? 'text-amber-300'
                      : 'text-amber-500/60'
                }
              >
                {charsRemaining} characters left
              </span>
            )}
          </div>
          <Button
            onClick={handleSend}
            disabled={!draft.trim() || isPosting || draft.length > MESSAGE_MAX}
            size="sm"
            className="bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold"
          >
            <Send className="h-4 w-4 mr-1" />
            {isPosting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Message list with auto-scroll ───────────────────────────────────────────

function MessageList({
  messages,
  currentUserId,
  onOpenGame,
  scrollHeightClass,
}: {
  messages: ChatMessage[]
  currentUserId: string
  onOpenGame?: (gameId: string) => void
  scrollHeightClass: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const wasNearBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      wasNearBottomRef.current = distFromBottom < 80
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  if (messages.length === 0) {
    return (
      <div
        ref={scrollRef}
        className={`${scrollHeightClass} rounded-lg bg-amber-950/40 border border-amber-900/20 flex items-center justify-center`}
      >
        <p className="text-amber-500/60 text-sm">
          No messages yet. Be the first to share something.
        </p>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={scrollRef}
        className={`${scrollHeightClass} overflow-y-auto rounded-lg bg-amber-950/40 border border-amber-900/20 p-3 space-y-3`}
      >
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            isSelf={m.posted_by_user_id === currentUserId}
            replyTo={
              m.references_message_id ? messagesById.get(m.references_message_id) : undefined
            }
            onOpenGame={onOpenGame}
          />
        ))}
      </div>
    </TooltipProvider>
  )
}

// ─── Single message row ──────────────────────────────────────────────────────

function MessageRow({
  message,
  isSelf,
  replyTo,
  onOpenGame,
}: {
  message: ChatMessage
  isSelf: boolean
  replyTo?: ChatMessage
  onOpenGame?: (gameId: string) => void
}) {
  const created = new Date(message.created_at)
  const absolute = created.toLocaleString()
  const relative = formatRelative(created)

  return (
    <div
      className={
        isSelf
          ? 'rounded-md bg-amber-900/30 border border-amber-800/40 p-2'
          : 'rounded-md bg-amber-950/60 border border-amber-900/20 p-2'
      }
    >
      <div className="flex items-baseline gap-2 text-xs">
        <span className="text-amber-200 font-semibold">{message.posted_by_user_name}</span>
        {message.posted_by_agent && (
          <span className="text-amber-500/70 italic">via {message.posted_by_agent}</span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-amber-500/50 ml-auto cursor-help">{relative}</span>
          </TooltipTrigger>
          <TooltipContent>{absolute}</TooltipContent>
        </Tooltip>
      </div>

      {replyTo && (
        <div className="mt-1 pl-2 border-l-2 border-amber-700/40 text-xs text-amber-400/60">
          replying to <span className="text-amber-300/80">{replyTo.posted_by_user_name}</span>:{' '}
          <span className="italic">{truncate(replyTo.body, 80)}</span>
        </div>
      )}

      <div className="text-amber-100 text-sm whitespace-pre-wrap mt-1 break-words">
        {renderBodyWithReferences(message.body)}
      </div>

      {(message.references_issue || message.references_commit || message.during_game_id) && (
        <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
          {message.references_issue && (
            <a
              href={`${GITHUB_REPO_URL}/issues/${message.references_issue}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber-300 hover:text-amber-200 underline"
            >
              #{message.references_issue}
            </a>
          )}
          {message.references_commit && (
            <a
              href={`${GITHUB_REPO_URL}/commit/${message.references_commit}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber-300 hover:text-amber-200 underline font-mono"
            >
              {message.references_commit.slice(0, 8)}
            </a>
          )}
          {message.during_game_id && (
            <span className="text-amber-500/70 italic">
              during{' '}
              {onOpenGame ? (
                <button
                  type="button"
                  onClick={() => onOpenGame(message.during_game_id!)}
                  className="text-amber-300 hover:text-amber-200 underline"
                >
                  Game {message.during_game_id.slice(0, 8)}
                </button>
              ) : (
                <span className="text-amber-300">Game {message.during_game_id.slice(0, 8)}</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return date.toLocaleDateString()
}

function renderBodyWithReferences(body: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(#\d+|\b[0-9a-f]{7,12}\b)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      out.push(body.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('#')) {
      const n = token.slice(1)
      out.push(
        <a
          key={`ref-${key++}`}
          href={`${GITHUB_REPO_URL}/issues/${n}`}
          target="_blank"
          rel="noreferrer"
          className="text-amber-300 hover:text-amber-200 underline"
        >
          {token}
        </a>
      )
    } else {
      out.push(
        <a
          key={`ref-${key++}`}
          href={`${GITHUB_REPO_URL}/commit/${token}`}
          target="_blank"
          rel="noreferrer"
          className="text-amber-300 hover:text-amber-200 underline font-mono"
        >
          {token}
        </a>
      )
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < body.length) out.push(body.slice(lastIndex))
  return out
}

function parseReferences(body: string): {
  references_issue?: number
  references_commit?: string
} {
  const refs: { references_issue?: number; references_commit?: string } = {}
  const issueMatch = body.match(/#(\d+)/)
  if (issueMatch) refs.references_issue = parseInt(issueMatch[1], 10)
  const shaMatch = body.match(/\b[0-9a-f]{7,12}\b/)
  if (shaMatch) refs.references_commit = shaMatch[0]
  return refs
}
