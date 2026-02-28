<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

const pluginStore = usePluginStore()
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-lg font-semibold">Plugins</h1>
        <p class="text-sm text-(--ui-text-dimmed)">
          Manage installed plugins. Use /plugin in the Claude panel to generate new ones.
        </p>
      </div>
      <UBadge
        :label="`${pluginStore.enabledPlugins.length} active`"
        variant="soft"
        color="primary"
      />
    </div>

    <PluginManager />

    <!-- Plugin Info -->
    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="size-4" />
          <span class="text-sm font-medium">About Plugins</span>
        </div>
      </template>

      <div class="text-sm text-(--ui-text-muted) space-y-2">
        <p>
          Plugins extend Teamy with custom functionality. They can register new commands,
          add message actions, and listen to app events.
        </p>
        <p>
          To create a new plugin, open the Claude AI panel (Cmd+J) and type:
        </p>
        <code class="block bg-(--ui-bg-elevated) px-3 py-2 rounded text-xs">
          /plugin Add notifications only for DMs from my team
        </code>
        <p>
          Claude will generate the plugin code and install it automatically.
        </p>
      </div>
    </UCard>
  </div>
</template>
