<script setup lang="ts">
import type { Channel, Team } from '~~/types/graph'

defineProps<{
  teams: Team[]
  channels: Map<string, Channel[]>
  activeChannelId?: string | null
  activeTeamId?: string | null
}>()

const emit = defineEmits<{
  select: [teamId: string, channelId: string]
}>()

const expandedTeams = ref<Set<string>>(new Set())

function toggleTeam(teamId: string) {
  if (expandedTeams.value.has(teamId)) {
    expandedTeams.value.delete(teamId)
  }
  else {
    expandedTeams.value.add(teamId)
  }
  expandedTeams.value = new Set(expandedTeams.value)
}

onMounted(() => {
  // Expand all teams by default
})
</script>

<template>
  <div class="flex flex-col">
    <div v-for="team in teams" :key="team.id">
      <!-- Team header toggle -->
      <button
        class="flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors rounded-md hover:bg-white/10 group"
        style="min-height: 28px;"
        @click="toggleTeam(team.id)"
      >
        <UIcon
          :name="expandedTeams.has(team.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-3 text-slate-500 flex-shrink-0"
        />
        <span class="text-sm font-medium truncate text-slate-300 group-hover:text-slate-100">
          {{ team.displayName }}
        </span>
      </button>

      <!-- Channel items -->
      <div v-if="expandedTeams.has(team.id)">
        <button
          v-for="channel in (channels.get(team.id) ?? [])"
          :key="channel.id"
          class="flex items-center gap-1.5 w-full pl-6 pr-2 py-0.5 text-left transition-colors rounded-md"
          :class="activeTeamId === team.id && activeChannelId === channel.id
            ? 'bg-white/15 text-white'
            : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'"
          style="min-height: 28px;"
          @click="emit('select', team.id, channel.id)"
        >
          <UIcon name="i-lucide-hash" class="size-3.5 flex-shrink-0 opacity-70" />
          <span class="text-sm truncate">{{ channel.displayName }}</span>
        </button>
      </div>
    </div>

    <div v-if="teams.length === 0" class="px-2 py-3 text-center text-xs text-slate-500">
      No teams found
    </div>
  </div>
</template>
