import type { Chat, UseChatsReturn } from '~~/types/graph'

const MOCK_ME_ID = 'me-user-id-001'

const mockChats: Chat[] = [
  {
    id: 'chat-001',
    topic: null,
    createdDateTime: '2026-02-20T08:00:00Z',
    lastUpdatedDateTime: '2026-02-21T09:15:00Z',
    chatType: 'oneOnOne',
    webUrl: null,
    tenantId: 'tenant-001',
    members: [
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm1', displayName: 'You', userId: MOCK_ME_ID, email: 'you@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm2', displayName: 'Jana Novakova', userId: 'user-002', email: 'jana@contoso.com', roles: ['owner'] },
    ],
    lastMessagePreview: {
      id: 'msg-preview-001',
      createdDateTime: '2026-02-21T09:15:00Z',
      isDeleted: false,
      body: { contentType: 'text', content: 'Sure, I will send the report by noon.' },
      from: { user: { displayName: 'Jana Novakova', id: 'user-002' } },
    },
  },
  {
    id: 'chat-002',
    topic: null,
    createdDateTime: '2026-02-19T14:00:00Z',
    lastUpdatedDateTime: '2026-02-21T08:42:00Z',
    chatType: 'oneOnOne',
    webUrl: null,
    tenantId: 'tenant-001',
    members: [
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm3', displayName: 'You', userId: MOCK_ME_ID, email: 'you@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm4', displayName: 'Martin Dvorak', userId: 'user-003', email: 'martin@contoso.com', roles: ['owner'] },
    ],
    lastMessagePreview: {
      id: 'msg-preview-002',
      createdDateTime: '2026-02-21T08:42:00Z',
      isDeleted: false,
      body: { contentType: 'text', content: 'Can we reschedule the standup to 10am?' },
      from: { user: { displayName: 'Martin Dvorak', id: 'user-003' } },
    },
  },
  {
    id: 'chat-003',
    topic: 'Project Phoenix',
    createdDateTime: '2026-02-15T10:00:00Z',
    lastUpdatedDateTime: '2026-02-21T07:30:00Z',
    chatType: 'group',
    webUrl: null,
    tenantId: 'tenant-001',
    members: [
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm5', displayName: 'You', userId: MOCK_ME_ID, email: 'you@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm6', displayName: 'Jana Novakova', userId: 'user-002', email: 'jana@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm7', displayName: 'Martin Dvorak', userId: 'user-003', email: 'martin@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm8', displayName: 'Eva Kralova', userId: 'user-004', email: 'eva@contoso.com', roles: ['owner'] },
    ],
    lastMessagePreview: {
      id: 'msg-preview-003',
      createdDateTime: '2026-02-21T07:30:00Z',
      isDeleted: false,
      body: { contentType: 'text', content: 'I pushed the latest changes to the feature branch.' },
      from: { user: { displayName: 'Eva Kralova', id: 'user-004' } },
    },
  },
  {
    id: 'chat-004',
    topic: null,
    createdDateTime: '2026-02-18T16:00:00Z',
    lastUpdatedDateTime: '2026-02-20T18:22:00Z',
    chatType: 'oneOnOne',
    webUrl: null,
    tenantId: 'tenant-001',
    members: [
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm9', displayName: 'You', userId: MOCK_ME_ID, email: 'you@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm10', displayName: 'Petr Svoboda', userId: 'user-005', email: 'petr@contoso.com', roles: ['owner'] },
    ],
    lastMessagePreview: {
      id: 'msg-preview-004',
      createdDateTime: '2026-02-20T18:22:00Z',
      isDeleted: false,
      body: { contentType: 'text', content: 'The deployment went smoothly. All green.' },
      from: { user: { displayName: 'Petr Svoboda', id: 'user-005' } },
    },
  },
  {
    id: 'chat-005',
    topic: 'Design Review',
    createdDateTime: '2026-02-10T09:00:00Z',
    lastUpdatedDateTime: '2026-02-20T15:10:00Z',
    chatType: 'group',
    webUrl: null,
    tenantId: 'tenant-001',
    members: [
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm11', displayName: 'You', userId: MOCK_ME_ID, email: 'you@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm12', displayName: 'Lucie Horakova', userId: 'user-006', email: 'lucie@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm13', displayName: 'Tomas Jelinek', userId: 'user-007', email: 'tomas@contoso.com', roles: ['owner'] },
    ],
    lastMessagePreview: {
      id: 'msg-preview-005',
      createdDateTime: '2026-02-20T15:10:00Z',
      isDeleted: false,
      body: { contentType: 'text', content: 'Updated the Figma file with the new color palette.' },
      from: { user: { displayName: 'Lucie Horakova', id: 'user-006' } },
    },
  },
  {
    id: 'chat-006',
    topic: null,
    createdDateTime: '2026-02-12T11:00:00Z',
    lastUpdatedDateTime: '2026-02-19T14:05:00Z',
    chatType: 'oneOnOne',
    webUrl: null,
    tenantId: 'tenant-001',
    members: [
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm14', displayName: 'You', userId: MOCK_ME_ID, email: 'you@contoso.com', roles: ['owner'] },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm15', displayName: 'Katerina Machova', userId: 'user-008', email: 'katerina@contoso.com', roles: ['owner'] },
    ],
    lastMessagePreview: {
      id: 'msg-preview-006',
      createdDateTime: '2026-02-19T14:05:00Z',
      isDeleted: false,
      body: { contentType: 'text', content: 'Thanks for the review! I will apply the feedback.' },
      from: { user: { displayName: 'Katerina Machova', id: 'user-008' } },
    },
  },
]

// Simulated unread counts per chat
const mockUnreadCounts = new Map<string, number>([
  ['chat-001', 2],
  ['chat-002', 1],
  ['chat-003', 5],
  ['chat-004', 0],
  ['chat-005', 0],
  ['chat-006', 3],
])

export const MOCK_ME_USER_ID = MOCK_ME_ID

export function useMockChats(): UseChatsReturn & {
  getUnreadCount: (chatId: string) => number
  getChatDisplayName: (chat: Chat) => string
  getChatAvatar: (chat: Chat) => string | undefined
} {
  const chats = ref<Chat[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchChats() {
    loading.value = true
    error.value = null
    await new Promise(r => setTimeout(r, 300))
    chats.value = [...mockChats]
    loading.value = false
  }

  async function refreshChats() {
    chats.value = [...mockChats]
  }

  function getUnreadCount(chatId: string): number {
    return mockUnreadCounts.get(chatId) ?? 0
  }

  function getChatDisplayName(chat: Chat): string {
    if (chat.topic) return chat.topic
    const other = chat.members?.find((m: { userId: string }) => m.userId !== MOCK_ME_ID)
    return other?.displayName ?? 'Unknown'
  }

  function getChatAvatar(chat: Chat): string | undefined {
    if (chat.chatType === 'group') return undefined
    const other = chat.members?.find((m: { userId: string }) => m.userId !== MOCK_ME_ID)
    if (!other) return undefined
    return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(other.displayName)}`
  }

  return {
    chats,
    loading,
    error,
    fetchChats,
    refreshChats,
    getUnreadCount,
    getChatDisplayName,
    getChatAvatar,
  }
}
