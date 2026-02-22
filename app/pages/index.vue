<script setup lang="ts">
import type { Chat, ChatMessage, ChannelMessage, PendingImage } from '~~/types/graph'
import { getPresenceLabel } from '~/composables/usePresence'

const router = useRouter()

const { chats, loading: chatsLoading, error: chatsError, fetchChats, refreshChats } = useChats()
const { getChatDisplayName } = useChatHelpers()
const { teams, channels, loading: channelsLoading, error: channelsError, fetchTeams, fetchAssociatedTeams, fetchChannels, fetchChannelMessages, sendChannelMessage } = useChannels()
const { startPolling: startPresencePolling, stopPolling: stopPresencePolling, fetchPresence, getPresence } = usePresence()
const { load: loadSections } = useSections()
const { results: peopleResults, loading: peopleLoading, searchPeople } = useSearch()
const { createOneOnOneChat } = useCreateChat()
const { currentUserId } = useCurrentUser()
const { updateFromChats, totalUnread, markChatRead } = useUnread()
const { setTrayUnreadCount } = useTauri()
const { graphFetch } = useGraph()

const activeChatId = ref<string | null>(null)
const activeTeamId = ref<string | null>(null)
const activeChannelId = ref<string | null>(null)

const { messages, loading: messagesLoading, sendMessage: sendChatMessage } = useMessages(activeChatId)

const channelMessages = ref<ChannelMessage[]>([])
const channelMessagesLoading = ref(false)

const currentView = computed<'chat' | 'channel' | 'empty'>(() => {
  if (activeChatId.value) return 'chat'
  if (activeTeamId.value && activeChannelId.value) return 'channel'
  return 'empty'
})

const currentTitle = computed(() => {
  if (activeChatId.value) {
    const chat = chats.value.find(c => c.id === activeChatId.value)
    if (!chat) return ''
    return getChatDisplayName(chat)
  }
  if (activeTeamId.value && activeChannelId.value) {
    const teamChannels = channels.value.get(activeTeamId.value)
    const channel = teamChannels?.find(c => c.id === activeChannelId.value)
    return channel ? `#${channel.displayName}` : ''
  }
  return ''
})

const currentMemberCount = computed(() => {
  if (activeChatId.value) {
    const chat = chats.value.find(c => c.id === activeChatId.value)
    return chat?.members?.length ?? 0
  }
  if (activeTeamId.value && activeChannelId.value) {
    return 12
  }
  return 0
})

const isChannel = computed(() => currentView.value === 'channel')

const displayMessages = computed(() => {
  if (currentView.value === 'chat') return messages.value
  if (currentView.value === 'channel') return channelMessages.value
  return []
})

const displayLoading = computed(() => {
  if (currentView.value === 'chat') return messagesLoading.value
  if (currentView.value === 'channel') return channelMessagesLoading.value
  return false
})

const loadError = computed(() => chatsError.value || channelsError.value)

function selectChat(chat: Chat) {
  activeTeamId.value = null
  activeChannelId.value = null
  activeChatId.value = chat.id
  threadMessage.value = null
  markChatRead(chat.id)
}

async function selectChannel(teamId: string, channelId: string) {
  activeChatId.value = null
  activeTeamId.value = teamId
  activeChannelId.value = channelId
  threadMessage.value = null
  channelMessagesLoading.value = true
  channelMessages.value = await fetchChannelMessages(teamId, channelId)
  channelMessagesLoading.value = false
}

async function handleSend(content: string, images: PendingImage[] = []) {
  if (currentView.value === 'chat' && activeChatId.value) {
    await sendChatMessage(content, 'text', images)
  }
  else if (currentView.value === 'channel' && activeTeamId.value && activeChannelId.value) {
    await sendChannelMessage(activeTeamId.value, activeChannelId.value, content, 'text', images)
    channelMessages.value = await fetchChannelMessages(activeTeamId.value, activeChannelId.value)
  }
}

// Command palette
const commandPaletteOpen = ref(false)
provide('commandPaletteOpen', commandPaletteOpen)

function closeCommandPalette() {
  commandPaletteOpen.value = false
  searchQuery.value = ''
}

// People search with debounce
const searchQuery = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

watch(searchQuery, (query) => {
  clearTimeout(searchDebounceTimer)
  if (query.length < 2) {
    peopleResults.value = []
    return
  }
  searchDebounceTimer = setTimeout(() => {
    searchPeople(query)
  }, 300)
})

// Fetch presence for people search results when they arrive
watch(peopleResults, (results) => {
  if (results.length > 0) {
    fetchPresence(results.map(p => p.id))
  }
})

async function selectPerson(userId: string) {
  commandPaletteOpen.value = false
  try {
    const chat = await createOneOnOneChat(userId)
    await refreshChats()
    activeChatId.value = chat.id
    activeTeamId.value = null
    activeChannelId.value = null
  }
  catch (err: any) {
    console.error('[index] Failed to create/open chat:', err)
  }
}

// Thread panel (channel only)
const threadMessage = ref<ChannelMessage | null>(null)

function handleReply(message: ChatMessage) {
  if (currentView.value === 'channel') {
    threadMessage.value = message as ChannelMessage
  }
}

// Reactions — Graph API expects emoji unicode in request body
const reactionEmojiMap: Record<string, string> = {
  like: '\u{1F44D}',
  heart: '\u{2764}\u{FE0F}',
  laugh: '\u{1F602}',
  surprised: '\u{1F62E}',
  sad: '\u{1F622}',
  angry: '\u{1F621}',
}

async function handleReact(message: ChatMessage, reactionType: string) {
  const existing = message.reactions.find(
    r => r.reactionType === reactionType && r.user?.user?.id === currentUserId.value,
  )
  const action = existing ? 'unsetReaction' : 'setReaction'

  // Optimistic update
  if (existing) {
    message.reactions = message.reactions.filter(r => r !== existing)
  }
  else {
    message.reactions = [
      ...message.reactions,
      {
        reactionType,
        createdDateTime: new Date().toISOString(),
        user: { user: { displayName: '', id: currentUserId.value } },
      } as any,
    ]
  }

  // Determine the API path
  let apiPath: string
  if (currentView.value === 'chat' && activeChatId.value) {
    apiPath = `/chats/${activeChatId.value}/messages/${message.id}/${action}`
  }
  else if (currentView.value === 'channel' && activeTeamId.value && activeChannelId.value) {
    if (message.replyToId) {
      apiPath = `/teams/${activeTeamId.value}/channels/${activeChannelId.value}/messages/${message.replyToId}/replies/${message.id}/${action}`
    }
    else {
      apiPath = `/teams/${activeTeamId.value}/channels/${activeChannelId.value}/messages/${message.id}/${action}`
    }
  }
  else {
    return
  }

  try {
    await graphFetch(apiPath, {
      method: 'POST',
      body: JSON.stringify({ reactionType: reactionEmojiMap[reactionType] ?? reactionType }),
    })
  }
  catch (err) {
    console.error('[index] Reaction failed:', err)
  }
}

// Claude panel
const claudePanelOpen = ref(false)

defineShortcuts({
  meta_k: {
    usingInput: true,
    handler: () => {
      if (commandPaletteOpen.value) {
        closeCommandPalette()
      }
      else {
        commandPaletteOpen.value = true
      }
    },
  },
  escape: {
    usingInput: true,
    handler: () => {
      if (commandPaletteOpen.value) {
        closeCommandPalette()
      }
    },
  },
  meta_j: () => {
    claudePanelOpen.value = !claudePanelOpen.value
  },
})

const commandPaletteGroups = computed(() => {
  const chatItems = chats.value.map((chat) => {
    let suffix: string | undefined
    if (chat.chatType === 'oneOnOne' && chat.members) {
      const otherMember = chat.members.find(m => m.userId !== currentUserId.value)
      if (otherMember) {
        suffix = getPresenceLabel(otherMember.userId)
      }
    }
    return {
      label: getChatDisplayName(chat),
      icon: chat.chatType === 'group' ? 'i-lucide-users' : 'i-lucide-message-circle',
      suffix,
      onSelect() {
        selectChat(chat)
        commandPaletteOpen.value = false
      },
    }
  })

  const channelItems: any[] = []
  for (const team of teams.value) {
    const teamChannels = channels.value.get(team.id) ?? []
    for (const channel of teamChannels) {
      channelItems.push({
        label: `${team.displayName} / #${channel.displayName}`,
        icon: 'i-lucide-hash',
        onSelect() {
          selectChannel(team.id, channel.id)
          commandPaletteOpen.value = false
        },
      })
    }
  }

  const peopleItems = peopleLoading.value
    ? [{ label: 'Searching...', disabled: true, loading: true }]
    : peopleResults.value.map(person => ({
        label: person.displayName,
        icon: 'i-lucide-user',
        suffix: getPresenceLabel(person.id) ?? person.scoredEmailAddresses?.[0]?.address,
        onSelect() {
          selectPerson(person.id)
        },
      }))

  const groups = [
    { id: 'chats', label: 'Chats', items: chatItems },
    { id: 'channels', label: 'Channels', items: channelItems },
  ]

  if (searchQuery.value.length >= 2) {
    groups.push({
      id: 'people',
      label: 'People',
      items: peopleItems,
      ignoreFilter: true,
    } as any)
  }

  groups.push({
    id: 'actions',
    label: 'Actions',
    items: [
      {
        label: 'Settings',
        icon: 'i-lucide-settings',
        kbds: ['meta', ','],
        onSelect() {
          router.push('/settings')
          commandPaletteOpen.value = false
        },
      },
    ],
  })

  return groups
})

const messageThreadRef = ref<{ scrollToBottom: () => void }>()


// Start presence polling for 1:1 chat members
function startPresenceForChats() {
  const userIds = new Set<string>()
  for (const chat of chats.value) {
    if (chat.chatType === 'oneOnOne' && chat.members) {
      for (const member of chat.members) {
        if (member.userId !== currentUserId.value) {
          userIds.add(member.userId)
        }
      }
    }
  }
  if (userIds.size > 0) {
    startPresencePolling([...userIds])
  }
}

// Update tray + dock badge when unread count changes
watch(totalUnread, async (count) => {
  setTrayUnreadCount(count)
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().setBadgeCount(count || null)
  }
  catch {
    // Not running in Tauri — ignore
  }
})

// React to chat list refreshes
watch(chats, c => updateFromChats(c))

let refreshTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await Promise.allSettled([
    fetchChats(),
    fetchTeams(),
    loadSections(),
  ])

  // Discover teams the user can access via shared channels
  await fetchAssociatedTeams()

  // Fetch channels for all teams in parallel
  if (teams.value.length > 0) {
    await Promise.allSettled(
      teams.value.map(team => fetchChannels(team.id)),
    )
  }

  updateFromChats(chats.value)
  startPresenceForChats()

  // Periodic refresh for unread detection
  refreshTimer = setInterval(() => refreshChats(), 30_000)
})

onUnmounted(() => {
  stopPresencePolling()
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = undefined
  }
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-(--ui-bg)">
    <!-- Sidebar -->
    <div class="w-[260px] flex-shrink-0 bg-slate-900 overflow-hidden">
      <AppSidebar
        :chats="chats"
        :teams="teams"
        :channels="channels"
        :active-chat-id="activeChatId"
        :active-channel-id="activeChannelId"
        :active-team-id="activeTeamId"
        @select-chat="selectChat"
        @select-channel="selectChannel"
      />
    </div>

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Error state -->
      <div v-if="loadError" class="flex-1 flex items-center justify-center">
        <div class="text-center space-y-3">
          <UIcon name="i-lucide-alert-triangle" class="size-12 text-red-400" />
          <p class="text-sm text-red-400">{{ loadError }}</p>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="currentView === 'empty'" class="flex-1 flex items-center justify-center">
        <div class="text-center space-y-3">
          <UIcon name="i-lucide-message-circle" class="size-12 text-(--ui-text-muted)" />
          <p class="text-sm text-(--ui-text-muted)">Select a chat or channel to start messaging</p>
          <div class="flex items-center justify-center gap-1 text-xs text-(--ui-text-dimmed)">
            <UKbd value="meta" />
            <UKbd value="K" />
            <span>to quick switch</span>
          </div>
        </div>
      </div>

      <!-- Chat / channel view -->
      <template v-else>
        <div class="flex items-center justify-between px-5 py-2.5 border-b border-(--ui-border) min-h-[49px]">
          <div class="flex items-center gap-1.5">
            <UIcon
              v-if="isChannel"
              name="i-lucide-hash"
              class="size-4.5 text-(--ui-text-muted)"
            />
            <span class="text-[16px] font-bold text-(--ui-text-highlighted) leading-tight">{{ currentTitle }}</span>
            <div v-if="currentMemberCount" class="flex items-center gap-1 ml-2 pl-2 border-l border-(--ui-border)">
              <UIcon name="i-lucide-users" class="size-3.5 text-(--ui-text-dimmed)" />
              <span class="text-xs text-(--ui-text-dimmed)">{{ currentMemberCount }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <UTooltip text="Search (Cmd+K)">
              <UButton icon="i-lucide-search" variant="ghost" color="neutral" size="xs" square @click="commandPaletteOpen = true" />
            </UTooltip>
            <UTooltip text="Toggle Claude (Cmd+J)">
              <UButton icon="i-lucide-sparkles" variant="ghost" color="neutral" size="xs" square @click="claudePanelOpen = !claudePanelOpen" />
            </UTooltip>
          </div>
        </div>

        <div class="flex-1 flex min-h-0">
          <div class="flex-1 flex flex-col min-w-0">
            <MessageThread
              ref="messageThreadRef"
              :messages="displayMessages"
              :loading="displayLoading"
              :is-channel="isChannel"
              @reply="handleReply"
              @react="handleReact"
            />

            <ComposeBar @send="handleSend" />
          </div>

          <!-- Thread panel -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="w-0 opacity-0"
            enter-to-class="w-[380px] opacity-100"
            leave-from-class="w-[380px] opacity-100"
            leave-to-class="w-0 opacity-0"
          >
            <div v-if="threadMessage && activeTeamId && activeChannelId" class="w-[380px] flex-shrink-0 border-l border-(--ui-border) overflow-hidden">
              <ThreadPanel
                :message="threadMessage"
                :team-id="activeTeamId"
                :channel-id="activeChannelId"
                @close="threadMessage = null"
                @react="handleReact"
              />
            </div>
          </Transition>
        </div>
      </template>
    </div>

    <!-- Claude panel -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="w-0 opacity-0"
      enter-to-class="w-[360px] opacity-100"
      leave-from-class="w-[360px] opacity-100"
      leave-to-class="w-0 opacity-0"
    >
      <div v-if="claudePanelOpen" class="w-[360px] flex-shrink-0 border-l border-(--ui-border) overflow-hidden">
        <ClaudePanel />
      </div>
    </Transition>

    <!-- Command palette overlay -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        leave-active-class="transition duration-100 ease-in"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="commandPaletteOpen" class="fixed inset-0 z-50">
          <div class="fixed inset-0 bg-black/50" @click="closeCommandPalette" />
          <div class="fixed inset-0 flex items-start justify-center pt-[20vh] px-4">
            <UCommandPalette
              v-model:search-term="searchQuery"
              :groups="commandPaletteGroups"
              placeholder="Search chats, channels, people..."
              class="h-80 w-full max-w-lg rounded-lg shadow-2xl border border-(--ui-border) bg-(--ui-bg)"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
