import type { ChatMessage, PaginatedResponse, PendingImage, UseMessagesReturn } from '~/types/graph'

const POLL_INTERVAL_MS = 5000
const MAX_CACHE_SIZE = 20

interface CachedChat {
  messages: ChatMessage[]
  nextLink: string | null
}

// Plain Map for storage — no reactivity needed, the per-instance `messages` ref drives the UI
const messageCache = new Map<string, CachedChat>()

function evictOldest() {
  if (messageCache.size > MAX_CACHE_SIZE) {
    const oldest = messageCache.keys().next().value
    if (oldest) messageCache.delete(oldest)
  }
}

export function useMessages(chatId: Ref<string | null>): UseMessagesReturn {
  const { graphFetch, graphFetchPage } = useGraph()

  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(false)
  const nextLink = ref<string | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  /** Sync the ref + cache entry for the current chat */
  function updateMessages(id: string, msgs: ChatMessage[], link: string | null) {
    // Update cache (delete + set to refresh LRU order)
    messageCache.delete(id)
    messageCache.set(id, { messages: msgs, nextLink: link })
    evictOldest()
    // Update refs if still viewing this chat
    if (chatId.value === id) {
      messages.value = msgs
      nextLink.value = link
      hasMore.value = !!link
    }
  }

  async function fetchMessages() {
    if (!chatId.value) return
    const id = chatId.value

    // Only show spinner on cache miss
    const cached = messageCache.get(id)
    if (!cached) {
      loading.value = true
    }

    error.value = null
    try {
      const page = await graphFetchPage<ChatMessage>(`/me/chats/${id}/messages`, {
        params: {
          $top: '50',
          $orderby: 'createdDateTime desc',
        },
      })
      updateMessages(id, page.value.reverse(), page['@odata.nextLink'] ?? null)
    }
    catch (err: any) {
      console.error('[useMessages] fetchMessages failed:', err)
      error.value = err?.error?.message ?? err?.message ?? 'Failed to fetch messages'
    }
    finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!chatId.value || !nextLink.value || loadingMore.value) return
    const id = chatId.value

    loadingMore.value = true
    try {
      const page = await graphFetchPage<ChatMessage>(nextLink.value)
      const merged = [...page.value.reverse(), ...messages.value]
      updateMessages(id, merged, page['@odata.nextLink'] ?? null)
    }
    catch (err: any) {
      console.error('[useMessages] loadMore failed:', err)
      error.value = err?.error?.message ?? err?.message ?? 'Failed to load more messages'
    }
    finally {
      loadingMore.value = false
    }
  }

  async function sendMessage(content: string, contentType: 'text' | 'html' = 'text', images: PendingImage[] = []) {
    if (!chatId.value) return

    const payload = await buildMessagePayload(content, images)
    await graphFetch(`/me/chats/${chatId.value}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    // Refresh to get the sent message with server-assigned ID
    await pollForNew()
  }

  async function pollForNew() {
    if (!chatId.value) return
    const id = chatId.value

    try {
      const page = await graphFetchPage<ChatMessage>(`/me/chats/${id}/messages`, {
        params: { $top: '10', $orderby: 'createdDateTime desc' },
      })

      const existing = new Set(messages.value.map(m => m.id))
      const newMessages = page.value.filter(m => !existing.has(m.id))

      if (newMessages.length > 0) {
        const merged = [...messages.value, ...newMessages.reverse()]
        updateMessages(id, merged, nextLink.value)
      }
    }
    catch {
      // Silently ignore poll errors
    }
  }

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(pollForNew, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  // Re-fetch when chatId changes — restore from cache instantly if available
  watch(chatId, (newId) => {
    if (newId) {
      const cached = messageCache.get(newId)
      if (cached) {
        messages.value = cached.messages
        nextLink.value = cached.nextLink
        hasMore.value = !!cached.nextLink
      }
      else {
        messages.value = []
        nextLink.value = null
        hasMore.value = false
      }
      fetchMessages()
      startPolling()
    }
    else {
      messages.value = []
      nextLink.value = null
      hasMore.value = false
      stopPolling()
    }
  })

  // Cleanup on unmount
  onUnmounted(() => {
    stopPolling()
  })

  return {
    messages,
    loading,
    loadingMore,
    error,
    hasMore,
    fetchMessages,
    loadMore,
    sendMessage,
    startPolling,
    stopPolling,
  }
}

// Convenience composable for real-time message watching
export function useRealtimeMessages(chatId: Ref<string | null>) {
  const result = useMessages(chatId)

  // Auto-start polling when there's a valid chatId
  if (chatId.value) {
    result.fetchMessages()
    result.startPolling()
  }

  return result
}
