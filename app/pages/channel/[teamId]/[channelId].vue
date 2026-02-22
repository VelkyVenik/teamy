<script setup lang="ts">
import type { ChannelMessage, PendingImage } from '~~/types/graph'

const route = useRoute()
const router = useRouter()

const teamId = computed(() => route.params.teamId as string)
const channelId = computed(() => route.params.channelId as string)

const { chats, fetchChats } = useChats()
const { teams, channels, fetchTeams, fetchAssociatedTeams, fetchChannels, fetchChannelMessages, sendChannelMessage } = useChannels()

const channelMessages = ref<ChannelMessage[]>([])
const loading = ref(false)

const currentChannel = computed(() => {
  const teamChannels = channels.value.get(teamId.value) ?? []
  return teamChannels.find(c => c.id === channelId.value)
})

const currentTeam = computed(() => teams.value.find(t => t.id === teamId.value))

const title = computed(() => {
  if (currentTeam.value && currentChannel.value) {
    return `${currentTeam.value.displayName} / #${currentChannel.value.displayName}`
  }
  return ''
})

async function loadMessages() {
  loading.value = true
  channelMessages.value = await fetchChannelMessages(teamId.value, channelId.value)
  loading.value = false
}

async function handleSend(content: string, images: PendingImage[] = []) {
  await sendChannelMessage(teamId.value, channelId.value, content, 'text', images)
  channelMessages.value = await fetchChannelMessages(teamId.value, channelId.value)
}

watch([teamId, channelId], () => {
  loadMessages()
})

function selectChat(chat: any) {
  router.push(`/chat/${chat.id}`)
}

function selectChannel(tId: string, cId: string) {
  router.push(`/channel/${tId}/${cId}`)
}

onMounted(async () => {
  await Promise.allSettled([fetchChats(), fetchTeams()])
  await fetchAssociatedTeams()
  if (teams.value.length > 0) {
    await Promise.allSettled(teams.value.map(team => fetchChannels(team.id)))
  }
  await loadMessages()
})
</script>

<template>
  <NuxtLayout>
    <template #sidebar>
      <AppSidebar
        :chats="chats"
        :teams="teams"
        :channels="channels"
        :active-team-id="teamId"
        :active-channel-id="channelId"
        @select-chat="selectChat"
        @select-channel="selectChannel"
      />
    </template>

    <template #default>
      <div class="flex items-center justify-between px-4 py-3 border-b border-(--ui-border)">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-hash" class="size-4 text-(--ui-text-muted)" />
          <span class="text-sm font-medium text-(--ui-text-highlighted)">{{ title }}</span>
        </div>
        <div v-if="currentChannel?.description" class="text-xs text-(--ui-text-muted)">
          {{ currentChannel.description }}
        </div>
      </div>
      <MessageThread :messages="channelMessages" :loading="loading" />
      <ComposeBar :draft-key="`${teamId}-${channelId}`" @send="handleSend" />
    </template>
  </NuxtLayout>
</template>
