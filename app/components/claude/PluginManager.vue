<script setup lang="ts">
import type { InstalledPlugin } from '~/types/plugin'

const pluginStore = usePluginStore()
const { togglePlugin } = usePlugins()

const selectedPlugin = ref<InstalledPlugin | null>(null)
const showLogs = ref(false)

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function logLevelColor(level: string): string {
  switch (level) {
    case 'error': return 'error'
    case 'warn': return 'warning'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Plugin List -->
    <div class="space-y-2">
      <div
        v-for="plugin in pluginStore.pluginList"
        :key="plugin.manifest.id"
        class="flex items-center justify-between p-3 rounded-lg border border-(--ui-border) bg-(--ui-bg)"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium truncate">{{ plugin.manifest.name }}</span>
            <UBadge :label="`v${plugin.manifest.version}`" variant="subtle" color="neutral" size="xs" />
            <UBadge
              v-if="plugin.enabled"
              label="Active"
              variant="soft"
              color="success"
              size="xs"
            />
          </div>
          <p class="text-xs text-(--ui-text-dimmed) mt-0.5 truncate">
            {{ plugin.manifest.description }}
          </p>
          <div v-if="plugin.registeredCommands.length" class="flex gap-1 mt-1">
            <UBadge
              v-for="cmd in plugin.registeredCommands"
              :key="cmd.name"
              :label="`/${cmd.name}`"
              variant="subtle"
              color="primary"
              size="xs"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 ml-3">
          <UButton
            icon="i-lucide-scroll-text"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="selectedPlugin = plugin; showLogs = true"
          />
          <USwitch
            :model-value="plugin.enabled"
            size="sm"
            @update:model-value="togglePlugin(plugin.manifest.id)"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="pluginStore.pluginList.length === 0"
        class="text-center py-8 text-(--ui-text-dimmed)"
      >
        <UIcon name="i-lucide-puzzle" class="size-8 mb-2" />
        <p class="text-sm">No plugins installed</p>
        <p class="text-xs mt-1">Use the /plugin command in the Claude panel to generate one.</p>
      </div>
    </div>

    <!-- Logs Modal -->
    <USlideover v-model:open="showLogs">
      <template #default>
        <div v-if="selectedPlugin" class="p-4 h-full flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-sm">{{ selectedPlugin.manifest.name }} - Logs</h3>
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="neutral"
              size="xs"
              label="Clear"
              @click="pluginStore.clearLogs(selectedPlugin!.manifest.id)"
            />
          </div>

          <div class="flex-1 overflow-y-auto space-y-1">
            <div
              v-for="(log, i) in selectedPlugin.logs"
              :key="i"
              class="flex items-start gap-2 text-xs font-mono"
            >
              <span class="text-(--ui-text-dimmed) shrink-0">
                {{ formatTimestamp(log.timestamp) }}
              </span>
              <UBadge
                :label="log.level"
                :color="logLevelColor(log.level)"
                variant="subtle"
                size="xs"
                class="shrink-0"
              />
              <span class="text-(--ui-text-muted) break-all">{{ log.message }}</span>
            </div>

            <div
              v-if="selectedPlugin.logs.length === 0"
              class="text-center py-8 text-(--ui-text-dimmed) text-xs"
            >
              No logs yet.
            </div>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
