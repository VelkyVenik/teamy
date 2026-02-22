import { defineStore } from 'pinia'
import type { InstalledPlugin, PluginLogEntry, PluginManifest } from '~/types/plugin'

export const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<Map<string, InstalledPlugin>>(new Map())

  const pluginList = computed(() => Array.from(plugins.value.values()))

  const enabledPlugins = computed(() =>
    pluginList.value.filter((p) => p.enabled),
  )

  function registerPlugin(manifest: PluginManifest, path: string) {
    if (plugins.value.has(manifest.id)) return

    plugins.value.set(manifest.id, {
      manifest,
      enabled: false,
      path,
      logs: [],
      registeredCommands: [],
      registeredMessageActions: [],
      hasSidebarPanel: false,
    })
  }

  function setPluginInstance(id: string, instance: any) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.instance = instance
    }
  }

  function enablePlugin(id: string) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.enabled = true
    }
  }

  function disablePlugin(id: string) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.enabled = false
    }
  }

  function togglePlugin(id: string) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.enabled = !plugin.enabled
    }
  }

  function addLog(id: string, entry: PluginLogEntry) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.logs.push(entry)
      // Keep only last 200 log entries
      if (plugin.logs.length > 200) {
        plugin.logs = plugin.logs.slice(-200)
      }
    }
  }

  function clearLogs(id: string) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.logs = []
    }
  }

  function removePlugin(id: string) {
    plugins.value.delete(id)
  }

  function getPlugin(id: string): InstalledPlugin | undefined {
    return plugins.value.get(id)
  }

  function addRegisteredCommand(id: string, name: string, description: string) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.registeredCommands.push({ name, description })
    }
  }

  function addRegisteredMessageAction(id: string, label: string) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.registeredMessageActions.push(label)
    }
  }

  function setHasSidebarPanel(id: string, value: boolean) {
    const plugin = plugins.value.get(id)
    if (plugin) {
      plugin.hasSidebarPanel = value
    }
  }

  return {
    plugins,
    pluginList,
    enabledPlugins,
    registerPlugin,
    setPluginInstance,
    enablePlugin,
    disablePlugin,
    togglePlugin,
    addLog,
    clearLogs,
    removePlugin,
    getPlugin,
    addRegisteredCommand,
    addRegisteredMessageAction,
    setHasSidebarPanel,
  }
})
