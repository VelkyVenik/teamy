import type { ChatMessage, PaginatedResponse, PendingImage, UseMessagesReturn } from '~/types/graph'

const POLL_INTERVAL_MS = 5000
const MAX_CACHE_SIZE = 20

interface CachedChat {
  messages: ChatMessage[]
  nextLink: string | null
}

// Module-level cache shared across all instances — reactive so computed properties track changes
const messageCache = reactive(new Map<string, CachedChat>())

function evictOldest() {
  if (messageCache.size > MAX_CACHE_SIZE) {
    // Map iterates in insertion order — first key is the oldest
    const oldest = messageCache.keys().next().value
    if (oldest) messageCache.delete(oldest)
  }
}

export function useMessages(chatId: Ref<string | null>): UseMessagesReturn {
  const { graphFetch, graphFetchPage } = useGraph()

  const messages = computed<ChatMessage[]>(() => {
    if (!chatId.value) return []
    return messageCache.get(chatId.value)?.messages ?? []
  })
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const hasMore = computed(() => {
    if (!chatId.value) return false
    return !!(messageCache.get(chatId.value)?.nextLink)
  })
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function fetchMessages() {
    if (!chatId.value) return
    const id = chatId.value

    const cached = messageCache.get(id)
    // Only show loading spinner on cache miss
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
      // Re-insert to refresh LRU order (delete + set moves to end)
      messageCache.delete(id)
      messageCache.set(id, {
        messages: page.value.reverse(),
        nextLink: page['@odata.nextLink'] ?? null,
      })
      evictOldest()
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
    if (!chatId.value) return
    const id = chatId.value
    const cached = messageCache.get(id)
    if (!cached?.nextLink || loadingMore.value) return

    loadingMore.value = true
    try {
      const page = await graphFetchPage<ChatMessage>(cached.nextLink)
      // Prepend older messages
      cached.messages = [...page.value.reverse(), ...cached.messages]
      cached.nextLink = page['@odata.nextLink'] ?? null
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

      const cached = messageCache.get(id)
      if (!cached) return

      const existing = new Set(cached.messages.map(m => m.id))
      const newMessages = page.value.filter(m => !existing.has(m.id))

      if (newMessages.length > 0) {
        cached.messages = [...cached.messages, ...newMessages.reverse()]
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

  // Re-fetch when chatId changes
  watch(chatId, (newId) => {
    if (newId) {
      fetchMessages()
      startPolling()
    }
    else {
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
