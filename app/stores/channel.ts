import { defineStore } from 'pinia'
import type { Channel, ChannelMessage, Team } from '~/types/graph'

export const useChannelStore = defineStore('channel', () => {
  const teams = ref<Team[]>([])
  const channels = ref<Map<string, Channel[]>>(new Map())
  const activeTeamId = ref<string | null>(null)
  const activeChannelId = ref<string | null>(null)
  const channelMessages = ref<Map<string, ChannelMessage[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeTeam = computed(() =>
    teams.value.find(t => t.id === activeTeamId.value) ?? null,
  )

  const activeChannel = computed(() => {
    if (!activeTeamId.value || !activeChannelId.value) return null
    const teamChannels = channels.value.get(activeTeamId.value)
    return teamChannels?.find(c => c.id === activeChannelId.value) ?? null
  })

  const activeChannelMessages = computed(() => {
    const key = channelKey(activeTeamId.value, activeChannelId.value)
    return key ? (channelMessages.value.get(key) ?? []) : []
  })

  const teamChannels = computed(() => {
    if (!activeTeamId.value) return []
    return channels.value.get(activeTeamId.value) ?? []
  })

  function channelKey(teamId: string | null, channelId: string | null): string | null {
    if (!teamId || !channelId) return null
    return `${teamId}:${channelId}`
  }

  function setTeams(newTeams: Team[]) {
    teams.value = newTeams
  }

  function setChannels(teamId: string, newChannels: Channel[]) {
    channels.value.set(teamId, newChannels)
    channels.value = new Map(channels.value)
  }

  function setActiveTeam(teamId: string | null) {
    activeTeamId.value = teamId
    activeChannelId.value = null
  }

  function setActiveChannel(teamId: string, channelId: string) {
    activeTeamId.value = teamId
    activeChannelId.value = channelId
  }

  function setChannelMessages(teamId: string, channelId: string, msgs: ChannelMessage[]) {
    const key = `${teamId}:${channelId}`
    channelMessages.value.set(key, msgs)
    channelMessages.value = new Map(channelMessages.value)
  }

  function appendChannelMessage(teamId: string, channelId: string, message: ChannelMessage) {
    const key = `${teamId}:${channelId}`
    const existing = channelMessages.value.get(key) ?? []
    if (!existing.find(m => m.id === message.id)) {
      channelMessages.value.set(key, [...existing, message])
      channelMessages.value = new Map(channelMessages.value)
    }
  }

  function setLoading(val: boolean) {
    loading.value = val
  }

  function setError(val: string | null) {
    error.value = val
  }

  return {
    teams,
    channels,
    activeTeamId,
    activeChannelId,
    activeTeam,
    activeChannel,
    activeChannelMessages,
    teamChannels,
    loading,
    error,
    setTeams,
    setChannels,
    setActiveTeam,
    setActiveChannel,
    setChannelMessages,
    appendChannelMessage,
    setLoading,
    setError,
  }
})
