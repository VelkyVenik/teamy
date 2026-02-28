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

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

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

// --- Handler Registries ---

const commandHandlers = new Map<string, { pluginId: string; description: string; handler: (...args: string[]) => string | void | Promise<string | void> }>()
const messageActionHandlers = new Map<string, { pluginId: string; label: string; handler: (msg: PluginMessage) => void }>()
const sidebarPanels = new Map<string, { pluginId: string; component: Component }>()

// Reactive trigger — increment whenever handler registries change so Vue computed properties re-evaluate
const registryVersion = ref(0)

export async function executeCommand(name: string, ...args: string[]): Promise<{ executed: boolean; result?: string }> {
  const entry = commandHandlers.get(name)
  if (!entry) return { executed: false }
  try {
    const result = await entry.handler(...args)
    return { executed: true, result: typeof result === 'string' ? result : undefined }
  }
  catch (err) {
    console.error(`[plugins] Command /${name} failed:`, err)
    const message = err instanceof Error ? err.message : String(err)
    return { executed: true, result: `Command /${name} failed: ${message}` }
  }
}

export function getRegisteredCommands(): Array<{ name: string; description: string; pluginId: string }> {
  // Read reactive trigger so Vue tracks this dependency
  // eslint-disable-next-line no-unused-expressions
  registryVersion.value
  return Array.from(commandHandlers.entries()).map(([name, entry]) => ({
    name,
    description: entry.description,
    pluginId: entry.pluginId,
  }))
}

export function getMessageActions(): Array<{ label: string; pluginId: string; handler: (msg: PluginMessage) => void }> {
  // Read reactive trigger so Vue tracks this dependency
  // eslint-disable-next-line no-unused-expressions
  registryVersion.value
  return Array.from(messageActionHandlers.values())
}

export function getSidebarPanels(): Array<{ pluginId: string; component: Component }> {
  // eslint-disable-next-line no-unused-expressions
  registryVersion.value
  return Array.from(sidebarPanels.values())
}

function cleanupPluginHandlers(pluginId: string) {
  // Clean up commands
  for (const [name, entry] of commandHandlers) {
    if (entry.pluginId === pluginId) commandHandlers.delete(name)
  }
  // Clean up message actions
  for (const [key, entry] of messageActionHandlers) {
    if (entry.pluginId === pluginId) messageActionHandlers.delete(key)
  }
  // Clean up sidebar panels
  for (const [key, entry] of sidebarPanels) {
    if (entry.pluginId === pluginId) sidebarPanels.delete(key)
  }
  // Clean up event handlers
  eventHandlers.delete(pluginId)
  // Bump reactive trigger so computed properties re-evaluate
  registryVersion.value++
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
    registerSidebarPanel(component: Component) {
      sidebarPanels.set(`${pluginId}:panel`, { pluginId, component })
      registryVersion.value++
      pluginStore.setHasSidebarPanel(pluginId, true)
      pluginStore.addLog(pluginId, {
        timestamp: Date.now(),
        level: 'info',
        message: 'Registered sidebar panel',
      })
    },

    registerMessageAction(label: string, handler: (msg: PluginMessage) => void) {
      messageActionHandlers.set(`${pluginId}:${label}`, { pluginId, label, handler })
      registryVersion.value++
      pluginStore.addRegisteredMessageAction(pluginId, label)
      pluginStore.addLog(pluginId, {
        timestamp: Date.now(),
        level: 'info',
        message: `Registered message action: ${label}`,
      })
    },

    registerCommand(name: string, description: string, handler: (...args: string[]) => string | void | Promise<string | void>) {
      commandHandlers.set(name, { pluginId, description, handler })
      registryVersion.value++
      pluginStore.addRegisteredCommand(pluginId, name, description)
      pluginStore.addLog(pluginId, {
        timestamp: Date.now(),
        level: 'info',
        message: `Registered command: /${name}`,
      })
    },

    async sendNotification(title: string, body: string) {
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
      return graphApiFetch<T>(path, {
        method: options?.method,
      })
    },

    async claudeChat(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
      if (!isTauri) {
        throw new Error('Claude AI requires the desktop app')
      }
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<string>('claude_chat_sync', {
        request: { messages },
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

// --- Plugin Code Evaluation ---

/**
 * Evaluate plugin code (JavaScript IIFE) and return a TeamyPlugin object.
 * The code must return an object with: id, name, version, description, activate(ctx), deactivate()
 *
 * NOTE: Dynamic code evaluation is an intentional feature of the plugin system.
 * Only code explicitly requested by the user via the Claude panel is evaluated.
 */
export function evaluatePluginCode(code: string): TeamyPlugin {
  try {
    // Dynamic evaluation of plugin IIFE — intentional for plugin system.
    // Strip trailing semicolons/whitespace — Claude often generates `(function(){...})();`
    // and wrapping as `return (code;)` would be a syntax error inside the parens.
    const trimmed = code.replace(/;\s*$/, '').trim()
    const evaluate = new Function('return (' + trimmed + ')') // eslint-disable-line no-new-func -- intentional plugin eval
    const plugin = evaluate()

    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Plugin code must return an object')
    }
    if (!plugin.id || typeof plugin.id !== 'string') {
      throw new Error('Plugin must have a string "id"')
    }
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a string "name"')
    }
    if (typeof plugin.activate !== 'function') {
      throw new Error('Plugin must have an "activate" function')
    }
    if (typeof plugin.deactivate !== 'function') {
      throw new Error('Plugin must have a "deactivate" function')
    }

    return plugin as TeamyPlugin
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Plugin evaluation failed: ${message}`)
  }
}

// --- Plugin Persistence ---

const GENERATED_PLUGINS_STORAGE_KEY = 'teamy-generated-plugins'

interface GeneratedPluginRecord {
  id: string
  code: string
  manifest: {
    id: string
    name: string
    version: string
    description: string
  }
  installedAt: number
}

async function getPluginStore(): Promise<{
  get: () => Promise<GeneratedPluginRecord[]>
  set: (records: GeneratedPluginRecord[]) => Promise<void>
}> {
  if (isTauri) {
    const { LazyStore } = await import('@tauri-apps/plugin-store')
    const store = new LazyStore('generated-plugins.json')
    return {
      async get() {
        return (await store.get<GeneratedPluginRecord[]>('plugins')) ?? []
      },
      async set(records: GeneratedPluginRecord[]) {
        await store.set('plugins', records)
        await store.save()
      },
    }
  }
  return {
    async get() {
      try {
        const raw = localStorage.getItem(GENERATED_PLUGINS_STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
      }
      catch {
        return []
      }
    },
    async set(records: GeneratedPluginRecord[]) {
      localStorage.setItem(GENERATED_PLUGINS_STORAGE_KEY, JSON.stringify(records))
    },
  }
}

async function persistPluginCode(id: string, code: string, manifest: { id: string; name: string; version: string; description: string }) {
  const store = await getPluginStore()
  const records = await store.get()
  const existing = records.findIndex(r => r.id === id)
  const record: GeneratedPluginRecord = { id, code, manifest, installedAt: Date.now() }
  if (existing >= 0) {
    records[existing] = record
  }
  else {
    records.push(record)
  }
  await store.set(records)
}

async function removePersistedPlugin(id: string) {
  const store = await getPluginStore()
  const records = await store.get()
  await store.set(records.filter(r => r.id !== id))
  // Also clean up plugin-specific storage
  if (import.meta.client) {
    localStorage.removeItem(`teamy-plugin-${id}`)
    localStorage.removeItem(`teamy-plugin-settings-${id}`)
  }
}

// --- Plugin Loader ---

let pluginsLoaded = false

export function usePlugins() {
  const pluginStore = usePluginStore()
  const isLoading = ref(false)

  async function loadBundledPlugins() {
    if (pluginsLoaded) return
    pluginsLoaded = true
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

      // Load generated plugins from persistence
      await loadGeneratedPlugins()

      // Auto-activate all loaded plugins
      for (const plugin of pluginStore.pluginList) {
        if (!plugin.enabled && plugin.instance) {
          await activatePlugin(plugin.manifest.id)
        }
      }
    }
    finally {
      isLoading.value = false
    }
  }

  async function loadGeneratedPlugins() {
    try {
      const store = await getPluginStore()
      const records = await store.get()

      for (const record of records) {
        try {
          const plugin = evaluatePluginCode(record.code)
          pluginStore.registerPlugin(record.manifest, `generated:${record.id}`)
          pluginStore.setPluginInstance(record.id, plugin)

          pluginStore.addLog(record.id, {
            timestamp: Date.now(),
            level: 'info',
            message: `Loaded generated plugin: ${record.manifest.name}`,
          })
        }
        catch (err) {
          console.error(`[plugins] Failed to load generated plugin ${record.id}:`, err)
          pluginStore.registerPlugin(record.manifest, `generated:${record.id}`)
          pluginStore.addLog(record.id, {
            timestamp: Date.now(),
            level: 'error',
            message: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }
    }
    catch (err) {
      console.error('[plugins] Failed to load generated plugins:', err)
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

      // Clean up all handler registries
      cleanupPluginHandlers(id)

      // Clear store-level registered items
      pluginStore.clearRegistrations(id)

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

  /**
   * Install a plugin from generated code (IIFE format).
   * Evaluates the code, registers, persists, and auto-activates.
   */
  async function installPluginFromCode(
    code: string,
    manifest: { id: string; name: string; version: string; description: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const plugin = evaluatePluginCode(code)

      const finalManifest = {
        id: plugin.id || manifest.id,
        name: plugin.name || manifest.name,
        version: plugin.version || manifest.version,
        description: plugin.description || manifest.description,
      }

      pluginStore.registerPlugin(finalManifest, `generated:${finalManifest.id}`)
      pluginStore.setPluginInstance(finalManifest.id, plugin)

      // Persist for reload
      await persistPluginCode(finalManifest.id, code, finalManifest)

      // Auto-activate
      await activatePlugin(finalManifest.id)

      pluginStore.addLog(finalManifest.id, {
        timestamp: Date.now(),
        level: 'info',
        message: `Plugin installed: ${finalManifest.name}`,
      })

      return { success: true }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  /**
   * Update an existing generated plugin's code. Deactivates, updates, re-evaluates, re-activates.
   */
  async function updatePluginCode(
    id: string,
    code: string,
  ): Promise<{ success: boolean; error?: string }> {
    const existing = pluginStore.getPlugin(id)
    if (!existing) {
      return { success: false, error: `Plugin "${id}" not found` }
    }

    try {
      if (existing.enabled) {
        await deactivatePlugin(id)
      }

      const plugin = evaluatePluginCode(code)

      const manifest = {
        id: plugin.id || id,
        name: plugin.name || existing.manifest.name,
        version: plugin.version || existing.manifest.version,
        description: plugin.description || existing.manifest.description,
      }

      pluginStore.setPluginInstance(id, plugin)
      await persistPluginCode(id, code, manifest)
      await activatePlugin(id)

      pluginStore.addLog(id, {
        timestamp: Date.now(),
        level: 'info',
        message: `Plugin updated and re-activated`,
      })

      return { success: true }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      pluginStore.addLog(id, {
        timestamp: Date.now(),
        level: 'error',
        message: `Update failed: ${message}`,
      })
      return { success: false, error: message }
    }
  }

  /**
   * Delete a generated plugin completely (deactivate, remove from store, remove persisted code).
   */
  async function deletePlugin(id: string): Promise<{ success: boolean; error?: string }> {
    const existing = pluginStore.getPlugin(id)
    if (!existing) {
      return { success: false, error: `Plugin "${id}" not found` }
    }

    try {
      if (existing.enabled) {
        await deactivatePlugin(id)
      }

      cleanupPluginHandlers(id)
      pluginStore.removePlugin(id)
      await removePersistedPlugin(id)

      return { success: true }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  return {
    isLoading: readonly(isLoading),
    loadBundledPlugins,
    activatePlugin,
    deactivatePlugin,
    togglePlugin,
    installPluginFromCode,
    updatePluginCode,
    deletePlugin,
    emitPluginEvent,
  }
}
