import type { TeamyPlugin, PluginContext, PluginMessage } from '~/types/plugin'

export default {
  id: 'unread-summarizer',
  name: 'Unread Summarizer',
  version: '1.0.0',
  description: 'Summarize unread messages on demand using Claude AI. Highlights key decisions and action items.',
  settingsSchema: {
    maxMessages: {
      type: 'number',
      label: 'Max Messages to Summarize',
      description: 'Maximum number of unread messages to include in the summary',
      default: 50,
    },
    includeActionItems: {
      type: 'boolean',
      label: 'Include Action Items',
      description: 'Extract and highlight action items from the summary',
      default: true,
    },
  },

  activate(ctx: PluginContext) {
    ctx.log('info', 'Unread Summarizer activated')

    // Collect unread messages for summarization
    const unreadMessages: PluginMessage[] = []

    ctx.on('message:received', (msg: PluginMessage) => {
      const maxMessages = ctx.settings.get<number>('maxMessages') || 50
      unreadMessages.push(msg)

      // Keep only the latest N messages
      if (unreadMessages.length > maxMessages) {
        unreadMessages.shift()
      }
    })

    // Clear unread buffer when user switches chat
    ctx.on('chat:switched', () => {
      unreadMessages.length = 0
      ctx.log('info', 'Cleared unread message buffer (chat switched)')
    })

    ctx.registerCommand('summarize-unread', 'Summarize recent unread messages', async () => {
      if (unreadMessages.length === 0) {
        ctx.log('info', 'No unread messages to summarize')
        return
      }

      ctx.log('info', `Summarizing ${unreadMessages.length} unread messages`)

      const includeActionItems = ctx.settings.get<boolean>('includeActionItems')

      const messageText = unreadMessages
        .map((m) => `${m.sender.name}: ${m.content}`)
        .join('\n')

      const prompt = includeActionItems
        ? `Summarize the following chat messages. Highlight key decisions and list any action items at the end.\n\nMessages:\n${messageText}`
        : `Summarize the following chat messages briefly.\n\nMessages:\n${messageText}`

      try {
        const response = await $fetch('/api/claude/chat', {
          method: 'POST',
          body: {
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            stream: false,
          },
        })

        const summary = (response as any)?.content?.[0]?.text || 'Summary generation failed'

        // Store the summary
        await ctx.storage.set(`summary-${Date.now()}`, {
          messageCount: unreadMessages.length,
          summary,
          timestamp: Date.now(),
        })

        ctx.log('info', `Summary generated: ${summary.slice(0, 200)}`)
      }
      catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        ctx.log('error', `Summary generation failed: ${message}`)
      }
    })
  },

  deactivate() {},
} satisfies TeamyPlugin
