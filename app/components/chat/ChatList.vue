<script setup lang="ts">
import type { Chat } from '~~/types/graph'

const props = defineProps<{
  chats: Chat[]
  activeChatId?: string | null
}>()

const emit = defineEmits<{
  select: [chat: Chat]
}>()

const { currentUserId, getChatDisplayName, getChatAvatar, getUnreadCount } = useChatHelpers()
const { getPresence } = usePresence()

const filteredChats = computed(() => props.chats)

function getOtherUserId(chat: Chat): string | undefined {
  if (chat.chatType !== 'oneOnOne') return undefined
  const other = chat.members?.find((m: { userId: string }) => m.userId !== currentUserId.value)
  return other?.userId
}

function getPresenceDotColor(chat: Chat): string {
  const userId = getOtherUserId(chat)
  if (!userId) return 'bg-slate-500'
  const presence = getPresence(userId)
  if (!presence) return 'bg-slate-500'
  switch (presence.availability) {
    case 'Available':
    case 'AvailableIdle':
      return 'bg-green-500'
    case 'Busy':
    case 'BusyIdle':
    case 'DoNotDisturb':
      return 'bg-red-500'
    case 'Away':
    case 'BeRightBack':
      return 'bg-yellow-500'
    case 'Offline':
    default:
      return 'bg-slate-500'
  }
}
</script>

<template>
  <div class="flex flex-col">
    <button
      v-for="chat in filteredChats"
      :key="chat.id"
      class="flex items-center gap-2 w-full px-2 py-1 rounded-md text-left transition-colors group"
      :class="activeChatId === chat.id
        ? 'bg-white/15 text-white'
        : 'text-slate-300 hover:bg-white/10'"
      style="min-height: 28px;"
      @click="emit('select', chat)"
    >
      <!-- Presence dot -->
      <span
        v-if="chat.chatType === 'oneOnOne'"
        class="size-2 rounded-full flex-shrink-0"
        :class="getPresenceDotColor(chat)"
      />
      <!-- Group icon for group chats -->
      <UIcon
        v-else
        name="i-lucide-users"
        class="size-3.5 text-slate-400 flex-shrink-0"
      />

      <!-- Name -->
      <span
        class="text-sm truncate flex-1"
        :class="getUnreadCount(chat.id) > 0
          ? 'font-bold text-white'
          : activeChatId === chat.id ? 'text-white' : 'text-slate-300 group-hover:text-slate-100'"
      >
        {{ getChatDisplayName(chat) }}
      </span>

      <!-- Unread badge -->
      <span
        v-if="getUnreadCount(chat.id) > 0"
        class="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold px-1"
      >
        {{ getUnreadCount(chat.id) }}
      </span>
    </button>

    <div v-if="filteredChats.length === 0" class="px-2 py-3 text-center text-xs text-slate-500">
      No chats found
    </div>
  </div>
</template>
