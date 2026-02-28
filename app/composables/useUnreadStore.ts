import type { Chat } from '~/types/graph'
import type { SectionItem } from '~~/types/sections'
import type { ReadTimestamp, UnreadStoreData } from '~~/types/unread'

const STORE_KEY = 'readState'
const LS_KEY = 'teamy-unread-state'

// --- Key helpers ---

function itemKey(type: 'chat' | 'channel', id: string, teamId?: string): string {
  return type === 'channel' ? `${teamId}:${id}` : id
}

function sectionItemKey(item: SectionItem): string {
  return item.type === 'channel' ? `${item.teamId}:${item.id}` : item.id
}

// --- Module-level shared state ---

const readTimestamps = reactive<Record<string, ReadTimestamp>>({})
const unreadCounts = reactive<Record<string, number>>({})
const lastKnownPreviewIds = reactive<Record<string, string>>({})
const channelLastMessageTimes = reactive<Record<string, string>>({})
const loaded = ref(false)

const totalUnread = computed(() => {
  let count = 0
  for (const c of Object.values(unreadCounts)) {
    if (c > 0) count++
  }
  return count
})

// --- Persistence ---

let storeInstance: any = null
let persistTimer: ReturnType<typeof setTimeout> | undefined

async function getStore() {
  if (storeInstance) return storeInstance
  const { LazyStore } = await import('@tauri-apps/plugin-store')
  storeInstance = new LazyStore('unread-state.json')
  return storeInstance
}

function buildStoreData(): UnreadStoreData {
  return {
    version: 1,
    readTimestamps: { ...readTimestamps },
    lastKnownPreviewIds: { ...lastKnownPreviewIds },
    channelLastMessageTimes: { ...channelLastMessageTimes },
  }
}

function readLocalStorage(): UnreadStoreData | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UnreadStoreData
  }
  catch {
    return null
  }
}

function writeLocalStorage() {
  localStorage.setItem(LS_KEY, JSON.stringify(buildStoreData()))
}

function applyStoreData(data: UnreadStoreData) {
  if (data.readTimestamps) {
    for (const [key, val] of Object.entries(data.readTimestamps)) {
      // Only apply if no existing local timestamp or persisted is newer
      const existing = readTimestamps[key]
      if (!existing || val.timestamp > existing.timestamp) {
        readTimestamps[key] = val
      }
    }
  }
  if (data.lastKnownPreviewIds) {
    Object.assign(lastKnownPreviewIds, data.lastKnownPreviewIds)
  }
  if (data.channelLastMessageTimes) {
    Object.assign(channelLastMessageTimes, data.channelLastMessageTimes)
  }
}

// --- Core functions ---

function getEffectiveLastRead(key: string, serverTimestamp?: string | null): string | null {
  const local = readTimestamps[key]?.timestamp
  if (local && serverTimestamp) return local > serverTimestamp ? local : serverTimestamp
  return local ?? serverTimestamp ?? null
}

function isUnread(type: 'chat' | 'channel', id: string, teamId?: string): boolean {
  return (unreadCounts[itemKey(type, id, teamId)] ?? 0) > 0
}

function getUnreadCount(type: 'chat' | 'channel', id: string, teamId?: string): number {
  return unreadCounts[itemKey(type, id, teamId)] ?? 0
}

function getLastRead(type: 'chat' | 'channel', id: string, teamId?: string): string | null {
  const key = itemKey(type, id, teamId)
  return readTimestamps[key]?.timestamp ?? null
}

/** Best-known last-read timestamp for divider snapshots (max of local + server). */
function getSnapshotLastRead(key: string, serverTimestamp?: string | null): string | null {
  return getEffectiveLastRead(key, serverTimestamp)
}

function updateFromChats(chats: Chat[], currentUserId: string) {
  for (const chat of chats) {
    const key = chat.id
    const lastMsg = chat.lastMessagePreview
    if (!lastMsg) continue

    const lastRead = getEffectiveLastRead(key, chat.viewpoint?.lastMessageReadDateTime)
    const isFromSelf = lastMsg.from?.user?.id === currentUserId
    const isNewMessage = lastMsg.createdDateTime > (lastRead ?? '')

    if (isNewMessage && !isFromSelf) {
      // Chat is unread — track incremental count via preview ID changes
      const prevPreviewId = lastKnownPreviewIds[key]
      if (prevPreviewId !== lastMsg.id) {
        unreadCounts[key] = (unreadCounts[key] ?? 0) + 1
        lastKnownPreviewIds[key] = lastMsg.id
      }
      // Ensure at least count 1 if somehow 0
      if (!unreadCounts[key]) unreadCounts[key] = 1
    }
    else {
      // Chat is read
      unreadCounts[key] = 0
    }

    // Seed server read timestamp if we don't have a local one
    if (chat.viewpoint?.lastMessageReadDateTime && !readTimestamps[key]) {
      readTimestamps[key] = {
        timestamp: chat.viewpoint.lastMessageReadDateTime,
        source: 'server',
      }
    }
  }
}

function updateChannelUnread(
  teamId: string,
  channelId: string,
  latestMsgTime: string,
  fromUserId: string | null,
  currentUserId: string,
) {
  const key = itemKey('channel', channelId, teamId)
  const lastRead = readTimestamps[key]?.timestamp
  const isFromSelf = fromUserId === currentUserId
  const isNewMessage = latestMsgTime > (lastRead ?? '')

  if (isNewMessage && !isFromSelf) {
    // Channel has unread — check if message time changed
    const prevTime = channelLastMessageTimes[key]
    if (prevTime !== latestMsgTime) {
      unreadCounts[key] = (unreadCounts[key] ?? 0) + 1
      channelLastMessageTimes[key] = latestMsgTime
    }
    if (!unreadCounts[key]) unreadCounts[key] = 1
  }
  else if (!isNewMessage) {
    unreadCounts[key] = 0
  }
}

function touchReadTimestamp(type: 'chat' | 'channel', id: string, teamId?: string, messageTimestamp?: string) {
  const key = itemKey(type, id, teamId)
  const now = new Date().toISOString()
  readTimestamps[key] = {
    timestamp: messageTimestamp && messageTimestamp > now ? messageTimestamp : now,
    source: 'local',
  }
  unreadCounts[key] = 0
  schedulePersist()
}

function setExactCount(type: 'chat' | 'channel', id: string, count: number, teamId?: string) {
  unreadCounts[itemKey(type, id, teamId)] = count
}

function getSectionUnreadItemCount(items: SectionItem[]): number {
  let count = 0
  for (const item of items) {
    const key = sectionItemKey(item)
    if ((unreadCounts[key] ?? 0) > 0) count++
  }
  return count
}

// --- Persistence (module-level, mirrors useSections pattern) ---

function isTauriEnv(): boolean {
  if (import.meta.server) return false
  return !!(window as Record<string, unknown>).__TAURI_INTERNALS__
}

async function persist() {
  if (isTauriEnv()) {
    try {
      const store = await getStore()
      await store.set(STORE_KEY, buildStoreData())
      await store.save()
    }
    catch (err) {
      console.warn('[useUnreadStore] Failed to persist to store:', err)
    }
  }
  else {
    writeLocalStorage()
  }
}

function schedulePersist() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = undefined
    persist()
  }, 2000)
}

async function load() {
  if (loaded.value) return

  let data: UnreadStoreData | null = null

  if (isTauriEnv()) {
    try {
      const store = await getStore()
      data = (await store.get(STORE_KEY)) as UnreadStoreData | undefined ?? null
    }
    catch (err) {
      console.warn('[useUnreadStore] Failed to load from store:', err)
    }
  }
  else {
    data = readLocalStorage()
  }

  if (data?.version === 1) {
    applyStoreData(data)
  }

  loaded.value = true
}

function markChannelRead(teamId: string, channelId: string) {
  const key = itemKey('channel', channelId, teamId)
  readTimestamps[key] = { timestamp: new Date().toISOString(), source: 'local' }
  unreadCounts[key] = 0
  schedulePersist()
}

function flush() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = undefined
  }
  persist()
}

/** @internal — reset all module state for unit tests */
export function _resetUnreadStoreForTesting() {
  for (const key of Object.keys(readTimestamps)) delete readTimestamps[key]
  for (const key of Object.keys(unreadCounts)) delete unreadCounts[key]
  for (const key of Object.keys(lastKnownPreviewIds)) delete lastKnownPreviewIds[key]
  for (const key of Object.keys(channelLastMessageTimes)) delete channelLastMessageTimes[key]
  loaded.value = false
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = undefined
  }
}

export function useUnreadStore() {
  const { graphFetch } = useGraph()
  const { currentUserId } = useCurrentUser()

  async function markChatRead(chatId: string) {
    const key = chatId
    readTimestamps[key] = { timestamp: new Date().toISOString(), source: 'local' }
    unreadCounts[key] = 0
    schedulePersist()

    // Fire-and-forget Graph API call
    graphFetch(`/chats/${chatId}/markChatReadForUser`, {
      method: 'POST',
      body: JSON.stringify({
        user: { id: currentUserId.value },
      }),
    }).catch((err) => {
      console.warn('[useUnreadStore] markChatReadForUser failed:', err)
    })
  }

  return {
    // State
    unreadCounts,
    totalUnread,
    loaded,

    // Queries
    isUnread,
    getUnreadCount,
    getLastRead,
    getSnapshotLastRead,
    getSectionUnreadItemCount,

    // Mutations
    updateFromChats,
    updateChannelUnread,
    touchReadTimestamp,
    setExactCount,
    markChatRead,
    markChannelRead,

    // Lifecycle
    load,
    persist,
    flush,
  }
}
