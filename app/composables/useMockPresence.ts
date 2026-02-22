import type { Presence, UsePresenceReturn } from '~~/types/graph'

const mockPresenceData: Record<string, Presence> = {
  'user-002': { id: 'user-002', availability: 'Available', activity: 'Available' },
  'user-003': { id: 'user-003', availability: 'Busy', activity: 'InACall' },
  'user-004': { id: 'user-004', availability: 'Available', activity: 'Available' },
  'user-005': { id: 'user-005', availability: 'Away', activity: 'Away' },
  'user-006': { id: 'user-006', availability: 'DoNotDisturb', activity: 'Presenting' },
  'user-007': { id: 'user-007', availability: 'Available', activity: 'Available' },
  'user-008': { id: 'user-008', availability: 'Offline', activity: 'Offline' },
}

// Module-level shared state — all callers see the same data
const presenceMap = ref<Map<string, Presence>>(new Map())

export function useMockPresence(): UsePresenceReturn {

  async function fetchPresence(userIds: string[]) {
    await new Promise(r => setTimeout(r, 100))
    for (const id of userIds) {
      const p = mockPresenceData[id]
      if (p) {
        presenceMap.value.set(id, p)
      }
    }
    presenceMap.value = new Map(presenceMap.value)
  }

  function startPolling(userIds: string[]) {
    fetchPresence(userIds)
  }

  function stopPolling() {
    // No-op in mock mode
  }

  function getPresence(userId: string): Presence | undefined {
    return presenceMap.value.get(userId)
  }

  return {
    presenceMap,
    fetchPresence,
    startPolling,
    stopPolling,
    getPresence,
  }
}

export function presenceColor(availability: string): string {
  switch (availability) {
    case 'Available':
    case 'AvailableIdle':
      return 'success'
    case 'Busy':
    case 'BusyIdle':
    case 'DoNotDisturb':
      return 'error'
    case 'Away':
    case 'BeRightBack':
      return 'warning'
    case 'Offline':
    default:
      return 'neutral'
  }
}
