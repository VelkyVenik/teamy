import type { ChatMessage, UseMessagesReturn } from '~~/types/graph'
import { MOCK_ME_USER_ID } from './useMockChats'

function makeMessage(id: string, chatId: string, fromId: string, fromName: string, content: string, time: string, reactions: ChatMessage['reactions'] = []): ChatMessage {
  return {
    id,
    replyToId: null,
    etag: null,
    messageType: 'message',
    createdDateTime: time,
    lastModifiedDateTime: null,
    lastEditedDateTime: null,
    deletedDateTime: null,
    subject: null,
    summary: null,
    chatId,
    importance: 'normal',
    from: { user: { displayName: fromName, id: fromId } },
    body: { contentType: 'text', content },
    attachments: [],
    mentions: [],
    reactions,
  }
}

const mockMessagesByChat: Record<string, ChatMessage[]> = {
  'chat-001': [
    makeMessage('m001-1', 'chat-001', MOCK_ME_USER_ID, 'You', 'Hi Jana, do you have the Q4 report ready?', '2026-02-21T08:30:00Z'),
    makeMessage('m001-2', 'chat-001', 'user-002', 'Jana Novakova', 'Almost! Just finishing the summary section.', '2026-02-21T08:45:00Z'),
    makeMessage('m001-3', 'chat-001', MOCK_ME_USER_ID, 'You', 'Great, no rush. Can you send it before the standup?', '2026-02-21T09:00:00Z'),
    makeMessage('m001-4', 'chat-001', 'user-002', 'Jana Novakova', 'Sure, I will send the report by noon.', '2026-02-21T09:15:00Z', [
      { reactionType: 'like', createdDateTime: '2026-02-21T09:16:00Z', user: { user: { displayName: 'You', id: MOCK_ME_USER_ID } } },
    ]),
  ],
  'chat-002': [
    makeMessage('m002-1', 'chat-002', 'user-003', 'Martin Dvorak', 'Hey, quick question about the sprint planning.', '2026-02-21T08:00:00Z'),
    makeMessage('m002-2', 'chat-002', MOCK_ME_USER_ID, 'You', 'Sure, what is it?', '2026-02-21T08:10:00Z'),
    makeMessage('m002-3', 'chat-002', 'user-003', 'Martin Dvorak', 'Can we reschedule the standup to 10am?', '2026-02-21T08:42:00Z'),
  ],
  'chat-003': [
    makeMessage('m003-1', 'chat-003', 'user-002', 'Jana Novakova', 'The new API endpoint is ready for testing.', '2026-02-21T06:00:00Z'),
    makeMessage('m003-2', 'chat-003', 'user-003', 'Martin Dvorak', 'Nice! I will start writing integration tests.', '2026-02-21T06:15:00Z'),
    makeMessage('m003-3', 'chat-003', MOCK_ME_USER_ID, 'You', 'Make sure we cover the edge cases from last sprint.', '2026-02-21T06:30:00Z'),
    makeMessage('m003-4', 'chat-003', 'user-004', 'Eva Kralova', 'Already added them to the test plan.', '2026-02-21T07:00:00Z'),
    makeMessage('m003-5', 'chat-003', 'user-004', 'Eva Kralova', 'I pushed the latest changes to the feature branch.', '2026-02-21T07:30:00Z'),
  ],
  'chat-004': [
    makeMessage('m004-1', 'chat-004', MOCK_ME_USER_ID, 'You', 'How did the deployment go?', '2026-02-20T17:00:00Z'),
    makeMessage('m004-2', 'chat-004', 'user-005', 'Petr Svoboda', 'All services are up. Running smoke tests now.', '2026-02-20T17:30:00Z'),
    makeMessage('m004-3', 'chat-004', 'user-005', 'Petr Svoboda', 'The deployment went smoothly. All green.', '2026-02-20T18:22:00Z'),
  ],
  'chat-005': [
    makeMessage('m005-1', 'chat-005', 'user-006', 'Lucie Horakova', 'I have the new mockups ready for review.', '2026-02-20T14:00:00Z'),
    makeMessage('m005-2', 'chat-005', 'user-007', 'Tomas Jelinek', 'Looking good! I like the new navigation pattern.', '2026-02-20T14:30:00Z'),
    makeMessage('m005-3', 'chat-005', MOCK_ME_USER_ID, 'You', 'Can we use the system font stack instead of Inter?', '2026-02-20T14:45:00Z'),
    makeMessage('m005-4', 'chat-005', 'user-006', 'Lucie Horakova', 'Updated the Figma file with the new color palette.', '2026-02-20T15:10:00Z'),
  ],
  'chat-006': [
    makeMessage('m006-1', 'chat-006', MOCK_ME_USER_ID, 'You', 'Katerina, your PR looks good overall. Just a few comments.', '2026-02-19T13:00:00Z'),
    makeMessage('m006-2', 'chat-006', 'user-008', 'Katerina Machova', 'Thanks for the review! I will apply the feedback.', '2026-02-19T14:05:00Z'),
  ],
}

export function useMockMessages(chatId: Ref<string | null>): UseMessagesReturn {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(false)

  async function fetchMessages() {
    if (!chatId.value) return
    loading.value = true
    error.value = null
    await new Promise(r => setTimeout(r, 200))
    messages.value = [...(mockMessagesByChat[chatId.value] ?? [])]
    hasMore.value = false
    loading.value = false
  }

  async function loadMore() {
    // No pagination in mock data
  }

  async function sendMessage(content: string, _contentType?: 'text' | 'html') {
    if (!chatId.value) return
    const newMsg = makeMessage(
      `msg-new-${Date.now()}`,
      chatId.value,
      MOCK_ME_USER_ID,
      'You',
      content,
      new Date().toISOString(),
    )
    messages.value = [...messages.value, newMsg]

    // Also update the mock store for the chat
    if (chatId.value && mockMessagesByChat[chatId.value]) {
      mockMessagesByChat[chatId.value].push(newMsg)
    }
  }

  function startPolling() {
    // No-op in mock mode
  }

  function stopPolling() {
    // No-op in mock mode
  }

  watch(chatId, (newId) => {
    if (newId) {
      fetchMessages()
    }
    else {
      messages.value = []
    }
  })

  return {
    messages,
    loading,
    loadingMore,
    error,
    hasMore,
    fetchMessages,
    loadMore,
    sendMessage,
    startPolling,
    stopPolling,
  }
}
