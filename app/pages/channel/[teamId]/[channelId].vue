<script setup lang="ts">
import type { ChannelMessage, PendingImage } from '~~/types/graph'

const MAX_CHANNEL_CACHE_SIZE = 20
const channelPageCache = new Map<string, ChannelMessage[]>()

function cacheKey(teamId: string, channelId: string) {
  return `${teamId}-${channelId}`
}

function evictOldest() {
  if (channelPageCache.size > MAX_CHANNEL_CACHE_SIZE) {
    const oldest = channelPageCache.keys().next().value
    if (oldest) channelPageCache.delete(oldest)
  }
}

const route = useRoute()
const router = useRouter()

const teamId = computed(() => route.params.teamId as string)
const channelId = computed(() => route.params.channelId as string)

const { chats, fetchChats } = useChats()
const { teams, channels, fetchTeams, fetchAssociatedTeams, fetchChannels, fetchChannelMessages, sendChannelMessage } = useChannels()
const { getLastRead, markChannelRead, touchReadTimestamp, setExactCount } = useUnreadStore()
const { currentUserId } = useCurrentUser()

const channelMessages = ref<ChannelMessage[]>([])
const loading = ref(false)

// Local snapshot of the read position — captured once on channel open,
// decoupled from the sidebar's reactive chain.
const threadLastRead = ref<string | null>(null)

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

function computeAndSetUnreadCount() {
  if (threadLastRead.value) {
    const unreadCount = channelMessages.value.filter(m =>
      m.createdDateTime > threadLastRead.value! && m.from?.user?.id !== currentUserId.value,
    ).length
    setExactCount('channel', channelId.value, unreadCount, teamId.value)
  }
}

async function loadMessages() {
  // Capture last-read before marking channel read
  threadLastRead.value = getLastRead('channel', channelId.value, teamId.value)
  markChannelRead(teamId.value, channelId.value)

  const key = cacheKey(teamId.value, channelId.value)
  const cached = channelPageCache.get(key)

  if (cached) {
    channelMessages.value = cached
    computeAndSetUnreadCount()
    // Refresh in background
    fetchChannelMessages(teamId.value, channelId.value).then((fresh) => {
      channelPageCache.delete(key)
      channelPageCache.set(key, fresh)
      evictOldest()
      // Only update if still viewing this channel
      if (cacheKey(teamId.value, channelId.value) === key) {
        channelMessages.value = fresh
        computeAndSetUnreadCount()
      }
    })
  }
  else {
    loading.value = true
    const fresh = await fetchChannelMessages(teamId.value, channelId.value)
    channelPageCache.set(key, fresh)
    evictOldest()
    channelMessages.value = fresh
    computeAndSetUnreadCount()
    loading.value = false
  }
}

async function handleSend(content: string, images: PendingImage[] = []) {
  await sendChannelMessage(teamId.value, channelId.value, content, 'text', images)
  const fresh = await fetchChannelMessages(teamId.value, channelId.value)
  const key = cacheKey(teamId.value, channelId.value)
  channelPageCache.delete(key)
  channelPageCache.set(key, fresh)
  evictOldest()
  channelMessages.value = fresh
  // User sent a message — they're caught up, clear the divider
  threadLastRead.value = new Date().toISOString()
}

watch([teamId, channelId], () => {
  clearTimeout(dividerTimer)
  dividerTimer = undefined
  loadMessages()
})

// Auto-dismiss the "New messages" divider after a short delay
let dividerTimer: ReturnType<typeof setTimeout> | undefined

watch(channelMessages, (msgs) => {
  if (msgs.length && threadLastRead.value && !dividerTimer) {
    dividerTimer = setTimeout(() => {
      threadLastRead.value = new Date().toISOString()
      dividerTimer = undefined
    }, 3000)
  }
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
      <MessageThread :messages="channelMessages" :loading="loading" :is-channel="true" :last-read-date-time="threadLastRead" />
      <ComposeBar :draft-key="`${teamId}-${channelId}`" @send="handleSend" />
    </template>
  </NuxtLayout>
</template>
