import type { ClaudeChatMessage, ClaudeContext, ClaudeMessage, ClaudeStreamEvent, QuickAction } from '~/types/claude'

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
    'You are Teamy AI, an embedded assistant in a lightweight Microsoft Teams client called Teamy.',
    'You help users manage their chats, draft messages, translate content, and extend the app with plugins.',
    '',
    'You have access to the following quick actions:',
    '- /summarize — Summarize unread messages in the current chat',
    '- /draft — Draft a reply based on conversation context',
    '- /translate — Translate a selected message',
    '- /plugin <description> — Generate a new plugin for Teamy',
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
      parts.push(`  - ${p.name}: ${p.description}`)
    }
  }

  parts.push(
    '',
    'When generating plugins, create valid TypeScript ES modules that implement the TeamyPlugin interface.',
    'Each plugin must export a default object with: id, name, version, description, activate(ctx), deactivate().',
    'The PluginContext provides: registerSidebarPanel, registerMessageAction, registerCommand, sendNotification, graphFetch, storage, settings, on/off events, log.',
    '',
    'Keep responses concise and helpful. Use markdown formatting when appropriate.',
  )

  return parts.join('\n')
}

export function useClaude() {
  const messages = useState<ClaudeChatMessage[]>('claude-messages', () => [])
  const isStreaming = useState('claude-streaming', () => false)
  const error = useState<string | null>('claude-error', () => null)
  const context = useState<ClaudeContext>('claude-context', () => ({}))

  function setContext(ctx: Partial<ClaudeContext>) {
    context.value = { ...context.value, ...ctx }
  }

  /** Pull live context from chat store and plugin store */
  function refreshContext() {
    const chatStore = useChatStore()
    const pluginStore = usePluginStore()

    const ctx: Partial<ClaudeContext> = {}

    // Current chat info
    if (chatStore.activeChat) {
      ctx.chatName = chatStore.activeChat.topic || 'Direct chat'
      ctx.chatType = chatStore.activeChat.chatType
    }

    // Recent messages from active chat (last 10, summarized)
    if (chatStore.activeMessages.length > 0) {
      ctx.recentMessages = chatStore.activeMessages.slice(-10).map((m) => ({
        sender: m.from?.user?.displayName || 'Unknown',
        content: m.body?.content?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
      }))
    }

    // Installed plugins
    if (pluginStore.pluginList.length > 0) {
      ctx.installedPlugins = pluginStore.pluginList.map((p) => ({
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

  async function sendMessage(content: string) {
    if (isStreaming.value) return
    error.value = null

    // Refresh context from stores before sending
    refreshContext()

    // Check for quick actions
    const quickAction = parseQuickAction(content)
    if (quickAction) {
      content = quickAction.prompt
    }

    // Add user message
    const userMsg: ClaudeChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    messages.value.push(userMsg)

    // Add placeholder for assistant message
    const assistantMsg: ClaudeChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }
    messages.value.push(assistantMsg)

    isStreaming.value = true

    try {
      // Build API messages (exclude streaming metadata)
      const apiMessages: ClaudeMessage[] = messages.value
        .filter((m) => !m.isStreaming)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))

      const response = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          system: buildSystemPrompt(context.value),
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data) as ClaudeStreamEvent

              if (parsed.type === 'content_block_delta' && parsed.delta.type === 'text_delta') {
                // Find the last assistant message and append text
                const lastMsg = messages.value[messages.value.length - 1]
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.content += parsed.delta.text
                }
              }

              if (parsed.type === 'message_stop') {
                const lastMsg = messages.value[messages.value.length - 1]
                if (lastMsg) {
                  lastMsg.isStreaming = false
                }
              }
            }
            catch {
              // Ignore parse errors for partial data
            }
          }
        }
      }

      // Ensure streaming flag is cleared
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg) {
        lastMsg.isStreaming = false
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      // Remove the empty assistant message on error
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg?.role === 'assistant' && lastMsg.content === '') {
        messages.value.pop()
      }
    }
    finally {
      isStreaming.value = false
    }
  }

  function parseQuickAction(input: string): { action: string; prompt: string } | null {
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
          ? `Generate a Teamy plugin with the following description: "${description}". Output the complete plugin code as a TypeScript ES module implementing the TeamyPlugin interface. Include the id, name, version, description, activate(ctx), and deactivate() methods.`
          : 'What kind of plugin would you like me to generate? Describe what it should do.',
      }
    }

    return null
  }

  return {
    messages: readonly(messages),
    isStreaming: readonly(isStreaming),
    error: readonly(error),
    quickActions: QUICK_ACTIONS,
    sendMessage,
    clearMessages,
    setContext,
    refreshContext,
  }
}
