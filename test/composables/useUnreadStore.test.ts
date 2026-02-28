import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Chat } from '~~/types/graph'
import type { SectionItem } from '~~/types/sections'

// --- Provide auto-imported composables as globals ---

const mockGraphFetch = vi.fn().mockResolvedValue(undefined)

Object.assign(globalThis, {
  useGraph: () => ({ graphFetch: mockGraphFetch, graphFetchAll: vi.fn(), graphFetchPage: vi.fn() }),
  useCurrentUser: () => ({ currentUserId: { value: 'me-123' } }),
  useTauri: () => ({ isTauri: { value: false } }),
})

// Import after globals are set
const { useUnreadStore, _resetUnreadStoreForTesting } = await import('~/composables/useUnreadStore')

// Helper to build a minimal Chat object
function makeChat(overrides: {
  id: string
  previewId?: string
  previewTime?: string
  previewFromUserId?: string | null
  lastReadTime?: string | null
}): Chat {
  return {
    id: overrides.id,
    topic: null,
    createdDateTime: '2026-01-01T00:00:00Z',
    lastUpdatedDateTime: null,
    chatType: 'oneOnOne',
    webUrl: null,
    tenantId: null,
    lastMessagePreview: overrides.previewId
      ? {
          id: overrides.previewId,
          createdDateTime: overrides.previewTime ?? '2026-02-28T12:00:00Z',
          isDeleted: false,
          body: { contentType: 'text', content: 'hello' },
          from: overrides.previewFromUserId !== undefined
            ? { user: { displayName: 'User', id: overrides.previewFromUserId } }
            : null,
        }
      : undefined,
    viewpoint: overrides.lastReadTime !== undefined
      ? { lastMessageReadDateTime: overrides.lastReadTime }
      : undefined,
  } as Chat
}

// Reset module-level state between tests
function resetStore() {
  _resetUnreadStoreForTesting()
  try { localStorage.removeItem('teamy-unread-state') } catch {}
}

describe('useUnreadStore', () => {
  beforeEach(() => {
    resetStore()
    mockGraphFetch.mockClear()
  })

  describe('updateFromChats', () => {
    it('marks a chat as unread when last message is newer than last read', () => {
      const store = useUnreadStore()
      const chats = [
        makeChat({
          id: 'chat-1',
          previewId: 'msg-1',
          previewTime: '2026-02-28T12:00:00Z',
          previewFromUserId: 'other-user',
          lastReadTime: '2026-02-28T11:00:00Z',
        }),
      ]

      store.updateFromChats(chats, 'me-123')

      expect(store.isUnread('chat', 'chat-1')).toBe(true)
      expect(store.getUnreadCount('chat', 'chat-1')).toBe(1)
    })

    it('marks a chat as read when last message is older than last read', () => {
      const store = useUnreadStore()
      const chats = [
        makeChat({
          id: 'chat-2',
          previewId: 'msg-2',
          previewTime: '2026-02-28T10:00:00Z',
          previewFromUserId: 'other-user',
          lastReadTime: '2026-02-28T11:00:00Z',
        }),
      ]

      store.updateFromChats(chats, 'me-123')

      expect(store.isUnread('chat', 'chat-2')).toBe(false)
      expect(store.getUnreadCount('chat', 'chat-2')).toBe(0)
    })

    it('does NOT mark as unread when message is from self', () => {
      const store = useUnreadStore()
      const chats = [
        makeChat({
          id: 'chat-3',
          previewId: 'msg-3',
          previewTime: '2026-02-28T12:00:00Z',
          previewFromUserId: 'me-123',
          lastReadTime: '2026-02-28T11:00:00Z',
        }),
      ]

      store.updateFromChats(chats, 'me-123')

      expect(store.isUnread('chat', 'chat-3')).toBe(false)
      expect(store.getUnreadCount('chat', 'chat-3')).toBe(0)
    })

    it('increments count when preview ID changes between polls', () => {
      const store = useUnreadStore()

      // First poll
      store.updateFromChats([
        makeChat({ id: 'chat-4', previewId: 'msg-A', previewTime: '2026-02-28T12:00:00Z', previewFromUserId: 'other' }),
      ], 'me-123')
      expect(store.getUnreadCount('chat', 'chat-4')).toBe(1)

      // Same preview ID — no increment
      store.updateFromChats([
        makeChat({ id: 'chat-4', previewId: 'msg-A', previewTime: '2026-02-28T12:00:00Z', previewFromUserId: 'other' }),
      ], 'me-123')
      expect(store.getUnreadCount('chat', 'chat-4')).toBe(1)

      // Different preview ID — increment
      store.updateFromChats([
        makeChat({ id: 'chat-4', previewId: 'msg-B', previewTime: '2026-02-28T12:01:00Z', previewFromUserId: 'other' }),
      ], 'me-123')
      expect(store.getUnreadCount('chat', 'chat-4')).toBe(2)
    })

    it('skips chats without lastMessagePreview', () => {
      const store = useUnreadStore()

      store.updateFromChats([makeChat({ id: 'chat-empty' })], 'me-123')

      expect(store.isUnread('chat', 'chat-empty')).toBe(false)
    })

    it('seeds server read timestamp when not already set', () => {
      const store = useUnreadStore()
      const chats = [
        makeChat({
          id: 'chat-seed',
          previewId: 'msg-seed',
          previewTime: '2026-02-28T10:00:00Z',
          previewFromUserId: 'other',
          lastReadTime: '2026-02-28T11:00:00Z',
        }),
      ]

      store.updateFromChats(chats, 'me-123')

      expect(store.getLastRead('chat', 'chat-seed')).toBe('2026-02-28T11:00:00Z')
    })
  })

  describe('updateChannelUnread', () => {
    it('marks a channel as unread when new message from another user', () => {
      const store = useUnreadStore()

      store.updateChannelUnread('team-1', 'ch-1', '2026-02-28T12:00:00Z', 'other-user', 'me-123')

      expect(store.isUnread('channel', 'ch-1', 'team-1')).toBe(true)
      expect(store.getUnreadCount('channel', 'ch-1', 'team-1')).toBe(1)
    })

    it('does NOT mark as unread when message is from self', () => {
      const store = useUnreadStore()

      store.updateChannelUnread('team-1', 'ch-2', '2026-02-28T12:00:00Z', 'me-123', 'me-123')

      expect(store.isUnread('channel', 'ch-2', 'team-1')).toBe(false)
    })

    it('increments count when message time changes', () => {
      const store = useUnreadStore()

      store.updateChannelUnread('team-1', 'ch-3', '2026-02-28T12:00:00Z', 'other', 'me-123')
      expect(store.getUnreadCount('channel', 'ch-3', 'team-1')).toBe(1)

      // Same time — no increment
      store.updateChannelUnread('team-1', 'ch-3', '2026-02-28T12:00:00Z', 'other', 'me-123')
      expect(store.getUnreadCount('channel', 'ch-3', 'team-1')).toBe(1)

      // New time — increment
      store.updateChannelUnread('team-1', 'ch-3', '2026-02-28T12:01:00Z', 'other', 'me-123')
      expect(store.getUnreadCount('channel', 'ch-3', 'team-1')).toBe(2)
    })

    it('does not mark unread when message is older than last read', () => {
      const store = useUnreadStore()

      store.markChannelRead('team-1', 'ch-4')

      store.updateChannelUnread('team-1', 'ch-4', '2020-01-01T00:00:00Z', 'other', 'me-123')

      expect(store.isUnread('channel', 'ch-4', 'team-1')).toBe(false)
    })
  })

  describe('touchReadTimestamp', () => {
    it('clears unread count for a chat', () => {
      const store = useUnreadStore()

      store.updateFromChats([
        makeChat({ id: 'chat-touch', previewId: 'msg-t', previewTime: '2026-02-28T12:00:00Z', previewFromUserId: 'other' }),
      ], 'me-123')
      expect(store.isUnread('chat', 'chat-touch')).toBe(true)

      store.touchReadTimestamp('chat', 'chat-touch')

      expect(store.isUnread('chat', 'chat-touch')).toBe(false)
      expect(store.getUnreadCount('chat', 'chat-touch')).toBe(0)
    })

    it('clears unread count for a channel', () => {
      const store = useUnreadStore()

      store.updateChannelUnread('team-1', 'ch-touch', '2026-02-28T12:00:00Z', 'other', 'me-123')
      expect(store.isUnread('channel', 'ch-touch', 'team-1')).toBe(true)

      store.touchReadTimestamp('channel', 'ch-touch', 'team-1')

      expect(store.isUnread('channel', 'ch-touch', 'team-1')).toBe(false)
    })

    it('uses message timestamp when it is in the future', () => {
      const store = useUnreadStore()
      const futureTime = '2099-12-31T23:59:59Z'

      store.touchReadTimestamp('chat', 'chat-future', undefined, futureTime)

      expect(store.getLastRead('chat', 'chat-future')).toBe(futureTime)
    })
  })

  describe('markChatRead', () => {
    it('clears unread and calls Graph API', async () => {
      const store = useUnreadStore()

      store.updateFromChats([
        makeChat({ id: 'chat-mark', previewId: 'msg-m', previewTime: '2026-02-28T12:00:00Z', previewFromUserId: 'other' }),
      ], 'me-123')
      expect(store.isUnread('chat', 'chat-mark')).toBe(true)

      await store.markChatRead('chat-mark')

      expect(store.isUnread('chat', 'chat-mark')).toBe(false)
      expect(mockGraphFetch).toHaveBeenCalledWith(
        '/chats/chat-mark/markChatReadForUser',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('markChannelRead', () => {
    it('clears channel unread count', () => {
      const store = useUnreadStore()

      store.updateChannelUnread('team-1', 'ch-mark', '2026-02-28T12:00:00Z', 'other', 'me-123')
      expect(store.isUnread('channel', 'ch-mark', 'team-1')).toBe(true)

      store.markChannelRead('team-1', 'ch-mark')

      expect(store.isUnread('channel', 'ch-mark', 'team-1')).toBe(false)
      expect(store.getLastRead('channel', 'ch-mark', 'team-1')).toBeTruthy()
    })
  })

  describe('setExactCount', () => {
    it('overrides the unread count for a chat', () => {
      const store = useUnreadStore()

      store.setExactCount('chat', 'chat-exact', 7)

      expect(store.getUnreadCount('chat', 'chat-exact')).toBe(7)
      expect(store.isUnread('chat', 'chat-exact')).toBe(true)
    })

    it('overrides the unread count for a channel', () => {
      const store = useUnreadStore()

      store.setExactCount('channel', 'ch-exact', 3, 'team-1')

      expect(store.getUnreadCount('channel', 'ch-exact', 'team-1')).toBe(3)
    })
  })

  describe('totalUnread', () => {
    it('counts items with unread > 0', () => {
      const store = useUnreadStore()

      store.updateFromChats([
        makeChat({ id: 'c1', previewId: 'm1', previewTime: '2026-02-28T12:00:00Z', previewFromUserId: 'other' }),
        makeChat({ id: 'c2', previewId: 'm2', previewTime: '2026-02-28T12:00:00Z', previewFromUserId: 'other' }),
        makeChat({ id: 'c3', previewId: 'm3', previewTime: '2026-02-28T10:00:00Z', previewFromUserId: 'other', lastReadTime: '2026-02-28T11:00:00Z' }),
      ], 'me-123')

      expect(store.totalUnread.value).toBe(2)
    })
  })

  describe('getSectionUnreadItemCount', () => {
    it('counts section items with unread messages', () => {
      const store = useUnreadStore()

      store.setExactCount('chat', 'chat-a', 3)
      store.setExactCount('channel', 'ch-b', 1, 'team-1')
      store.setExactCount('chat', 'chat-c', 0)

      const items: SectionItem[] = [
        { type: 'chat', id: 'chat-a' },
        { type: 'channel', id: 'ch-b', teamId: 'team-1' },
        { type: 'chat', id: 'chat-c' },
      ]

      expect(store.getSectionUnreadItemCount(items)).toBe(2)
    })

    it('returns 0 when no items are unread', () => {
      const store = useUnreadStore()

      const items: SectionItem[] = [
        { type: 'chat', id: 'chat-none-1' },
        { type: 'chat', id: 'chat-none-2' },
      ]

      expect(store.getSectionUnreadItemCount(items)).toBe(0)
    })
  })

  describe('getSnapshotLastRead', () => {
    it('returns local timestamp when no server timestamp', () => {
      const store = useUnreadStore()

      store.touchReadTimestamp('chat', 'chat-snap')

      expect(store.getSnapshotLastRead('chat-snap')).toBeTruthy()
    })

    it('returns max of local and server timestamp', () => {
      const store = useUnreadStore()

      // Set local read at 10:00 by using a message timestamp in the far future
      // touchReadTimestamp uses max(now, messageTimestamp), so pass the exact time we want
      store.touchReadTimestamp('chat', 'chat-snap2', undefined, '2026-02-28T10:00:00Z')

      // Server timestamp is much later than both local and now — should win
      expect(store.getSnapshotLastRead('chat-snap2', '2099-12-31T23:59:59Z')).toBe('2099-12-31T23:59:59Z')
    })

    it('returns server timestamp when no local', () => {
      const store = useUnreadStore()

      expect(store.getSnapshotLastRead('chat-no-local', '2026-02-28T11:00:00Z')).toBe('2026-02-28T11:00:00Z')
    })

    it('returns null when neither exists', () => {
      const store = useUnreadStore()

      expect(store.getSnapshotLastRead('chat-nothing')).toBeNull()
    })
  })

  describe('persistence (localStorage)', () => {
    it('persists read state to localStorage on flush', async () => {
      const store = useUnreadStore()

      store.touchReadTimestamp('chat', 'chat-persist')
      store.flush()

      await new Promise(r => setTimeout(r, 10))

      const raw = localStorage.getItem('teamy-unread-state')
      expect(raw).toBeTruthy()

      const data = JSON.parse(raw!)
      expect(data.version).toBe(1)
      expect(data.readTimestamps['chat-persist']).toBeTruthy()
      expect(data.readTimestamps['chat-persist'].source).toBe('local')
    })

    it('loads persisted state from localStorage', async () => {
      const data = {
        version: 1,
        readTimestamps: {
          'chat-loaded': { timestamp: '2026-02-28T10:00:00Z', source: 'local' },
        },
        lastKnownPreviewIds: {},
        channelLastMessageTimes: {},
      }
      localStorage.setItem('teamy-unread-state', JSON.stringify(data))

      const store = useUnreadStore()
      store.loaded.value = false
      await store.load()

      expect(store.getLastRead('chat', 'chat-loaded')).toBe('2026-02-28T10:00:00Z')
    })
  })
})
