<script setup lang="ts">
import type { PendingImage } from '~/types/graph'

const route = useRoute()
const router = useRouter()

const chatId = computed(() => route.params.chatId as string)
const activeChatId = ref<string | null>(chatId.value)

const { markChatRead, touchReadTimestamp, getSnapshotLastRead } = useUnread()

const { chats, fetchChats, refreshChats } = useChats()
const { updateFromChats } = useUnread()
const { getChatDisplayName } = useChatHelpers()
const { teams, channels, fetchTeams, fetchAssociatedTeams, fetchChannels } = useChannels()
const { messages, loading, sendMessage } = useMessages(activeChatId)

const currentChat = computed(() => chats.value.find(c => c.id === chatId.value))
const title = computed(() => currentChat.value ? getChatDisplayName(currentChat.value) : '')

// Local snapshot of the read position — captured once on chat open,
// decoupled from the sidebar's localReadTimestamps reactive chain.
const threadLastRead = ref<string | null>(null)

// Snapshot viewpoint BEFORE markChatRead overwrites it, then mark read
watch(chatId, (id) => {
  clearTimeout(dividerTimer)
  dividerTimer = undefined
  activeChatId.value = id
  const chat = chats.value.find(c => c.id === id)
  threadLastRead.value = getSnapshotLastRead(id, chat?.viewpoint?.lastMessageReadDateTime)
  markChatRead(id)
}, { immediate: true })

// If chats weren't loaded when chatId watcher first ran (direct navigation),
// capture the viewpoint once chats become available.
watch(currentChat, (chat) => {
  if (threadLastRead.value === null && chat?.viewpoint?.lastMessageReadDateTime) {
    threadLastRead.value = getSnapshotLastRead(chatId.value, chat.viewpoint.lastMessageReadDateTime)
  }
})

// Keep sidebar unread indicators current
watch(chats, c => updateFromChats(c))
let refreshTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await Promise.allSettled([fetchChats(), fetchTeams()])
  await fetchAssociatedTeams()
  if (teams.value.length > 0) {
    await Promise.allSettled(teams.value.map(team => fetchChannels(team.id)))
  }
  updateFromChats(chats.value)
  refreshTimer = setInterval(() => refreshChats(), 10_000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = undefined
  }
})

// Auto-dismiss the "New messages" divider after a short delay
let dividerTimer: ReturnType<typeof setTimeout> | undefined

// Keep sidebar read timestamp current while viewing
watch(messages, (msgs) => {
  if (msgs.length) {
    const last = msgs[msgs.length - 1]
    touchReadTimestamp(chatId.value, last.createdDateTime)
    // Once messages are visible, start a one-time timer to clear the divider
    if (threadLastRead.value && !dividerTimer) {
      dividerTimer = setTimeout(() => {
        threadLastRead.value = new Date().toISOString()
        dividerTimer = undefined
      }, 3000)
    }
  }
})

async function handleSend(content: string, images: PendingImage[] = []) {
  await sendMessage(content, 'text', images)
  // User sent a message — they're caught up, clear the divider
  threadLastRead.value = new Date().toISOString()
}

function selectChat(chat: any) {
  router.push(`/chat/${chat.id}`)
}

function selectChannel(teamId: string, channelId: string) {
  router.push(`/channel/${teamId}/${channelId}`)
}
</script>

<template>
  <NuxtLayout>
    <template #sidebar>
      <AppSidebar
        :chats="chats"
        :teams="teams"
        :channels="channels"
        :active-chat-id="chatId"
        @select-chat="selectChat"
        @select-channel="selectChannel"
      />
    </template>

    <template #default>
      <div class="flex items-center gap-2 px-4 py-3 border-b border-(--ui-border)">
        <UIcon name="i-lucide-message-circle" class="size-4 text-(--ui-text-muted)" />
        <span class="text-sm font-medium text-(--ui-text-highlighted)">{{ title }}</span>
      </div>
      <MessageThread :messages="messages" :loading="loading" :last-read-date-time="threadLastRead" />
      <ComposeBar :draft-key="chatId" @send="handleSend" />
    </template>
  </NuxtLayout>
</template>
