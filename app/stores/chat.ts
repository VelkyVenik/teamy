import { defineStore } from 'pinia'
import type { Chat, ChatMessage } from '~/types/graph'

export const useChatStore = defineStore('chat', () => {
  const chats = ref<Chat[]>([])
  const activeChatId = ref<string | null>(null)
  const messages = ref<Map<string, ChatMessage[]>>(new Map())
  const unreadCounts = ref<Map<string, number>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeChat = computed(() =>
    chats.value.find(c => c.id === activeChatId.value) ?? null,
  )

  const activeMessages = computed(() =>
    activeChatId.value ? (messages.value.get(activeChatId.value) ?? []) : [],
  )

  const totalUnread = computed(() => {
    let count = 0
    for (const n of unreadCounts.value.values()) {
      count += n
    }
    return count
  })

  const sortedChats = computed(() => {
    return [...chats.value].sort((a, b) => {
      const aTime = a.lastMessagePreview?.createdDateTime ?? a.lastUpdatedDateTime ?? a.createdDateTime
      const bTime = b.lastMessagePreview?.createdDateTime ?? b.lastUpdatedDateTime ?? b.createdDateTime
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
  })

  function setChats(newChats: Chat[]) {
    chats.value = newChats
  }

  function setActiveChat(chatId: string | null) {
    activeChatId.value = chatId
    if (chatId) {
      unreadCounts.value.set(chatId, 0)
      unreadCounts.value = new Map(unreadCounts.value)
    }
  }

  function setChatMessages(chatId: string, msgs: ChatMessage[]) {
    messages.value.set(chatId, msgs)
    messages.value = new Map(messages.value)
  }

  function appendMessage(chatId: string, message: ChatMessage) {
    const existing = messages.value.get(chatId) ?? []
    if (!existing.find(m => m.id === message.id)) {
      messages.value.set(chatId, [...existing, message])
      messages.value = new Map(messages.value)

      // Increment unread if not the active chat
      if (chatId !== activeChatId.value) {
        const current = unreadCounts.value.get(chatId) ?? 0
        unreadCounts.value.set(chatId, current + 1)
        unreadCounts.value = new Map(unreadCounts.value)
      }
    }
  }

  function setLoading(val: boolean) {
    loading.value = val
  }

  function setError(val: string | null) {
    error.value = val
  }

  return {
    chats,
    activeChatId,
    activeChat,
    activeMessages,
    messages,
    unreadCounts,
    totalUnread,
    sortedChats,
    loading,
    error,
    setChats,
    setActiveChat,
    setChatMessages,
    appendMessage,
    setLoading,
    setError,
  }
})
