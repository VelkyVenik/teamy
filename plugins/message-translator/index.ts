import type { TeamyPlugin, PluginContext, PluginMessage } from '~/types/plugin'

export default {
  id: 'message-translator',
  name: 'Message Translator',
  version: '1.0.0',
  description: 'Translate messages to your preferred language using Claude AI.',
  settingsSchema: {
    targetLanguage: {
      type: 'select',
      label: 'Target Language',
      description: 'Language to translate messages into',
      default: 'English',
      options: [
        { label: 'English', value: 'English' },
        { label: 'Czech', value: 'Czech' },
        { label: 'Spanish', value: 'Spanish' },
        { label: 'French', value: 'French' },
        { label: 'German', value: 'German' },
        { label: 'Japanese', value: 'Japanese' },
        { label: 'Chinese', value: 'Chinese' },
        { label: 'Korean', value: 'Korean' },
        { label: 'Portuguese', value: 'Portuguese' },
      ],
    },
  },

  activate(ctx: PluginContext) {
    ctx.log('info', 'Message Translator activated')

    ctx.registerMessageAction('Translate', async (msg: PluginMessage) => {
      const targetLang = ctx.settings.get<string>('targetLanguage') || 'English'

      ctx.log('info', `Translating message from ${msg.sender.name} to ${targetLang}`)

      try {
        // Call the Claude API through the server proxy
        const response = await $fetch('/api/claude/chat', {
          method: 'POST',
          body: {
            messages: [
              {
                role: 'user',
                content: `Translate the following message to ${targetLang}. Only output the translation, nothing else.\n\nMessage: "${msg.content}"`,
              },
            ],
            stream: false,
          },
        })

        const translated = (response as any)?.content?.[0]?.text || 'Translation failed'
        ctx.log('info', `Translation result: ${translated.slice(0, 100)}`)

        // Store the translation
        await ctx.storage.set(`translation-${msg.id}`, {
          original: msg.content,
          translated,
          targetLanguage: targetLang,
          timestamp: Date.now(),
        })
      }
      catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        ctx.log('error', `Translation failed: ${message}`)
      }
    })

    ctx.registerCommand('translate', 'Translate the last message', async (text: string) => {
      const targetLang = ctx.settings.get<string>('targetLanguage') || 'English'
      ctx.log('info', `Translating text to ${targetLang}: ${text.slice(0, 50)}...`)
    })
  },

  deactivate() {},
} satisfies TeamyPlugin
