<script setup lang="ts">
import type { Chat, Channel, Team } from '~~/types/graph'
import type { Section, SectionItem } from '~~/types/sections'

const props = defineProps<{
  section: Section
  chats: Chat[]
  teams: Team[]
  channels: Map<string, Channel[]>
  activeChatId?: string | null
  activeChannelId?: string | null
  activeTeamId?: string | null
  allSections: Section[]
}>()

const emit = defineEmits<{
  selectChat: [chat: Chat]
  selectChannel: [teamId: string, channelId: string]
  moveItem: [item: SectionItem, targetSectionId: string]
  hideItem: [item: SectionItem]
  renameSection: [id: string]
  deleteSection: [id: string]
}>()

const { currentUserId, getChatDisplayName, getUnreadCount } = useChatHelpers()
const { getPresence } = usePresence()
const { isUnread: storeIsUnread, getSectionUnreadItemCount } = useUnreadStore()

const isOpen = ref(props.section.id !== 'other')

// Resolve section items against live Graph data
const resolvedItems = computed(() => {
  return props.section.items.map((item) => {
    if (item.type === 'chat') {
      const chat = props.chats.find(c => c.id === item.id)
      return chat ? { sectionItem: item, chat, channel: undefined, team: undefined } : null
    }
    else {
      const teamChannels = item.teamId ? props.channels.get(item.teamId) : undefined
      const channel = teamChannels?.find(c => c.id === item.id)
      const team = item.teamId ? props.teams.find(t => t.id === item.teamId) : undefined
      return channel ? { sectionItem: item, chat: undefined, channel, team } : null
    }
  }).filter(Boolean) as Array<{
    sectionItem: SectionItem
    chat?: Chat
    channel?: Channel
    team?: Team
  }>
})

const itemCount = computed(() => resolvedItems.value.length)

const moveTargets = computed(() =>
  props.allSections.filter(s => s.id !== props.section.id),
)

function getOtherUserId(chat: Chat): string | undefined {
  if (chat.chatType !== 'oneOnOne') return undefined
  return chat.members?.find(m => m.userId !== currentUserId.value)?.userId
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
    default:
      return 'bg-slate-500'
  }
}

const sectionHeaderItems = computed(() => {
  if (props.section.isDefault) return []
  return [
    [
      { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => emit('renameSection', props.section.id) },
      { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => emit('deleteSection', props.section.id) },
    ],
  ]
})

function channelIsUnread(item: SectionItem): boolean {
  return item.type === 'channel' && !!item.teamId && storeIsUnread('channel', item.id, item.teamId)
}

const sectionUnreadCount = computed(() => getSectionUnreadItemCount(props.section.items))
</script>

<template>
  <div class="mb-1">
    <!-- Section header -->
    <UContextMenu v-if="!section.isDefault" :items="sectionHeaderItems">
      <button
        class="flex items-center gap-1 w-full px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
        @click="isOpen = !isOpen"
      >
        <UIcon
          :name="isOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-3 flex-shrink-0"
        />
        {{ section.label }}
        <span v-if="sectionUnreadCount > 0" class="text-slate-200 font-normal normal-case ml-1">&middot;{{ sectionUnreadCount }}</span>
        <span v-else class="text-slate-500 font-normal normal-case ml-1">{{ itemCount }}</span>
      </button>
    </UContextMenu>
    <button
      v-else
      class="flex items-center gap-1 w-full px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
      @click="isOpen = !isOpen"
    >
      <UIcon
        :name="isOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-3 flex-shrink-0"
      />
      {{ section.label }}
      <span v-if="sectionUnreadCount > 0" class="text-slate-200 font-normal normal-case ml-1">&middot;{{ sectionUnreadCount }}</span>
      <span v-else class="text-slate-500 font-normal normal-case ml-1">{{ itemCount }}</span>
    </button>

    <!-- Items -->
    <div v-if="isOpen">
      <template v-for="resolved in resolvedItems" :key="resolved.sectionItem.id">
        <!-- Chat item -->
        <UContextMenu
          v-if="resolved.chat"
          :items="[
            moveTargets.map(s => ({
              label: `Move to ${s.label}`,
              icon: 'i-lucide-arrow-right',
              onSelect: () => emit('moveItem', resolved.sectionItem, s.id),
            })),
            [{ label: 'Hide', icon: 'i-lucide-eye-off', onSelect: () => emit('hideItem', resolved.sectionItem) }],
          ]"
        >
          <button
            class="flex items-center gap-2 w-full px-2 py-1 rounded-md text-left transition-colors group"
            :class="activeChatId === resolved.chat.id
              ? 'bg-white/15 text-white'
              : 'text-slate-300 hover:bg-white/10'"
            style="min-height: 28px;"
            @click="emit('selectChat', resolved.chat!)"
          >
            <span
              v-if="resolved.chat.chatType === 'oneOnOne'"
              class="size-2 rounded-full flex-shrink-0"
              :class="getPresenceDotColor(resolved.chat)"
            />
            <UIcon
              v-else
              name="i-lucide-users"
              class="size-3.5 text-slate-400 flex-shrink-0"
            />
            <span
              class="text-sm truncate flex-1"
              :class="getUnreadCount(resolved.chat.id) > 0
                ? 'font-bold text-white'
                : activeChatId === resolved.chat.id ? 'text-white' : 'text-slate-300 group-hover:text-slate-100'"
            >
              {{ getChatDisplayName(resolved.chat) }}
            </span>
            <span
              v-if="getUnreadCount(resolved.chat.id) > 0"
              class="flex-shrink-0 size-2 rounded-full bg-indigo-500"
            />
          </button>
        </UContextMenu>

        <!-- Channel item -->
        <UContextMenu
          v-else-if="resolved.channel"
          :items="[
            moveTargets.map(s => ({
              label: `Move to ${s.label}`,
              icon: 'i-lucide-arrow-right',
              onSelect: () => emit('moveItem', resolved.sectionItem, s.id),
            })),
            [{ label: 'Hide', icon: 'i-lucide-eye-off', onSelect: () => emit('hideItem', resolved.sectionItem) }],
          ]"
        >
          <button
            class="flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-left transition-colors group"
            :class="activeTeamId === resolved.sectionItem.teamId && activeChannelId === resolved.channel.id
              ? 'bg-white/15 text-white'
              : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'"
            style="min-height: 28px;"
            :title="`${resolved.channel.displayName} — ${resolved.team?.displayName ?? ''}`"
            @click="emit('selectChannel', resolved.sectionItem.teamId!, resolved.channel!.id)"
          >
            <UIcon name="i-lucide-hash" class="size-3.5 flex-shrink-0 opacity-70" />
            <span
              class="text-sm truncate flex-1 min-w-0"
              :class="channelIsUnread(resolved.sectionItem)
                ? 'font-bold text-white'
                : activeTeamId === resolved.sectionItem.teamId && activeChannelId === resolved.channel.id
                  ? 'text-white'
                  : 'text-slate-400 group-hover:text-slate-200'"
            >
              {{ resolved.channel.displayName }}
            </span>
            <span class="text-xs text-slate-500 truncate max-w-[40%] flex-shrink-0 ml-1">
              {{ resolved.team?.displayName }}
            </span>
            <span
              v-if="channelIsUnread(resolved.sectionItem)"
              class="flex-shrink-0 size-2 rounded-full bg-indigo-500"
            />
          </button>
        </UContextMenu>
      </template>

      <div v-if="resolvedItems.length === 0" class="px-2 py-1.5 text-xs text-slate-500">
        No items
      </div>
    </div>
  </div>
</template>
