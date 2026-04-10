import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Hook for the in-app chat (issue #6 backend, #7 UI).
//
// Talks to the game-api Edge Function /chat/channels/* endpoints. The web UI
// authenticates with the user's Supabase session JWT (the edge function's
// authenticateChatUser helper accepts either a session token or an api_key,
// resolving both to the same auth.users(id)).
//
// Realtime is wired to the chat_messages table, filtered on channel_id, with
// a 10-second polling fallback in case realtime fails to connect.

const CHAT_API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api`
const POLL_INTERVAL_MS = 10_000

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatChannel {
  id: string
  name: string
  display_name: string
  description: string | null
  visibility: 'public' | 'private' | 'direct'
  last_read_at: string | null
  message_count: number
}

export interface ChatMessage {
  id: string
  body: string
  posted_by_user_id: string
  posted_by_user_name: string
  posted_by_agent: string | null
  references_issue: number | null
  references_commit: string | null
  references_message_id: string | null
  during_game_id: string | null
  created_at: string
}

export interface PostMessageInput {
  body: string
  references_issue?: number
  references_commit?: string
  references_message_id?: string
}

interface MessagesResponse {
  channel: { id: string; name: string; display_name: string; visibility: string }
  messages: ChatMessage[]
  last_read_at: string | null
}

interface ChannelsResponse {
  channels: ChatChannel[]
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function chatFetch<T>(
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown }
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const res = await fetch(`${CHAT_API_BASE}/${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })

  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

// ─── Channels list (used to read last_read_at) ───────────────────────────────

export function useChatChannels() {
  return useQuery({
    queryKey: ['chat', 'channels'],
    queryFn: () => chatFetch<ChannelsResponse>('chat/channels').then((r) => r.channels),
  })
}

// ─── Single channel: messages + post + mark read + realtime ──────────────────

export interface UseChatChannelResult {
  channel: ChatChannel | undefined
  messages: ChatMessage[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  postMessage: (input: PostMessageInput) => Promise<ChatMessage>
  isPosting: boolean
  markRead: () => Promise<void>
  unreadCount: number
}

export function useChatChannel(channelName: string): UseChatChannelResult {
  const queryClient = useQueryClient()
  const messagesKey = ['chat', 'messages', channelName]
  const channelsKey = ['chat', 'channels']

  // Channels query (for last_read_at + channel metadata).
  const channelsQ = useChatChannels()
  const channel = channelsQ.data?.find((c) => c.name === channelName)

  // Messages query: fetch with mark_read=false so the unread badge can render
  // before the user actually views the panel. The component calls markRead()
  // explicitly when appropriate.
  const messagesQ = useQuery({
    queryKey: messagesKey,
    queryFn: async () => {
      const data = await chatFetch<MessagesResponse>(
        `chat/channels/${encodeURIComponent(channelName)}/messages?limit=100&mark_read=false`
      )
      return data
    },
    refetchInterval: POLL_INTERVAL_MS, // realtime fallback
    // 404 (channel not found) shouldn't retry — it's not transient. Retrying
    // also stretches the "loading" window across the retry-backoff period,
    // which causes panels keyed off `isLoading` to flap on every poll.
    retry: false,
  })

  // Realtime: subscribe once we know the channel id. Filter on channel_id so
  // we don't pay for unrelated traffic.
  useEffect(() => {
    const channelId = messagesQ.data?.channel.id
    if (!channelId) return

    const sub = supabase
      .channel(`chat-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          // Refetch instead of patching: the API hydrates posted_by_user_name
          // from a join the realtime payload doesn't include.
          queryClient.invalidateQueries({ queryKey: messagesKey })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesQ.data?.channel.id])

  // Post mutation with optimistic update.
  const postMutation = useMutation({
    mutationFn: async (input: PostMessageInput) => {
      const data = await chatFetch<{ id: string; created_at: string }>(
        `chat/channels/${encodeURIComponent(channelName)}/messages`,
        { method: 'POST', body: input }
      )
      return data
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: messagesKey })
      const previous = queryClient.getQueryData<MessagesResponse>(messagesKey)
      if (previous) {
        const optimistic: ChatMessage = {
          id: `optimistic-${Date.now()}`,
          body: input.body,
          posted_by_user_id: 'self',
          posted_by_user_name: 'You',
          posted_by_agent: null,
          references_issue: input.references_issue ?? null,
          references_commit: input.references_commit ?? null,
          references_message_id: input.references_message_id ?? null,
          during_game_id: null,
          created_at: new Date().toISOString(),
        }
        queryClient.setQueryData<MessagesResponse>(messagesKey, {
          ...previous,
          messages: [...previous.messages, optimistic],
        })
      }
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(messagesKey, ctx.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey })
    },
  })

  const postMessage = async (input: PostMessageInput) => {
    const result = await postMutation.mutateAsync(input)
    // Return type intentionally minimal — caller mainly needs success/failure.
    return {
      id: result.id,
      body: input.body,
      posted_by_user_id: 'self',
      posted_by_user_name: 'You',
      posted_by_agent: null,
      references_issue: input.references_issue ?? null,
      references_commit: input.references_commit ?? null,
      references_message_id: input.references_message_id ?? null,
      during_game_id: null,
      created_at: result.created_at,
    } as ChatMessage
  }

  // Mark read: POST to /read endpoint and bump the channels query cache so
  // the unread badge updates immediately.
  const markRead = async () => {
    try {
      const result = await chatFetch<{ last_read_at: string }>(
        `chat/channels/${encodeURIComponent(channelName)}/read`,
        { method: 'POST' }
      )
      queryClient.setQueryData<ChatChannel[]>(channelsKey, (prev) =>
        prev?.map((c) =>
          c.name === channelName ? { ...c, last_read_at: result.last_read_at } : c
        ) ?? prev
      )
    } catch {
      // Non-fatal; the next channels refetch will reconcile.
    }
  }

  const messages = messagesQ.data?.messages ?? []

  const unreadCount = useMemo(() => {
    if (!channel?.last_read_at) return messages.length
    const lastReadMs = new Date(channel.last_read_at).getTime()
    return messages.filter((m) => new Date(m.created_at).getTime() > lastReadMs).length
  }, [messages, channel?.last_read_at])

  return {
    channel,
    messages,
    isLoading: messagesQ.isLoading || channelsQ.isLoading,
    isError: messagesQ.isError || channelsQ.isError,
    error: (messagesQ.error ?? channelsQ.error) as Error | null,
    postMessage,
    isPosting: postMutation.isPending,
    markRead,
    unreadCount,
  }
}

// ─── Start a direct message channel ──────────────────────────────────────────

interface StartDmResponse {
  id: string
  name: string
  display_name: string
  visibility: 'direct'
}

export function useStartDirectMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recipientUserId: string): Promise<StartDmResponse> => {
      return await chatFetch<StartDmResponse>('chat/dm', {
        method: 'POST',
        body: { recipient_user_id: recipientUserId },
      })
    },
    onSuccess: () => {
      // Force the channels list to refetch so the new DM channel appears
      // in the lobby chat panel switcher.
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] })
    },
  })
}
