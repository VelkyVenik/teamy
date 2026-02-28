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

// Module-level set of chat IDs that were individually fetched for sections.
// Kept across refreshes so they aren't lost when refreshChats replaces the list.
const sectionChatIds = new Set<string>()
const sectionChatsById = new Map<string, Chat>()

export function useChats(): UseChatsReturn {
  const { graphFetch, graphFetchPage } = useGraph()

  const chats = ref<Chat[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Merge individually-fetched section chats into the main list. */
  function mergeWithSectionChats(pageChats: Chat[]): Chat[] {
    if (sectionChatsById.size === 0) return pageChats
    const pageIds = new Set(pageChats.map(c => c.id))
    const extras: Chat[] = []
    for (const [id, chat] of sectionChatsById) {
      if (!pageIds.has(id)) extras.push(chat)
    }
    return [...pageChats, ...extras]
  }

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
      chats.value = sortChatsByLastMessage(filterVisibleChats(mergeWithSectionChats(page.value)))
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
      chats.value = sortChatsByLastMessage(filterVisibleChats(mergeWithSectionChats(page.value)))
    }
    catch (err: any) {
      console.error('[useChats] refreshChats failed:', err)
      error.value = err?.error?.message ?? err?.message ?? 'Failed to refresh chats'
    }
  }

  /**
   * Fetch chats that are in sidebar sections but not in the latest page.
   * Call after both fetchChats() and loadSections() have completed.
   */
  async function ensureSectionChatsLoaded(requiredChatIds: string[]) {
    const loadedIds = new Set(chats.value.map(c => c.id))
    const missing = requiredChatIds.filter(id => !loadedIds.has(id) && !sectionChatIds.has(id))
    if (missing.length === 0) return

    const fetched: Chat[] = []
    await Promise.allSettled(missing.map(async (chatId) => {
      try {
        const chat = await graphFetch<Chat>(`/me/chats/${chatId}`, {
          params: { $expand: 'lastMessagePreview,members' },
        })
        fetched.push(chat)
        sectionChatIds.add(chatId)
        sectionChatsById.set(chatId, chat)
      }
      catch (err) {
        console.warn(`[useChats] Failed to fetch section chat ${chatId}:`, err)
      }
    }))

    if (fetched.length > 0) {
      chats.value = sortChatsByLastMessage([...chats.value, ...fetched])
    }
  }

  return {
    chats,
    loading,
    error,
    fetchChats,
    refreshChats,
    ensureSectionChatsLoaded,
  }
}
