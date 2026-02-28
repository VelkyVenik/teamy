import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Mock composable globals ---

const mockRefreshChats = vi.fn().mockResolvedValue(undefined)
const mockChats = { value: [] as any[] }
const mockPeekChannelLatestMessage = vi.fn().mockResolvedValue(null)
const mockUpdateFromChats = vi.fn()
const mockUpdateChannelUnread = vi.fn()

Object.assign(globalThis, {
  useChats: () => ({ refreshChats: mockRefreshChats, chats: mockChats }),
  useChannels: () => ({ peekChannelLatestMessage: mockPeekChannelLatestMessage }),
  useUnreadStore: () => ({ updateFromChats: mockUpdateFromChats, updateChannelUnread: mockUpdateChannelUnread }),
  useCurrentUser: () => ({ currentUserId: { value: 'me-123' } }),
  useGraph: () => ({ graphFetch: vi.fn(), graphFetchAll: vi.fn(), graphFetchPage: vi.fn() }),
  useTauri: () => ({ isTauri: { value: false } }),
})

const { useUnreadPoller } = await import('~/composables/useUnreadPoller')

describe('useUnreadPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRefreshChats.mockClear()
    mockPeekChannelLatestMessage.mockClear()
    mockUpdateFromChats.mockClear()
    mockUpdateChannelUnread.mockClear()
    mockChats.value = []
  })

  afterEach(() => {
    // Ensure timers are stopped so they don't leak between tests
    const poller = useUnreadPoller()
    poller.stopPolling()
    poller.setWatchedChannels([])
    vi.useRealTimers()
  })

  describe('startPolling / stopPolling', () => {
    it('starts chat polling at 15s intervals', async () => {
      const poller = useUnreadPoller()
      poller.startPolling()

      expect(mockRefreshChats).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(15_000)
      expect(mockRefreshChats).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(15_000)
      expect(mockRefreshChats).toHaveBeenCalledTimes(2)
    })

    it('starts channel polling at 20s intervals', async () => {
      const poller = useUnreadPoller()
      poller.setWatchedChannels([{ teamId: 't1', channelId: 'c1' }])
      mockPeekChannelLatestMessage.mockResolvedValue({ createdDateTime: '2026-01-01T00:00:00Z', fromUserId: 'other' })

      poller.startPolling()

      expect(mockPeekChannelLatestMessage).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(20_000)
      expect(mockPeekChannelLatestMessage).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(20_000)
      expect(mockPeekChannelLatestMessage).toHaveBeenCalledTimes(2)
    })

    it('stops both timers when stopPolling is called', async () => {
      const poller = useUnreadPoller()
      poller.startPolling()

      await vi.advanceTimersByTimeAsync(15_000)
      expect(mockRefreshChats).toHaveBeenCalledTimes(1)

      poller.stopPolling()

      await vi.advanceTimersByTimeAsync(30_000)
      // Should not have been called again after stop
      expect(mockRefreshChats).toHaveBeenCalledTimes(1)
    })

    it('calling startPolling twice clears previous timers (no double polling)', async () => {
      const poller = useUnreadPoller()
      poller.startPolling()
      poller.startPolling()

      await vi.advanceTimersByTimeAsync(15_000)
      // Should only fire once, not twice
      expect(mockRefreshChats).toHaveBeenCalledTimes(1)
    })
  })

  describe('pollChats', () => {
    it('calls refreshChats then updateFromChats with current chats and userId', async () => {
      const poller = useUnreadPoller()
      const fakeChats = [{ id: 'chat-1' }]
      mockChats.value = fakeChats

      await poller.pollChats()

      expect(mockRefreshChats).toHaveBeenCalledTimes(1)
      expect(mockUpdateFromChats).toHaveBeenCalledWith(fakeChats, 'me-123')
    })

    it('does not throw when refreshChats rejects', async () => {
      const poller = useUnreadPoller()
      mockRefreshChats.mockRejectedValueOnce(new Error('network error'))

      // Should not throw
      await expect(poller.pollChats()).resolves.toBeUndefined()
    })
  })

  describe('pollChannels', () => {
    it('peeks each watched channel and calls updateChannelUnread', async () => {
      const poller = useUnreadPoller()
      poller.setWatchedChannels([
        { teamId: 't1', channelId: 'c1' },
        { teamId: 't2', channelId: 'c2' },
      ])

      mockPeekChannelLatestMessage
        .mockResolvedValueOnce({ createdDateTime: '2026-02-28T12:00:00Z', fromUserId: 'user-a' })
        .mockResolvedValueOnce({ createdDateTime: '2026-02-28T12:01:00Z', fromUserId: 'user-b' })

      // pollChannels has internal stagger setTimeout — advance fake timers concurrently
      const promise = poller.pollChannels()
      await vi.advanceTimersByTimeAsync(1000)
      await promise

      expect(mockPeekChannelLatestMessage).toHaveBeenCalledTimes(2)
      expect(mockPeekChannelLatestMessage).toHaveBeenCalledWith('t1', 'c1')
      expect(mockPeekChannelLatestMessage).toHaveBeenCalledWith('t2', 'c2')

      expect(mockUpdateChannelUnread).toHaveBeenCalledTimes(2)
      expect(mockUpdateChannelUnread).toHaveBeenCalledWith('t1', 'c1', '2026-02-28T12:00:00Z', 'user-a', 'me-123')
      expect(mockUpdateChannelUnread).toHaveBeenCalledWith('t2', 'c2', '2026-02-28T12:01:00Z', 'user-b', 'me-123')
    })

    it('skips updateChannelUnread when peek returns null', async () => {
      const poller = useUnreadPoller()
      poller.setWatchedChannels([{ teamId: 't1', channelId: 'c1' }])
      mockPeekChannelLatestMessage.mockResolvedValueOnce(null)

      // Single channel, no stagger needed but advance for safety
      const promise = poller.pollChannels()
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(mockPeekChannelLatestMessage).toHaveBeenCalledTimes(1)
      expect(mockUpdateChannelUnread).not.toHaveBeenCalled()
    })

    it('caps at MAX_WATCHED_CHANNELS (15)', async () => {
      const poller = useUnreadPoller()
      const channels = Array.from({ length: 20 }, (_, i) => ({
        teamId: `t${i}`,
        channelId: `c${i}`,
      }))
      poller.setWatchedChannels(channels)
      mockPeekChannelLatestMessage.mockResolvedValue(null)

      const promise = poller.pollChannels()
      // 15 channels × 500ms stagger
      await vi.advanceTimersByTimeAsync(15 * 500)
      await promise

      // Only first 15 should be polled
      expect(mockPeekChannelLatestMessage).toHaveBeenCalledTimes(15)
    })

    it('continues polling remaining channels when one fails', async () => {
      const poller = useUnreadPoller()
      poller.setWatchedChannels([
        { teamId: 't1', channelId: 'c1' },
        { teamId: 't2', channelId: 'c2' },
      ])

      mockPeekChannelLatestMessage
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ createdDateTime: '2026-02-28T12:00:00Z', fromUserId: 'user-b' })

      const promise = poller.pollChannels()
      await vi.advanceTimersByTimeAsync(1000)
      await promise

      // Both channels should be attempted
      expect(mockPeekChannelLatestMessage).toHaveBeenCalledTimes(2)
      // Only second channel should update unread
      expect(mockUpdateChannelUnread).toHaveBeenCalledTimes(1)
      expect(mockUpdateChannelUnread).toHaveBeenCalledWith('t2', 'c2', '2026-02-28T12:00:00Z', 'user-b', 'me-123')
    })

    it('does nothing when watchedChannels is empty', async () => {
      const poller = useUnreadPoller()
      poller.setWatchedChannels([])

      await poller.pollChannels()

      expect(mockPeekChannelLatestMessage).not.toHaveBeenCalled()
      expect(mockUpdateChannelUnread).not.toHaveBeenCalled()
    })
  })

  describe('setWatchedChannels', () => {
    it('updates the shared watchedChannels ref', () => {
      const poller = useUnreadPoller()
      const channels = [{ teamId: 't1', channelId: 'c1' }]

      poller.setWatchedChannels(channels)

      expect(poller.watchedChannels.value).toEqual(channels)
    })

    it('watchedChannels is shared across calls', () => {
      const poller1 = useUnreadPoller()
      const poller2 = useUnreadPoller()

      poller1.setWatchedChannels([{ teamId: 't1', channelId: 'c1' }])

      // Module-level ref should be shared
      expect(poller2.watchedChannels.value).toEqual([{ teamId: 't1', channelId: 'c1' }])
    })
  })
})
