import type { ClaudeToolDefinition } from '~/types/claude'
import type { PluginLogEntry } from '~/types/plugin'

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

let cachedProjectRoot: string | null = null

async function getProjectRoot(): Promise<string> {
  if (cachedProjectRoot) return cachedProjectRoot
  const { invoke } = await import('@tauri-apps/api/core')
  cachedProjectRoot = await invoke<string>('fs_get_project_root')
  return cachedProjectRoot
}

const PLUGIN_TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'create_plugin',
    description: 'Create and install a new Teamy plugin. The code must be a JavaScript IIFE that returns a plugin object with id, name, version, description, activate(ctx), deactivate(). The activate function receives a PluginContext with: registerCommand(name, desc, handler), registerMessageAction(label, handler), on(event, handler), off(event, handler), sendNotification(title, body), graphFetch(path, options), claudeChat(messages), storage (get/set/remove/clear), settings (get/set/getAll), log(level, msg). Available events: message:received, message:sent, chat:switched, presence:changed, plugin:activated, plugin:deactivated.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique plugin identifier (kebab-case, e.g. "my-plugin")' },
        name: { type: 'string', description: 'Human-readable plugin name' },
        version: { type: 'string', description: 'Semver version (e.g. "1.0.0")' },
        description: { type: 'string', description: 'Brief description of what the plugin does' },
        code: { type: 'string', description: 'JavaScript IIFE code that returns a plugin object. Must not use ES module imports — everything is available via the ctx parameter.' },
      },
      required: ['id', 'name', 'version', 'description', 'code'],
    },
  },
  {
    name: 'update_plugin',
    description: 'Update an existing plugin with new code. The plugin will be deactivated, updated, and re-activated.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the plugin to update' },
        code: { type: 'string', description: 'New JavaScript IIFE code for the plugin' },
      },
      required: ['id', 'code'],
    },
  },
  {
    name: 'list_plugins',
    description: 'List all installed plugins with their status.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'toggle_plugin',
    description: 'Enable or disable a plugin.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the plugin to toggle' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_plugin',
    description: 'Delete a plugin completely. Removes all code, storage, and settings.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the plugin to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_plugin_logs',
    description: 'Get recent log entries for a plugin.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the plugin to get logs for' },
        limit: { type: 'number', description: 'Max number of log entries to return (default 20)' },
      },
      required: ['id'],
    },
  },
]

const FS_TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a source file. Path is relative to the project root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root (e.g. "app/composables/useClaude.ts")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file. Use only for new files — prefer edit_file for modifications.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Find and replace text in a file. The old_text must appear exactly once in the file. Use this for all modifications to existing files.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
        old_text: { type: 'string', description: 'Exact text to find (must be unique in the file)' },
        new_text: { type: 'string', description: 'Text to replace it with' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories. Returns name, path, type, and size for each entry.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to project root (e.g. "app/composables")' },
        recursive: { type: 'boolean', description: 'Whether to list recursively (default false)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search file contents by regex pattern. Returns matching file, line number, and line content. Skips node_modules, .git, target, dist.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'Directory to search in (relative to project root, default: entire project)' },
        glob: { type: 'string', description: 'File extension filter (e.g. "*.ts", "*.vue")' },
      },
      required: ['pattern'],
    },
  },
]

export function useClaudeTools() {
  function getToolDefinitions(): ClaudeToolDefinition[] {
    return [...PLUGIN_TOOLS, ...(isTauri ? FS_TOOLS : [])]
  }

  async function executeTool(name: string, input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    try {
      switch (name) {
        // Plugin tools
        case 'create_plugin':
          return await handleCreatePlugin(input)
        case 'update_plugin':
          return await handleUpdatePlugin(input)
        case 'list_plugins':
          return handleListPlugins()
        case 'toggle_plugin':
          return await handleTogglePlugin(input)
        case 'delete_plugin':
          return await handleDeletePlugin(input)
        case 'get_plugin_logs':
          return handleGetPluginLogs(input)
        // Filesystem tools
        case 'read_file':
          return await handleReadFile(input)
        case 'write_file':
          return await handleWriteFile(input)
        case 'edit_file':
          return await handleEditFile(input)
        case 'list_directory':
          return await handleListDirectory(input)
        case 'search_files':
          return await handleSearchFiles(input)
        default:
          return { result: `Unknown tool: ${name}`, isError: true }
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { result: `Tool execution error: ${message}`, isError: true }
    }
  }

  // --- Plugin tool handlers ---

  async function handleCreatePlugin(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { id, name, version, description, code } = input as {
      id: string
      name: string
      version: string
      description: string
      code: string
    }

    if (!id || !name || !code) {
      return { result: 'Missing required fields: id, name, code', isError: true }
    }

    const { installPluginFromCode } = usePlugins()
    const result = await installPluginFromCode(code, {
      id,
      name,
      version: version || '1.0.0',
      description: description || '',
    })

    if (result.success) {
      return { result: `Plugin "${name}" (${id}) installed and activated successfully.`, isError: false }
    }
    return { result: `Failed to install plugin: ${result.error}`, isError: true }
  }

  async function handleUpdatePlugin(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { id, code } = input as { id: string; code: string }

    if (!id || !code) {
      return { result: 'Missing required fields: id, code', isError: true }
    }

    const { updatePluginCode } = usePlugins()
    const result = await updatePluginCode(id, code)

    if (result.success) {
      return { result: `Plugin "${id}" updated and re-activated successfully.`, isError: false }
    }
    return { result: `Failed to update plugin: ${result.error}`, isError: true }
  }

  function handleListPlugins(): { result: string; isError: boolean } {
    const pluginStore = usePluginStore()
    const plugins = pluginStore.pluginList

    if (plugins.length === 0) {
      return { result: 'No plugins installed.', isError: false }
    }

    const lines = plugins.map((p) => {
      const status = p.enabled ? 'enabled' : 'disabled'
      const type = p.path.startsWith('bundled:') ? 'bundled' : 'generated'
      return `- ${p.manifest.name} (${p.manifest.id}) [${status}, ${type}]: ${p.manifest.description}`
    })

    return { result: `Installed plugins:\n${lines.join('\n')}`, isError: false }
  }

  async function handleTogglePlugin(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { id } = input as { id: string }
    if (!id) {
      return { result: 'Missing required field: id', isError: true }
    }

    const pluginStore = usePluginStore()
    const plugin = pluginStore.getPlugin(id)
    if (!plugin) {
      return { result: `Plugin "${id}" not found.`, isError: true }
    }

    const { togglePlugin } = usePlugins()
    await togglePlugin(id)

    const newState = pluginStore.getPlugin(id)?.enabled ? 'enabled' : 'disabled'
    return { result: `Plugin "${id}" is now ${newState}.`, isError: false }
  }

  async function handleDeletePlugin(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { id } = input as { id: string }
    if (!id) {
      return { result: 'Missing required field: id', isError: true }
    }

    const { deletePlugin } = usePlugins()
    const result = await deletePlugin(id)

    if (result.success) {
      return { result: `Plugin "${id}" deleted successfully.`, isError: false }
    }
    return { result: `Failed to delete plugin: ${result.error}`, isError: true }
  }

  function handleGetPluginLogs(input: Record<string, unknown>): { result: string; isError: boolean } {
    const { id, limit = 20 } = input as { id: string; limit?: number }
    if (!id) {
      return { result: 'Missing required field: id', isError: true }
    }

    const pluginStore = usePluginStore()
    const plugin = pluginStore.getPlugin(id)
    if (!plugin) {
      return { result: `Plugin "${id}" not found.`, isError: true }
    }

    const logs = plugin.logs.slice(-(limit as number))
    if (logs.length === 0) {
      return { result: `No logs for plugin "${id}".`, isError: false }
    }

    const lines = logs.map((l: PluginLogEntry) => {
      const time = new Date(l.timestamp).toLocaleTimeString()
      return `[${time}] ${l.level.toUpperCase()}: ${l.message}`
    })

    return { result: lines.join('\n'), isError: false }
  }

  // --- Filesystem tool handlers ---

  async function handleReadFile(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { path } = input as { path: string }
    if (!path) {
      return { result: 'Missing required field: path', isError: true }
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const projectRoot = await getProjectRoot()
    const content = await invoke<string>('fs_read_file', { projectRoot, path })
    return { result: content, isError: false }
  }

  async function handleWriteFile(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { path, content } = input as { path: string; content: string }
    if (!path || content === undefined) {
      return { result: 'Missing required fields: path, content', isError: true }
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const projectRoot = await getProjectRoot()
    await invoke('fs_write_file', { projectRoot, path, content })
    return { result: `File written: ${path}`, isError: false }
  }

  async function handleEditFile(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { path, old_text, new_text } = input as { path: string; old_text: string; new_text: string }
    if (!path || !old_text || new_text === undefined) {
      return { result: 'Missing required fields: path, old_text, new_text', isError: true }
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const projectRoot = await getProjectRoot()
    await invoke('fs_edit_file', { projectRoot, path, oldText: old_text, newText: new_text })
    return { result: `File edited: ${path}`, isError: false }
  }

  async function handleListDirectory(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { path, recursive } = input as { path: string; recursive?: boolean }
    if (!path) {
      return { result: 'Missing required field: path', isError: true }
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const projectRoot = await getProjectRoot()
    const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean; size: number }>>('fs_list_directory', {
      projectRoot,
      path,
      recursive: recursive || false,
    })

    const lines = entries.map((e) => {
      const type = e.is_dir ? '[dir]' : `${e.size}b`
      return `${e.path} ${type}`
    })

    return { result: lines.join('\n') || '(empty directory)', isError: false }
  }

  async function handleSearchFiles(input: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    const { pattern, path, glob } = input as { pattern: string; path?: string; glob?: string }
    if (!pattern) {
      return { result: 'Missing required field: pattern', isError: true }
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const projectRoot = await getProjectRoot()
    const results = await invoke<Array<{ file: string; line: number; content: string }>>('fs_search_files', {
      projectRoot,
      pattern,
      path: path || null,
      glob: glob || null,
    })

    if (results.length === 0) {
      return { result: 'No matches found.', isError: false }
    }

    const lines = results.map(r => `${r.file}:${r.line}: ${r.content}`)
    const suffix = results.length >= 100 ? '\n... (results capped at 100)' : ''
    return { result: lines.join('\n') + suffix, isError: false }
  }

  return {
    getToolDefinitions,
    executeTool,
  }
}
