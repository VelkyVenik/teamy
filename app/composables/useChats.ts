import type { Chat, UseChatsReturn } from '~/types/graph'

function sortChatsByLastMessage(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    const dateA = a.lastMessagePreview?.createdDateTime ?? a.lastUpdatedDateTime ?? ''
    const dateB = b.lastMessagePreview?.createdDateTime ?? b.lastUpdatedDateTime ?? ''
    return dateB.localeCompare(dateA)
  })
}

function filterVisibleChats(chats: Chat[]): Chat[] {
  return chats.filter(c => !c.viewpoint?.isHidden)
}

export function useChats(): UseChatsReturn {
  const { graphFetchPage } = useGraph()

  const chats = ref<Chat[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchChats() {
    loading.value = true
    error.value = null
    try {
      // Fetch a single page of recent chats (not all pages — users can have thousands).
      // Graph API does not support $orderby combined with $expand=members,
      // so we sort client-side.
      const page = await graphFetchPage<Chat>('/me/chats', {
        params: {
          $expand: 'lastMessagePreview,members',
          $top: '50',
        },
      })
      chats.value = sortChatsByLastMessage(filterVisibleChats(page.value))
    }
    catch (err: any) {
      console.error('[useChats] fetchChats failed:', err)
      error.value = err?.error?.message ?? err?.message ?? 'Failed to fetch chats'
    }
    finally {
      loading.value = false
    }
  }

  async function refreshChats() {
    try {
      const page = await graphFetchPage<Chat>('/me/chats', {
        params: {
          $expand: 'lastMessagePreview,members',
          $top: '50',
        },
      })
      chats.value = sortChatsByLastMessage(filterVisibleChats(page.value))
    }
    catch (err: any) {
      console.error('[useChats] refreshChats failed:', err)
      error.value = err?.error?.message ?? err?.message ?? 'Failed to refresh chats'
    }
  }

  return {
    chats,
    loading,
    error,
    fetchChats,
    refreshChats,
  }
}
