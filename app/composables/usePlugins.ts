import type { Component } from 'vue'
import type {
  InstalledPlugin,
  PluginContext,
  PluginEvent,
  PluginEventHandler,
  PluginMessage,
  PluginSettings,
  PluginSettingDefinition,
  PluginStorage,
  TeamyPlugin,
} from '~/types/plugin'

// --- Event Bus ---

const eventHandlers = new Map<string, Map<PluginEvent, PluginEventHandler[]>>()

function getPluginEventHandlers(pluginId: string): Map<PluginEvent, PluginEventHandler[]> {
  if (!eventHandlers.has(pluginId)) {
    eventHandlers.set(pluginId, new Map())
  }
  return eventHandlers.get(pluginId)!
}

// Global event emitter for plugins to subscribe to
export function emitPluginEvent(event: PluginEvent, ...args: any[]) {
  for (const [, handlers] of eventHandlers) {
    const eventListeners = handlers.get(event)
    if (eventListeners) {
      for (const handler of eventListeners) {
        try {
          handler(...args)
        }
        catch (err) {
          console.error(`Plugin event handler error for "${event}":`, err)
        }
      }
    }
  }
}

// --- Plugin Storage Implementation ---

function createPluginStorage(pluginId: string): PluginStorage {
  const storageKey = `teamy-plugin-${pluginId}`

  function loadData(): Record<string, unknown> {
    if (import.meta.client) {
      try {
        const raw = localStorage.getItem(storageKey)
        return raw ? JSON.parse(raw) : {}
      }
      catch {
        return {}
      }
    }
    return {}
  }

  function saveData(data: Record<string, unknown>) {
    if (import.meta.client) {
      localStorage.setItem(storageKey, JSON.stringify(data))
    }
  }

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const data = loadData()
      return data[key] as T | undefined
    },
    async set(key: string, value: unknown) {
      const data = loadData()
      data[key] = value
      saveData(data)
    },
    async remove(key: string) {
      const data = loadData()
      delete data[key]
      saveData(data)
    },
    async clear() {
      if (import.meta.client) {
        localStorage.removeItem(storageKey)
      }
    },
  }
}

// --- Plugin Settings Implementation ---

function createPluginSettings(
  pluginId: string,
  schema: Record<string, PluginSettingDefinition> = {},
): PluginSettings {
  const storageKey = `teamy-plugin-settings-${pluginId}`

  function loadSettings(): Record<string, unknown> {
    if (import.meta.client) {
      try {
        const raw = localStorage.getItem(storageKey)
        return raw ? JSON.parse(raw) : {}
      }
      catch {
        return {}
      }
    }
    return {}
  }

  function saveSettings(data: Record<string, unknown>) {
    if (import.meta.client) {
      localStorage.setItem(storageKey, JSON.stringify(data))
    }
  }

  return {
    definitions: schema,
    get<T = unknown>(key: string): T {
      const settings = loadSettings()
      if (key in settings) return settings[key] as T
      if (key in schema) return schema[key].default as T
      return undefined as T
    },
    set(key: string, value: unknown) {
      const settings = loadSettings()
      settings[key] = value
      saveSettings(settings)
    },
    getAll(): Record<string, unknown> {
      const defaults: Record<string, unknown> = {}
      for (const [key, def] of Object.entries(schema)) {
        defaults[key] = def.default
      }
      return { ...defaults, ...loadSettings() }
    },
  }
}

// --- Sandboxed Plugin Context ---

function createPluginContext(pluginId: string, schema?: Record<string, PluginSettingDefinition>): PluginContext {
  const pluginStore = usePluginStore()
  const pluginHandlers = getPluginEventHandlers(pluginId)
  const { graphFetch: graphApiFetch } = useGraph()

  return {
    registerSidebarPanel(_component: Component) {
      pluginStore.setHasSidebarPanel(pluginId, true)
      pluginStore.addLog(pluginId, {
        timestamp: Date.now(),
        level: 'info',
        message: 'Registered sidebar panel',
      })
    },

    registerMessageAction(label: string, handler: (msg: PluginMessage) => void) {
      pluginStore.addRegisteredMessageAction(pluginId, label)
      pluginStore.addLog(pluginId, {
        timestamp: Date.now(),
        level: 'info',
        message: `Registered message action: ${label}`,
      })
    },

    registerCommand(name: string, description: string, handler: (...args: string[]) => void) {
      pluginStore.addRegisteredCommand(pluginId, name, description)
      pluginStore.addLog(pluginId, {
        timestamp: Date.now(),
        level: 'info',
        message: `Registered command: /${name}`,
      })
    },

    async sendNotification(title: string, body: string) {
      // Use browser Notification API as fallback (Tauri integration will replace this)
      if (import.meta.client && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(title, { body })
        }
        else if (Notification.permission !== 'denied') {
          const permission = await Notification.requestPermission()
          if (permission === 'granted') {
            new Notification(title, { body })
          }
        }
      }
    },

    async graphFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
      // Use the Graph API composable which handles auth token injection and retries
      return graphApiFetch<T>(path, {
        method: options?.method,
      })
    },

    storage: createPluginStorage(pluginId),

    settings: createPluginSettings(pluginId, schema),

    on(event: PluginEvent, handler: PluginEventHandler) {
      if (!pluginHandlers.has(event)) {
        pluginHandlers.set(event, [])
      }
      pluginHandlers.get(event)!.push(handler)
    },

    off(event: PluginEvent, handler: PluginEventHandler) {
      const handlers = pluginHandlers.get(event)
      if (handlers) {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    },

    log(level: 'info' | 'warn' | 'error', message: string) {
      pluginStore.addLog(pluginId, {
        timestamp: Date.now(),
        level,
        message,
      })
    },
  }
}

// --- Plugin Loader ---

export function usePlugins() {
  const pluginStore = usePluginStore()
  const isLoading = ref(false)

  async function loadBundledPlugins() {
    isLoading.value = true

    try {
      // Load example plugins bundled with the app
      const bundledPlugins = import.meta.glob<{ default: TeamyPlugin }>(
        '../../plugins/*/index.ts',
        { eager: false },
      )

      for (const [path, loader] of Object.entries(bundledPlugins)) {
        try {
          const module = await loader()
          const plugin = module.default
          if (!plugin?.id || !plugin?.name) continue

          // Extract plugin directory name from path
          const dirMatch = path.match(/plugins\/([^/]+)\//)
          const dirName = dirMatch?.[1] || plugin.id

          pluginStore.registerPlugin(
            {
              id: plugin.id,
              name: plugin.name,
              version: plugin.version,
              description: plugin.description,
              author: plugin.author,
              settingsSchema: plugin.settingsSchema,
            },
            `bundled:${dirName}`,
          )
          pluginStore.setPluginInstance(plugin.id, plugin)

          pluginStore.addLog(plugin.id, {
            timestamp: Date.now(),
            level: 'info',
            message: `Loaded plugin: ${plugin.name} v${plugin.version}`,
          })
        }
        catch (err) {
          console.error(`Failed to load plugin from ${path}:`, err)
        }
      }
    }
    finally {
      isLoading.value = false
    }
  }

  async function activatePlugin(id: string) {
    const plugin = pluginStore.getPlugin(id)
    if (!plugin || !plugin.instance) return

    try {
      const ctx = createPluginContext(id, plugin.manifest.settingsSchema)
      await plugin.instance.activate(ctx)
      pluginStore.enablePlugin(id)

      pluginStore.addLog(id, {
        timestamp: Date.now(),
        level: 'info',
        message: 'Plugin activated',
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      pluginStore.addLog(id, {
        timestamp: Date.now(),
        level: 'error',
        message: `Activation failed: ${message}`,
      })
    }
  }

  async function deactivatePlugin(id: string) {
    const plugin = pluginStore.getPlugin(id)
    if (!plugin || !plugin.instance) return

    try {
      await plugin.instance.deactivate()
      pluginStore.disablePlugin(id)

      // Clean up event handlers
      eventHandlers.delete(id)

      pluginStore.addLog(id, {
        timestamp: Date.now(),
        level: 'info',
        message: 'Plugin deactivated',
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      pluginStore.addLog(id, {
        timestamp: Date.now(),
        level: 'error',
        message: `Deactivation failed: ${message}`,
      })
    }
  }

  async function togglePlugin(id: string) {
    const plugin = pluginStore.getPlugin(id)
    if (!plugin) return

    if (plugin.enabled) {
      await deactivatePlugin(id)
    }
    else {
      await activatePlugin(id)
    }
  }

  async function installPluginFromCode(code: string, manifest: { id: string; name: string; version: string; description: string }) {
    // For now, we store plugin code in localStorage and evaluate it
    // In production, this would write to ~/.teamy/plugins/ via Tauri fs
    const storageKey = `teamy-plugin-code-${manifest.id}`
    if (import.meta.client) {
      localStorage.setItem(storageKey, code)
    }

    pluginStore.registerPlugin(manifest, `generated:${manifest.id}`)

    pluginStore.addLog(manifest.id, {
      timestamp: Date.now(),
      level: 'info',
      message: `Plugin installed: ${manifest.name}`,
    })
  }

  return {
    isLoading: readonly(isLoading),
    loadBundledPlugins,
    activatePlugin,
    deactivatePlugin,
    togglePlugin,
    installPluginFromCode,
    emitPluginEvent,
  }
}
