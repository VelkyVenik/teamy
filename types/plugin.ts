import type { Component } from 'vue'

// --- Plugin Settings ---

export interface PluginSettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'select'
  label: string
  description?: string
  default: unknown
  options?: Array<{ label: string; value: string | number }>
}

export interface PluginSettings {
  get<T = unknown>(key: string): T
  set(key: string, value: unknown): void
  getAll(): Record<string, unknown>
  definitions: Record<string, PluginSettingDefinition>
}

// --- Plugin Storage ---

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

// --- Plugin Events ---

export type PluginEvent =
  | 'message:received'
  | 'message:sent'
  | 'chat:switched'
  | 'presence:changed'
  | 'plugin:activated'
  | 'plugin:deactivated'

export type PluginEventHandler = (...args: any[]) => void | Promise<void>

// --- Plugin Context ---

export interface PluginContext {
  /** Register a Vue component as a sidebar panel */
  registerSidebarPanel(component: Component): void

  /** Register a context menu action on messages */
  registerMessageAction(label: string, handler: (msg: PluginMessage) => void): void

  /** Register a slash command */
  registerCommand(name: string, description: string, handler: (...args: string[]) => void): void

  /** Send a native macOS notification */
  sendNotification(title: string, body: string): Promise<void>

  /** Make an authenticated Graph API request */
  graphFetch<T = unknown>(path: string, options?: RequestInit): Promise<T>

  /** Per-plugin key-value storage */
  storage: PluginStorage

  /** Per-plugin settings with UI generation */
  settings: PluginSettings

  /** Subscribe to app events */
  on(event: PluginEvent, handler: PluginEventHandler): void

  /** Unsubscribe from app events */
  off(event: PluginEvent, handler: PluginEventHandler): void

  /** Log a message to the plugin's log (visible in Plugin Manager) */
  log(level: 'info' | 'warn' | 'error', message: string): void
}

// --- Plugin Message (simplified for plugin consumers) ---

export interface PluginMessage {
  id: string
  chatId: string
  chatType: 'oneOnOne' | 'group' | 'meeting' | 'channel'
  sender: {
    id: string
    name: string
    email?: string
  }
  content: string
  preview: string
  createdAt: string
}

// --- Plugin Manifest ---

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author?: string
  settingsSchema?: Record<string, PluginSettingDefinition>
}

// --- TeamyPlugin Interface ---

export interface TeamyPlugin extends PluginManifest {
  /** Called when the plugin is activated. Use ctx to register handlers. */
  activate(ctx: PluginContext): void | Promise<void>

  /** Called when the plugin is deactivated. Clean up any resources. */
  deactivate(): void | Promise<void>
}

// --- Plugin Runtime State ---

export interface PluginLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface InstalledPlugin {
  manifest: PluginManifest
  enabled: boolean
  path: string
  logs: PluginLogEntry[]
  instance?: TeamyPlugin
  registeredCommands: Array<{ name: string; description: string }>
  registeredMessageActions: string[]
  hasSidebarPanel: boolean
}
