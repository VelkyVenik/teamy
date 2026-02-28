import type { Channel, ChannelMessage, PendingImage, Team, UseChannelsReturn } from '~/types/graph'

export function useChannels(): UseChannelsReturn {
  const { graphFetchAll, graphFetch, graphFetchPage } = useGraph()

  const teams = ref<Team[]>([])
  const channels = ref<Map<string, Channel[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTeams() {
    loading.value = true
    error.value = null
    try {
      const result = await graphFetchAll<Team>('/me/joinedTeams')
      teams.value = result
    }
    catch (err: any) {
      console.error('[useChannels] fetchTeams failed:', err)
      error.value = err?.error?.message ?? err?.message ?? 'Failed to fetch teams'
    }
    finally {
      loading.value = false
    }
  }

  /** Fetch teams the user is associated with via shared channels but hasn't directly joined. */
  async function fetchAssociatedTeams() {
    try {
      const associated = await graphFetchAll<{ id: string, displayName: string, tenantId: string }>(
        '/me/teamwork/associatedTeams',
      )
      const joinedIds = new Set(teams.value.map(t => t.id))
      const extra = associated
        .filter(t => !joinedIds.has(t.id))
        .map(t => ({
          id: t.id,
          displayName: t.displayName,
          description: null,
          isArchived: false,
          webUrl: null,
        } satisfies Team))

      if (extra.length > 0) {
        teams.value = [...teams.value, ...extra]
      }
    }
    catch (err: any) {
      // Non-critical — log but don't block
      console.warn('[useChannels] fetchAssociatedTeams failed:', err)
    }
  }

  async function fetchChannels(teamId: string) {
    try {
      const result = await graphFetchAll<Channel>(`/teams/${teamId}/channels`)
      channels.value.set(teamId, result)
      // Trigger reactivity on the Map
      channels.value = new Map(channels.value)
    }
    catch (err: any) {
      console.error(`[useChannels] fetchChannels(${teamId}) failed:`, err)
      error.value = err?.error?.message ?? err?.message ?? 'Failed to fetch channels'
    }
  }

  async function fetchChannelMessages(teamId: string, channelId: string): Promise<ChannelMessage[]> {
    const page = await graphFetchPage<ChannelMessage>(
      `/teams/${teamId}/channels/${channelId}/messages`,
      {
        params: {
          $top: '50',
          $expand: 'replies',
        },
      },
    )
    return page.value.reverse()
  }

  async function sendChannelMessage(
    teamId: string,
    channelId: string,
    content: string,
    contentType: 'text' | 'html' = 'text',
    images: PendingImage[] = [],
  ) {
    const payload = await buildMessagePayload(content, images)
    await graphFetch(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /** Lightweight peek: fetch only the latest message to check for new activity. */
  async function peekChannelLatestMessage(teamId: string, channelId: string): Promise<{
    createdDateTime: string
    fromUserId: string | null
  } | null> {
    const page = await graphFetchPage<ChannelMessage>(
      `/teams/${teamId}/channels/${channelId}/messages`,
      { params: { $top: '1', $orderby: 'createdDateTime desc' } },
    )
    const msg = page.value[0]
    if (!msg || msg.messageType !== 'message') return null
    return { createdDateTime: msg.createdDateTime, fromUserId: msg.from?.user?.id ?? null }
  }

  return {
    teams,
    channels,
    loading,
    error,
    fetchTeams,
    fetchAssociatedTeams,
    fetchChannels,
    fetchChannelMessages,
    sendChannelMessage,
    peekChannelLatestMessage,
  }
}
