<script setup lang="ts">
import type { Chat, Channel, Team } from '~~/types/graph'
import type { SectionItem, Section } from '~~/types/sections'

const props = defineProps<{
  chats: Chat[]
  teams: Team[]
  channels: Map<string, Channel[]>
  activeChatId?: string | null
  activeChannelId?: string | null
  activeTeamId?: string | null
}>()

const emit = defineEmits<{
  selectChat: [chat: Chat]
  selectChannel: [teamId: string, channelId: string]
}>()

const { sortedSections, createSection, renameSection, deleteSection, moveItem, hideItem, isHidden, getAssignedItemIds } = useSections()

// Build the "Other" section dynamically with unassigned chats + channels
const sectionsForDisplay = computed(() => {
  const assignedIds = getAssignedItemIds()

  return sortedSections.value.map((section) => {
    if (section.id !== 'other') return section

    // Collect unassigned + non-hidden chats and channels
    const unassignedItems: SectionItem[] = []
    for (const chat of props.chats) {
      if (!assignedIds.has(chat.id)) {
        const item: SectionItem = { type: 'chat', id: chat.id }
        if (!isHidden(item)) unassignedItems.push(item)
      }
    }
    for (const team of props.teams) {
      const teamChannels = props.channels.get(team.id) ?? []
      for (const channel of teamChannels) {
        if (!assignedIds.has(`${team.id}:${channel.id}`)) {
          const item: SectionItem = { type: 'channel', id: channel.id, teamId: team.id }
          if (!isHidden(item)) unassignedItems.push(item)
        }
      }
    }

    return { ...section, items: [...section.items, ...unassignedItems] } satisfies Section
  })
})

// New section creation
const newSectionModalOpen = ref(false)
const newSectionName = ref('')

// Rename section
const renameSectionModalOpen = ref(false)
const renameSectionId = ref('')
const renameSectionLabel = ref('')

function handleCreateSection() {
  const name = newSectionName.value.trim()
  if (!name) return
  createSection(name)
  newSectionName.value = ''
  newSectionModalOpen.value = false
}

function handleRenameSection(id: string) {
  const section = sortedSections.value.find(s => s.id === id)
  if (!section) return
  renameSectionId.value = id
  renameSectionLabel.value = section.label
  renameSectionModalOpen.value = true
}

function submitRenameSection() {
  const label = renameSectionLabel.value.trim()
  if (!label) return
  renameSection(renameSectionId.value, label)
  renameSectionModalOpen.value = false
}

function handleDeleteSection(id: string) {
  deleteSection(id)
}

function handleMoveItem(item: SectionItem, targetSectionId: string) {
  moveItem(item, targetSectionId)
}
</script>

<template>
  <div class="flex flex-col h-full text-slate-300" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <!-- Scrollable nav area -->
    <div class="flex-1 overflow-y-auto px-1.5 pt-3">
      <ClientOnly>
        <SectionGroup
          v-for="section in sectionsForDisplay"
          :key="section.id"
          :section="section"
          :chats="chats"
          :teams="teams"
          :channels="channels"
          :active-chat-id="activeChatId"
          :active-channel-id="activeChannelId"
          :active-team-id="activeTeamId"
          :all-sections="sortedSections"
          @select-chat="emit('selectChat', $event)"
          @select-channel="(teamId: string, channelId: string) => emit('selectChannel', teamId, channelId)"
          @move-item="handleMoveItem"
          @hide-item="hideItem"
          @rename-section="handleRenameSection"
          @delete-section="handleDeleteSection"
        />

        <!-- New section button -->
        <button
          class="flex items-center gap-1.5 w-full px-2 py-1.5 mt-1 text-xs text-slate-500 hover:text-slate-300 transition-colors rounded-md hover:bg-white/5"
          @click="newSectionModalOpen = true"
        >
          <UIcon name="i-lucide-plus" class="size-3.5" />
          New section
        </button>
      </ClientOnly>
    </div>

    <!-- New section modal -->
    <ClientOnly>
      <UModal v-model:open="newSectionModalOpen">
        <template #content>
          <div class="p-4 space-y-4">
            <h3 class="text-sm font-semibold">Create new section</h3>
            <UInput
              v-model="newSectionName"
              placeholder="Section name"
              autofocus
              @keydown.enter="handleCreateSection"
            />
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" size="sm" @click="newSectionModalOpen = false">
                Cancel
              </UButton>
              <UButton size="sm" :disabled="!newSectionName.trim()" @click="handleCreateSection">
                Create
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </ClientOnly>

    <!-- Rename section modal -->
    <ClientOnly>
      <UModal v-model:open="renameSectionModalOpen">
        <template #content>
          <div class="p-4 space-y-4">
            <h3 class="text-sm font-semibold">Rename section</h3>
            <UInput
              v-model="renameSectionLabel"
              placeholder="Section name"
              autofocus
              @keydown.enter="submitRenameSection"
            />
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" size="sm" @click="renameSectionModalOpen = false">
                Cancel
              </UButton>
              <UButton size="sm" :disabled="!renameSectionLabel.trim()" @click="submitRenameSection">
                Rename
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </ClientOnly>
  </div>
</template>
