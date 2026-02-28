import type {
  ClaudeChatMessage,
  ClaudeContentBlock,
  ClaudeContext,
  ClaudeMessage,
  ClaudeStreamEvent,
  ClaudeToolCall,
  ClaudeToolResultBlock,
  ClaudeToolUseBlock,
  QuickAction,
} from '~/types/claude'

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window
const MAX_TOOL_ITERATIONS = 10

const QUICK_ACTIONS: QuickAction[] = [
  {
    name: 'summarize',
    label: 'Summarize',
    icon: 'i-lucide-file-text',
    description: 'Summarize unread messages in current chat',
  },
  {
    name: 'draft',
    label: 'Draft Reply',
    icon: 'i-lucide-pen-line',
    description: 'Draft a reply based on conversation context',
  },
  {
    name: 'translate',
    label: 'Translate',
    icon: 'i-lucide-languages',
    description: 'Translate selected message',
  },
  {
    name: 'plugin',
    label: 'New Plugin',
    icon: 'i-lucide-puzzle',
    description: 'Generate a new plugin from description',
  },
]

function buildSystemPrompt(context: ClaudeContext): string {
  const parts: string[] = [
    'You are Teamy AI, an embedded dev assistant in a lightweight Microsoft Teams client called Teamy.',
    'You help users manage their chats, draft messages, translate content, extend the app with plugins, and directly read/edit the app source code.',
    '',
    '## Project',
    '',
    'Tech stack: Nuxt 4 (SPA), Vue 3, Nuxt UI v4, Pinia, Tauri 2 (Rust), TypeScript, Bun.',
    'Key directories:',
    '- app/components/ — Vue components (auto-imported)',
    '- app/composables/ — Composables with module-level shared state',
    '- app/pages/ — File-based routing (index.vue, chat/[chatId].vue, channel/[teamId]/[channelId].vue)',
    '- app/utils/ — Utility functions (auto-imported)',
    '- app/stores/ — Pinia stores',
    '- types/ — Shared TypeScript types',
    '- src-tauri/src/ — Tauri Rust backend',
    '- plugins/ — Bundled plugin source',
    '',
    'Key patterns: module-level refs for shared state (not Pinia), Graph API via useGraph() composable, auto-imports for components/composables/utils.',
    '',
    '## Filesystem Tools',
    '',
    'You have direct access to the project source files. Use these tools to read, search, edit, and create files.',
    '- Always use read_file before editing a file you haven\'t seen yet.',
    '- Use edit_file (find-and-replace) for modifications to existing files — NOT write_file.',
    '- Use write_file only for creating new files.',
    '- Paths are relative to the project root (e.g. "app/composables/useClaude.ts").',
    '',
    '## Plugin Creation',
    '',
    'When the user asks you to create, modify, or manage plugins, use the plugin tools. Do NOT output plugin code as text — always use the create_plugin or update_plugin tool.',
    '',
    'Plugin code must be a JavaScript IIFE that returns an object with: id, name, version, description, activate(ctx), deactivate().',
    '',
    'The PluginContext (ctx) provides:',
    '- ctx.registerCommand(name, description, handler) — register a slash command',
    '- ctx.registerMessageAction(label, handler) — add to message context menu',
    '- ctx.on(event, handler) — subscribe to events: message:received, message:sent, chat:switched, presence:changed',
    '- ctx.off(event, handler) — unsubscribe',
    '- ctx.sendNotification(title, body) — native notification',
    '- ctx.graphFetch(path, options) — authenticated MS Graph API call',
    '- ctx.claudeChat(messages) — call Claude AI (non-streaming)',
    '- ctx.storage.get/set/remove/clear — persistent key-value storage',
    '- ctx.settings.get/set/getAll — plugin settings',
    '- ctx.log(level, message) — log to plugin manager',
    '',
    'IMPORTANT: Do NOT use ES module imports (import/export). Everything is available via ctx.',
    'IMPORTANT: The code must be pure JavaScript, not TypeScript.',
    '',
  ]

  if (context.chatName) {
    parts.push(`Current chat: "${context.chatName}" (type: ${context.chatType || 'unknown'})`)
  }

  if (context.recentMessages?.length) {
    parts.push('', 'Recent messages in current chat:')
    for (const msg of context.recentMessages.slice(-10)) {
      parts.push(`  ${msg.sender}: ${msg.content.slice(0, 200)}`)
    }
  }

  if (context.installedPlugins?.length) {
    parts.push('', 'Installed plugins:')
    for (const p of context.installedPlugins) {
      parts.push(`  - ${p.name} (${p.id}): ${p.description}`)
    }
  }

  parts.push(
    '',
    'Keep responses concise and helpful. Use markdown formatting when appropriate.',
  )

  return parts.join('\n')
}

const messages = ref<ClaudeChatMessage[]>([])
const isStreaming = ref(false)
const error = ref<string | null>(null)
const context = ref<ClaudeContext>({})
const hasApiKey = ref(false)

export function useClaude() {
  function setContext(ctx: Partial<ClaudeContext>) {
    context.value = { ...context.value, ...ctx }
  }

  function refreshContext() {
    const chatStore = useChatStore()
    const pluginStore = usePluginStore()

    const ctx: Partial<ClaudeContext> = {}

    if (chatStore.activeChat) {
      ctx.chatName = chatStore.activeChat.topic || 'Direct chat'
      ctx.chatType = chatStore.activeChat.chatType
    }

    if (chatStore.activeMessages.length > 0) {
      ctx.recentMessages = chatStore.activeMessages.slice(-10).map((m: any) => ({
        sender: m.from?.user?.displayName || 'Unknown',
        content: m.body?.content?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
      }))
    }

    if (pluginStore.pluginList.length > 0) {
      ctx.installedPlugins = pluginStore.pluginList.map(p => ({
        id: p.manifest.id,
        name: p.manifest.name,
        description: p.manifest.description,
      }))
    }

    setContext(ctx)
  }

  function clearMessages() {
    messages.value = []
    error.value = null
  }

  async function checkApiKey() {
    if (!isTauri) {
      hasApiKey.value = false
      return
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      hasApiKey.value = await invoke<boolean>('has_claude_api_key')
    }
    catch {
      hasApiKey.value = false
    }
  }

  async function parseQuickAction(input: string): Promise<{ action: string; prompt: string } | null> {
    const trimmed = input.trim()

    if (trimmed === '/summarize') {
      return {
        action: 'summarize',
        prompt: 'Please summarize the unread messages in the current chat. Highlight key action items and decisions.',
      }
    }

    if (trimmed === '/draft') {
      return {
        action: 'draft',
        prompt: 'Based on the recent conversation context, draft an appropriate reply. Keep it professional and concise.',
      }
    }

    if (trimmed.startsWith('/translate')) {
      const text = trimmed.slice('/translate'.length).trim()
      return {
        action: 'translate',
        prompt: text
          ? `Translate the following message to English: "${text}"`
          : 'Translate the most recent message in the chat to English.',
      }
    }

    if (trimmed.startsWith('/plugin')) {
      const description = trimmed.slice('/plugin'.length).trim()
      return {
        action: 'plugin',
        prompt: description
          ? `Create a Teamy plugin: ${description}`
          : 'What kind of plugin would you like me to create? Describe what it should do.',
      }
    }

    // Try plugin commands
    if (trimmed.startsWith('/')) {
      const spaceIdx = trimmed.indexOf(' ')
      const cmdName = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)
      const cmdArg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1)
      const { executed } = await executeCommand(cmdName, cmdArg)
      if (executed) {
        return { action: 'command', prompt: '' }
      }
    }

    return null
  }

  async function sendMessage(userInput: string) {
    if (isStreaming.value) return
    if (!isTauri) {
      error.value = 'Claude AI requires the desktop app'
      return
    }
    error.value = null

    refreshContext()

    // Check for quick actions
    const quickAction = await parseQuickAction(userInput)
    let apiContent = userInput
    if (quickAction) {
      // Command was handled by plugin system — no Claude needed
      if (quickAction.action === 'command') return
      apiContent = quickAction.prompt
    }

    // Add user message — show what the user actually typed
    messages.value.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    })

    // Add placeholder for assistant message
    messages.value.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      toolCalls: [],
    })

    // IMPORTANT: get the Vue-proxied reference from the array (not the raw object)
    // so that all subsequent mutations trigger reactivity
    const assistantMsg = messages.value[messages.value.length - 1]!

    isStreaming.value = true

    try {
      await runStreamingLoop(assistantMsg, apiContent)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      if (assistantMsg.content === '' && (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0)) {
        messages.value.pop()
      }
    }
    finally {
      assistantMsg.isStreaming = false
      isStreaming.value = false
    }
  }

  /**
   * Main streaming loop with tool use support.
   * Streams a response, and if the model uses tools, executes them and re-streams.
   */
  async function runStreamingLoop(assistantMsg: ClaudeChatMessage, apiContent: string) {
    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')
    const { getToolDefinitions, executeTool } = useClaudeTools()

    // Build conversation history for the API
    const conversationMessages: ClaudeMessage[] = []
    // Build from all messages except the current streaming one
    // The last user message uses apiContent (expanded prompt) instead of the display text
    const nonStreamingMessages = messages.value.filter((m: ClaudeChatMessage) => !m.isStreaming)
    for (let i = 0; i < nonStreamingMessages.length; i++) {
      const m = nonStreamingMessages[i]!
      if (m.role === 'user') {
        const isLast = i === nonStreamingMessages.length - 1
        conversationMessages.push({ role: 'user', content: isLast ? apiContent : m.content })
      }
      else if (m.role === 'assistant') {
        conversationMessages.push({ role: 'assistant', content: m.content })
      }
    }

    let iteration = 0

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++

      // Track content blocks as they stream in
      const contentBlocks: Array<{ type: string; text?: string; id?: string; name?: string; inputJson?: string }> = []
      let stopReason = ''

      // Stream one turn
      await new Promise<void>((resolve, reject) => {
        let unlistenChunk: (() => void) | undefined
        let unlistenEnd: (() => void) | undefined
        let unlistenError: (() => void) | undefined

        const cleanup = () => {
          unlistenChunk?.()
          unlistenEnd?.()
          unlistenError?.()
        }

        const setup = async () => {
          unlistenChunk = await listen<ClaudeStreamEvent>('claude:stream-chunk', (event) => {
            const parsed = event.payload

            if (parsed.type === 'content_block_start') {
              const block = parsed.content_block
              if (block.type === 'text') {
                contentBlocks[parsed.index] = { type: 'text', text: '' }
              }
              else if (block.type === 'tool_use') {
                contentBlocks[parsed.index] = {
                  type: 'tool_use',
                  id: (block as any).id,
                  name: (block as any).name,
                  inputJson: '',
                }
                // Add tool call to UI immediately
                const toolCall: ClaudeToolCall = {
                  id: (block as any).id,
                  name: (block as any).name,
                  input: {},
                  status: 'pending',
                }
                if (!assistantMsg.toolCalls) assistantMsg.toolCalls = []
                assistantMsg.toolCalls.push(toolCall)
              }
            }

            if (parsed.type === 'content_block_delta') {
              const block = contentBlocks[parsed.index]
              if (!block) return

              if (parsed.delta.type === 'text_delta') {
                block.text = (block.text || '') + parsed.delta.text
                // Update visible text
                assistantMsg.content = contentBlocks
                  .filter(b => b.type === 'text')
                  .map(b => b.text || '')
                  .join('')
              }
              else if (parsed.delta.type === 'input_json_delta') {
                block.inputJson = (block.inputJson || '') + parsed.delta.partial_json
              }
            }

            if (parsed.type === 'message_delta') {
              stopReason = parsed.delta.stop_reason
            }
          })

          unlistenEnd = await listen('claude:stream-end', () => {
            cleanup()
            resolve()
          })

          unlistenError = await listen<string>('claude:stream-error', (event) => {
            cleanup()
            reject(new Error(event.payload))
          })

          // Build API messages as flexible JSON values
          const apiMessages = conversationMessages.map(m => ({
            role: m.role,
            content: m.content,
          }))

          const toolDefs = getToolDefinitions()

          await invoke('claude_tool_stream', {
            request: {
              messages: apiMessages,
              system: buildSystemPrompt(context.value),
              tools: toolDefs.length > 0 ? toolDefs : undefined,
            },
          })
        }

        setup().catch((err) => {
          cleanup()
          reject(err)
        })
      })

      // Process tool use blocks
      if (stopReason === 'tool_use') {
        // Build the assistant content blocks for the conversation
        const assistantContentBlocks: ClaudeContentBlock[] = []
        for (const block of contentBlocks) {
          if (block.type === 'text' && block.text) {
            assistantContentBlocks.push({ type: 'text', text: block.text })
          }
          else if (block.type === 'tool_use') {
            let parsedInput: Record<string, unknown> = {}
            try {
              parsedInput = block.inputJson ? JSON.parse(block.inputJson) : {}
            }
            catch { /* use empty object */ }

            assistantContentBlocks.push({
              type: 'tool_use',
              id: block.id!,
              name: block.name!,
              input: parsedInput,
            } as ClaudeToolUseBlock)
          }
        }

        // Add assistant turn with content blocks to conversation
        conversationMessages.push({
          role: 'assistant',
          content: assistantContentBlocks,
        })

        // Execute each tool and collect results
        const toolResults: ClaudeToolResultBlock[] = []
        for (const block of assistantContentBlocks) {
          if (block.type !== 'tool_use') continue
          const toolBlock = block as ClaudeToolUseBlock

          // Update UI status
          const uiCall = assistantMsg.toolCalls?.find((tc: ClaudeToolCall) => tc.id === toolBlock.id)
          if (uiCall) {
            uiCall.input = toolBlock.input
            uiCall.status = 'running'
          }

          const { result, isError } = await executeTool(toolBlock.name, toolBlock.input)

          if (uiCall) {
            uiCall.status = isError ? 'error' : 'success'
            uiCall.result = result
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result,
            is_error: isError || undefined,
          })
        }

        // Add tool results as user turn
        conversationMessages.push({
          role: 'user',
          content: toolResults,
        })

        // Continue the loop — will stream another response
        continue
      }

      // end_turn or max_tokens — done
      break
    }
  }

  return {
    messages: readonly(messages),
    isStreaming: readonly(isStreaming),
    error: readonly(error),
    hasApiKey: readonly(hasApiKey),
    quickActions: QUICK_ACTIONS,
    sendMessage,
    clearMessages,
    setContext,
    refreshContext,
    checkApiKey,
  }
}
