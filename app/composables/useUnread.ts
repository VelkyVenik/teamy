import type { Chat } from '~/types/graph'

// Module-level shared state — all callers of useUnread() see the same data
const unreadChatIds = ref<Set<string>>(new Set())

const totalUnread = computed(() => unreadChatIds.value.size)

function updateFromChats(chats: Chat[]) {
  const newUnread = new Set<string>()
  for (const chat of chats) {
    const lastMsg = chat.lastMessagePreview?.createdDateTime
    const lastRead = chat.viewpoint?.lastMessageReadDateTime
    if (lastMsg && (!lastRead || lastMsg > lastRead)) {
      newUnread.add(chat.id)
    }
  }
  unreadChatIds.value = newUnread
}

function isUnread(chatId: string): boolean {
  return unreadChatIds.value.has(chatId)
}

export function useUnread() {
  const { graphFetch } = useGraph()
  const { currentUserId } = useCurrentUser()

  async function markChatRead(chatId: string) {
    // Optimistically remove from unread set
    const updated = new Set(unreadChatIds.value)
    updated.delete(chatId)
    unreadChatIds.value = updated

    // Fire-and-forget Graph API call
    graphFetch(`/chats/${chatId}/markChatReadForUser`, {
      method: 'POST',
      body: JSON.stringify({
        user: { id: currentUserId.value },
      }),
    }).catch((err) => {
      console.warn('[useUnread] markChatReadForUser failed:', err)
    })
  }

  return {
    unreadChatIds,
    totalUnread,
    updateFromChats,
    isUnread,
    markChatRead,
  }
}
