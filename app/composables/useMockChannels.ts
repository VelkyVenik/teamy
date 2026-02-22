import type { Channel, ChannelMessage, Team, UseChannelsReturn } from '~~/types/graph'
import { MOCK_ME_USER_ID } from './useMockChats'

const mockTeams: Team[] = [
  {
    id: 'team-001',
    displayName: 'Engineering',
    description: 'Core engineering team',
    isArchived: false,
    webUrl: null,
  },
  {
    id: 'team-002',
    displayName: 'Design',
    description: 'Product design and UX',
    isArchived: false,
    webUrl: null,
  },
  {
    id: 'team-003',
    displayName: 'Company Wide',
    description: 'Announcements and general discussion',
    isArchived: false,
    webUrl: null,
  },
]

const mockChannelsByTeam: Record<string, Channel[]> = {
  'team-001': [
    { id: 'ch-001', displayName: 'General', description: 'General engineering discussion', createdDateTime: '2025-01-01T00:00:00Z', membershipType: 'standard', webUrl: null },
    { id: 'ch-002', displayName: 'Frontend', description: 'Frontend development', createdDateTime: '2025-01-01T00:00:00Z', membershipType: 'standard', webUrl: null },
    { id: 'ch-003', displayName: 'Backend', description: 'Backend and infrastructure', createdDateTime: '2025-01-01T00:00:00Z', membershipType: 'standard', webUrl: null },
    { id: 'ch-004', displayName: 'Code Reviews', description: 'PR reviews and discussions', createdDateTime: '2025-02-01T00:00:00Z', membershipType: 'standard', webUrl: null },
  ],
  'team-002': [
    { id: 'ch-005', displayName: 'General', description: 'Design team general', createdDateTime: '2025-01-01T00:00:00Z', membershipType: 'standard', webUrl: null },
    { id: 'ch-006', displayName: 'Reviews', description: 'Design reviews', createdDateTime: '2025-01-01T00:00:00Z', membershipType: 'standard', webUrl: null },
    { id: 'ch-007', displayName: 'Inspiration', description: 'Design inspiration and resources', createdDateTime: '2025-03-01T00:00:00Z', membershipType: 'standard', webUrl: null },
  ],
  'team-003': [
    { id: 'ch-008', displayName: 'General', description: 'Company-wide announcements', createdDateTime: '2025-01-01T00:00:00Z', membershipType: 'standard', webUrl: null },
    { id: 'ch-009', displayName: 'Random', description: 'Off-topic chat', createdDateTime: '2025-01-01T00:00:00Z', membershipType: 'standard', webUrl: null },
  ],
}

const mockChannelMessages: Record<string, ChannelMessage[]> = {
  'ch-001': [
    {
      id: 'cm-001', replyToId: null, etag: null, messageType: 'message',
      createdDateTime: '2026-02-21T08:00:00Z', lastModifiedDateTime: null, lastEditedDateTime: null, deletedDateTime: null,
      subject: null, summary: null, chatId: null, importance: 'normal',
      from: { user: { displayName: 'Martin Dvorak', id: 'user-003' } },
      body: { contentType: 'text', content: 'Sprint 14 starts today. Please update your tasks in the board.' },
      attachments: [], mentions: [], reactions: [],
      channelIdentity: { teamId: 'team-001', channelId: 'ch-001' },
    },
    {
      id: 'cm-002', replyToId: null, etag: null, messageType: 'message',
      createdDateTime: '2026-02-21T09:00:00Z', lastModifiedDateTime: null, lastEditedDateTime: null, deletedDateTime: null,
      subject: null, summary: null, chatId: null, importance: 'normal',
      from: { user: { displayName: 'Eva Kralova', id: 'user-004' } },
      body: { contentType: 'text', content: 'CI pipeline is green after the latest merge. Good to go.' },
      attachments: [], mentions: [], reactions: [
        { reactionType: 'like', createdDateTime: '2026-02-21T09:05:00Z', user: { user: { displayName: 'You', id: MOCK_ME_USER_ID } } },
      ],
      channelIdentity: { teamId: 'team-001', channelId: 'ch-001' },
    },
  ],
  'ch-002': [
    {
      id: 'cm-003', replyToId: null, etag: null, messageType: 'message',
      createdDateTime: '2026-02-20T14:00:00Z', lastModifiedDateTime: null, lastEditedDateTime: null, deletedDateTime: null,
      subject: null, summary: null, chatId: null, importance: 'normal',
      from: { user: { displayName: 'You', id: MOCK_ME_USER_ID } },
      body: { contentType: 'text', content: 'Has anyone tried the new Nuxt UI v3 command palette? It works great.' },
      attachments: [], mentions: [], reactions: [],
      channelIdentity: { teamId: 'team-001', channelId: 'ch-002' },
    },
  ],
}

export function useMockChannels(): UseChannelsReturn {
  const teams = ref<Team[]>([])
  const channels = ref<Map<string, Channel[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTeams() {
    loading.value = true
    error.value = null
    await new Promise(r => setTimeout(r, 200))
    teams.value = [...mockTeams]
    loading.value = false
  }

  async function fetchChannels(teamId: string) {
    const teamChannels = mockChannelsByTeam[teamId] ?? []
    channels.value.set(teamId, teamChannels)
    channels.value = new Map(channels.value)
  }

  async function fetchChannelMessages(teamId: string, channelId: string): Promise<ChannelMessage[]> {
    await new Promise(r => setTimeout(r, 150))
    return mockChannelMessages[channelId] ?? []
  }

  async function sendChannelMessage(teamId: string, channelId: string, content: string, contentType: 'text' | 'html' = 'text') {
    const newMsg: ChannelMessage = {
      id: `cm-new-${Date.now()}`,
      replyToId: null,
      etag: null,
      messageType: 'message',
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: null,
      lastEditedDateTime: null,
      deletedDateTime: null,
      subject: null,
      summary: null,
      chatId: null,
      importance: 'normal',
      from: { user: { displayName: 'You', id: MOCK_ME_USER_ID } },
      body: { contentType, content },
      attachments: [],
      mentions: [],
      reactions: [],
      channelIdentity: { teamId, channelId },
    }
    if (!mockChannelMessages[channelId]) {
      mockChannelMessages[channelId] = []
    }
    mockChannelMessages[channelId].push(newMsg)
  }

  return {
    teams,
    channels,
    loading,
    error,
    fetchTeams,
    fetchChannels,
    fetchChannelMessages,
    sendChannelMessage,
  }
}
