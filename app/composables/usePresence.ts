import type { Presence, UsePresenceReturn } from '~/types/graph'

const PRESENCE_POLL_INTERVAL_MS = 30_000

// Module-level shared state — all callers of usePresence() see the same data
const presenceMap = ref<Map<string, Presence>>(new Map())
let pollTimer: ReturnType<typeof setInterval> | null = null
let trackedUserIds: string[] = []
let consecutiveFailures = 0

const AVAILABILITY_LABELS: Record<string, string> = {
  Available: 'Available',
  AvailableIdle: 'Away',
  Away: 'Away',
  BeRightBack: 'Away',
  Busy: 'Busy',
  BusyIdle: 'Busy',
  DoNotDisturb: 'Do Not Disturb',
  Offline: 'Offline',
  PresenceUnknown: 'Offline',
}

export function getPresenceLabel(userId: string): string | undefined {
  const presence = presenceMap.value.get(userId)
  if (!presence) return undefined
  return AVAILABILITY_LABELS[presence.availability] ?? 'Offline'
}

export function usePresence(): UsePresenceReturn {
  const { graphFetch } = useGraph()

  async function fetchPresence(userIds: string[]) {
    if (userIds.length === 0) return

    try {
      const response = await graphFetch<{ value: Presence[] }>(
        '/communications/getPresencesByUserId',
        {
          method: 'POST',
          body: JSON.stringify({ ids: userIds }),
        },
      )

      consecutiveFailures = 0
      for (const presence of response.value) {
        presenceMap.value.set(presence.id, presence)
      }
      // Trigger reactivity on the Map
      presenceMap.value = new Map(presenceMap.value)
    }
    catch (err) {
      consecutiveFailures++
      console.warn('[usePresence] fetchPresence failed:', err)
      // Stop polling after 3 consecutive failures to avoid spamming
      if (consecutiveFailures >= 3) {
        console.warn('[usePresence] Too many failures, stopping presence polling')
        stopPolling()
      }
    }
  }

  function startPolling(userIds: string[]) {
    trackedUserIds = userIds
    consecutiveFailures = 0
    stopPolling()
    fetchPresence(userIds)
    pollTimer = setInterval(() => fetchPresence(trackedUserIds), PRESENCE_POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function getPresence(userId: string): Presence | undefined {
    return presenceMap.value.get(userId)
  }

  onUnmounted(() => {
    stopPolling()
  })

  return {
    presenceMap,
    fetchPresence,
    startPolling,
    stopPolling,
    getPresence,
  }
}
