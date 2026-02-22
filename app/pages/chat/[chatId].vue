<script setup lang="ts">
import type { PendingImage } from '~/types/graph'

const route = useRoute()
const router = useRouter()

const chatId = computed(() => route.params.chatId as string)
const activeChatId = ref<string | null>(chatId.value)

const { markChatRead } = useUnread()

watch(chatId, (newId) => {
  activeChatId.value = newId
  markChatRead(newId)
})

const { chats, fetchChats } = useChats()
const { getChatDisplayName } = useChatHelpers()
const { teams, channels, fetchTeams, fetchAssociatedTeams, fetchChannels } = useChannels()
const { messages, loading, sendMessage } = useMessages(activeChatId)

const currentChat = computed(() => chats.value.find(c => c.id === chatId.value))
const title = computed(() => currentChat.value ? getChatDisplayName(currentChat.value) : '')

onMounted(async () => {
  await Promise.allSettled([fetchChats(), fetchTeams()])
  await fetchAssociatedTeams()
  if (teams.value.length > 0) {
    await Promise.allSettled(teams.value.map(team => fetchChannels(team.id)))
  }
  markChatRead(chatId.value)
})

async function handleSend(content: string, images: PendingImage[] = []) {
  await sendMessage(content, 'text', images)
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
      <MessageThread :messages="messages" :loading="loading" />
      <ComposeBar :draft-key="chatId" @send="handleSend" />
    </template>
  </NuxtLayout>
</template>
