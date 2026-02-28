import type { Chat } from '~/types/graph'

export function useChatHelpers() {
  const { currentUserId } = useCurrentUser()

  function getChatDisplayName(chat: Chat): string {
    if (chat.topic) return chat.topic

    // Try members array first (available when chats are fetched with $expand=members)
    if (chat.members?.length) {
      const others = chat.members.filter(m => m.userId !== currentUserId.value)
      if (others.length > 0) {
        const names = others.map(m => m.displayName?.split(' ')[0]).filter(Boolean)
        if (chat.chatType === 'group' || others.length > 1) {
          const MAX_SHOWN = 3
          const shown = names.slice(0, MAX_SHOWN).join(', ')
          const remaining = names.length - MAX_SHOWN
          return remaining > 0 ? `${shown}, +${remaining}` : shown
        }
        if (names[0]) return others[0]!.displayName
      }
    }

    // Fallback: use lastMessagePreview sender name (may be the current user for own messages)
    const previewFrom = chat.lastMessagePreview?.from?.user?.displayName
    if (previewFrom) return previewFrom

    return chat.chatType === 'group' ? 'Group Chat' : 'Chat'
  }

  function getChatAvatar(chat: Chat): string | undefined {
    if (chat.chatType === 'group') return undefined
    const other = chat.members?.find(m => m.userId !== currentUserId.value)
    if (!other?.displayName) return undefined
    return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(other.displayName)}`
  }

  function getUnreadCount(chatId: string): number {
    return useUnreadStore().getUnreadCount('chat', chatId)
  }

  return {
    currentUserId,
    getChatDisplayName,
    getChatAvatar,
    getUnreadCount,
  }
}
