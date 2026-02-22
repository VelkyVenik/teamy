import type { Chat } from '~/types/graph'

// Module-level shared state — all callers of useUnread() see the same data
const unreadChatIds = ref<Set<string>>(new Set())

// Plain reactive object — Vue tracks property access/mutation reliably
const localReadTimestamps = reactive<Record<string, string>>({})

const totalUnread = computed(() => unreadChatIds.value.size)

function getEffectiveLastRead(chat: Chat): string | undefined {
  return localReadTimestamps[chat.id] ?? chat.viewpoint?.lastMessageReadDateTime
}

function updateFromChats(chats: Chat[]) {
  const newUnread = new Set<string>()
  for (const chat of chats) {
    const lastMsg = chat.lastMessagePreview?.createdDateTime
    const lastRead = getEffectiveLastRead(chat)
    if (lastMsg && (!lastRead || lastMsg > lastRead)) {
      newUnread.add(chat.id)
    }
  }
  unreadChatIds.value = newUnread
}

function isUnread(chatId: string): boolean {
  return unreadChatIds.value.has(chatId)
}

/** Best-known last-read timestamp for divider snapshots (max of local + server). */
function getSnapshotLastRead(chatId: string, serverTimestamp?: string): string | null {
  const local = localReadTimestamps[chatId]
  if (local && serverTimestamp) return local > serverTimestamp ? local : serverTimestamp
  return local ?? serverTimestamp ?? null
}

/** Update only the local timestamp (no API call) — used while actively viewing.
 *  Accepts an optional messageTimestamp to prevent clock-skew from re-marking as unread. */
function touchReadTimestamp(chatId: string, messageTimestamp?: string) {
  const now = new Date().toISOString()
  localReadTimestamps[chatId] = messageTimestamp && messageTimestamp > now
    ? messageTimestamp
    : now

  const updated = new Set(unreadChatIds.value)
  updated.delete(chatId)
  unreadChatIds.value = updated
}

export function useUnread() {
  const { graphFetch } = useGraph()
  const { currentUserId } = useCurrentUser()

  async function markChatRead(chatId: string) {
    localReadTimestamps[chatId] = new Date().toISOString()

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
    touchReadTimestamp,
    getSnapshotLastRead,
  }
}
