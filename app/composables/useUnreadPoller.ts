const CHAT_LIST_INTERVAL = 15_000
const CHANNEL_PEEK_INTERVAL = 20_000
const CHANNEL_STAGGER_MS = 500
const MAX_WATCHED_CHANNELS = 15

// Module-level state
const watchedChannels = ref<Array<{ teamId: string; channelId: string }>>([])

export function useUnreadPoller() {
  const { refreshChats, chats } = useChats()
  const { peekChannelLatestMessage } = useChannels()
  const { updateFromChats, updateChannelUnread } = useUnreadStore()
  const { currentUserId } = useCurrentUser()

  let chatTimer: ReturnType<typeof setInterval> | null = null
  let channelTimer: ReturnType<typeof setInterval> | null = null

  async function pollChats() {
    try {
      await refreshChats()
      updateFromChats(chats.value, currentUserId.value)
    }
    catch (err) {
      console.warn('[useUnreadPoller] Chat poll failed:', err)
    }
  }

  async function pollChannels() {
    const channels = watchedChannels.value.slice(0, MAX_WATCHED_CHANNELS)
    for (const ch of channels) {
      try {
        const latest = await peekChannelLatestMessage(ch.teamId, ch.channelId)
        if (latest) {
          updateChannelUnread(
            ch.teamId,
            ch.channelId,
            latest.createdDateTime,
            latest.fromUserId,
            currentUserId.value,
          )
        }
      }
      catch (err) {
        console.warn(`[useUnreadPoller] Channel poll failed (${ch.teamId}/${ch.channelId}):`, err)
      }
      // Stagger requests to avoid rate limit spikes
      if (channels.indexOf(ch) < channels.length - 1) {
        await new Promise(r => setTimeout(r, CHANNEL_STAGGER_MS))
      }
    }
  }

  function setWatchedChannels(channels: Array<{ teamId: string; channelId: string }>) {
    watchedChannels.value = channels
  }

  function startPolling() {
    stopPolling()
    chatTimer = setInterval(pollChats, CHAT_LIST_INTERVAL)
    channelTimer = setInterval(pollChannels, CHANNEL_PEEK_INTERVAL)
  }

  function stopPolling() {
    if (chatTimer) {
      clearInterval(chatTimer)
      chatTimer = null
    }
    if (channelTimer) {
      clearInterval(channelTimer)
      channelTimer = null
    }
  }

  return {
    watchedChannels,
    startPolling,
    stopPolling,
    setWatchedChannels,
    pollChats,
    pollChannels,
  }
}
