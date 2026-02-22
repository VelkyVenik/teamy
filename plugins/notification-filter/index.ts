import type { TeamyPlugin, PluginContext, PluginMessage } from '~/types/plugin'

export default {
  id: 'notification-filter',
  name: 'Smart Notifications',
  version: '1.0.0',
  description: 'Filter notifications by chat type and sender. Only get notified for DMs from specific people.',
  settingsSchema: {
    vipList: {
      type: 'string',
      label: 'VIP Senders',
      description: 'Comma-separated list of email addresses that should always trigger notifications',
      default: '',
    },
    muteGroupChats: {
      type: 'boolean',
      label: 'Mute Group Chats',
      description: 'Suppress notifications from group chats',
      default: false,
    },
    muteMeetingChats: {
      type: 'boolean',
      label: 'Mute Meeting Chats',
      description: 'Suppress notifications from meeting chats',
      default: true,
    },
  },

  activate(ctx: PluginContext) {
    ctx.log('info', 'Smart Notifications activated')

    ctx.on('message:received', async (msg: PluginMessage) => {
      const muteGroup = ctx.settings.get<boolean>('muteGroupChats')
      const muteMeeting = ctx.settings.get<boolean>('muteMeetingChats')
      const vipRaw = ctx.settings.get<string>('vipList')
      const vipList = vipRaw
        ? vipRaw.split(',').map((e: string) => e.trim().toLowerCase())
        : []

      // Mute group chats if setting enabled
      if (muteGroup && msg.chatType === 'group') {
        ctx.log('info', `Muted group chat notification from ${msg.sender.name}`)
        return
      }

      // Mute meeting chats if setting enabled
      if (muteMeeting && msg.chatType === 'meeting') {
        ctx.log('info', `Muted meeting chat notification from ${msg.sender.name}`)
        return
      }

      // For 1:1 chats, check VIP list if configured
      if (msg.chatType === 'oneOnOne' && vipList.length > 0) {
        const senderEmail = msg.sender.email?.toLowerCase() || ''
        if (!vipList.includes(senderEmail)) {
          ctx.log('info', `Filtered notification: ${msg.sender.name} not in VIP list`)
          return
        }
      }

      // Send notification
      await ctx.sendNotification(
        msg.sender.name,
        msg.preview || msg.content.slice(0, 100),
      )
      ctx.log('info', `Notification sent for message from ${msg.sender.name}`)
    })

    ctx.registerCommand('notify-vip', 'Add a VIP sender to the notification list', (email: string) => {
      const current = ctx.settings.get<string>('vipList') || ''
      const list = current ? current.split(',').map((e: string) => e.trim()) : []
      if (!list.includes(email)) {
        list.push(email)
        ctx.settings.set('vipList', list.join(', '))
        ctx.log('info', `Added ${email} to VIP list`)
      }
    })
  },

  deactivate() {
    // Event handlers are cleaned up automatically by the plugin system
  },
} satisfies TeamyPlugin
