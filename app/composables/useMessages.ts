import type { ChatMessage, PaginatedResponse, PendingImage, UseMessagesReturn } from '~/types/graph'

const POLL_INTERVAL_MS = 5000

export function useMessages(chatId: Ref<string | null>): UseMessagesReturn {
  const { graphFetch, graphFetchPage } = useGraph()

  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(false)
  const nextLink = ref<string | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function fetchMessages() {
    if (!chatId.value) return

    loading.value = true
    error.value = null
    try {
      const page = await graphFetchPage<ChatMessage>(`/me/chats/${chatId.value}/messages`, {
        params: {
          $top: '50',
          $orderby: 'createdDateTime desc',
        },
      })
      messages.value = page.value.reverse()
      nextLink.value = page['@odata.nextLink'] ?? null
      hasMore.value = !!nextLink.value
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
    if (!nextLink.value || loadingMore.value) return

    loadingMore.value = true
    try {
      const page = await graphFetchPage<ChatMessage>(nextLink.value)
      // Prepend older messages
      messages.value = [...page.value.reverse(), ...messages.value]
      nextLink.value = page['@odata.nextLink'] ?? null
      hasMore.value = !!nextLink.value
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

    try {
      const page = await graphFetchPage<ChatMessage>(`/me/chats/${chatId.value}/messages`, {
        params: { $top: '10', $orderby: 'createdDateTime desc' },
      })

      const existing = new Set(messages.value.map(m => m.id))
      const newMessages = page.value.filter(m => !existing.has(m.id))

      if (newMessages.length > 0) {
        messages.value = [...messages.value, ...newMessages.reverse()]
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
      messages.value = []
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
