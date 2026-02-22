import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification as tauriSendNotification,
} from '@tauri-apps/plugin-notification'
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from '@tauri-apps/plugin-autostart'

// ── Types ──────────────────────────────────────────────────────────

export interface NotificationParams {
  title: string
  body: string
  chatId: string
}

export interface KeychainStoreParams {
  key: string
  value: string
}

export interface KeychainGetParams {
  key: string
}

export interface KeychainDeleteParams {
  key: string
}

export interface OpenTeamsCallParams {
  email: string
}

export interface JoinMeetingParams {
  joinUrl: string
}

export interface OpenExternalUrlParams {
  url: string
}

export interface SetTrayUnreadCountParams {
  count: number
}

// ── Composable ─────────────────────────────────────────────────────

export function useTauri() {
  const isTauri = computed(() => {
    if (import.meta.server) return false
    return !!(window as Record<string, unknown>).__TAURI_INTERNALS__
  })

  // ── Notifications ──

  async function sendNotification(params: NotificationParams): Promise<void> {
    if (!isTauri.value) return
    await invoke('send_notification', {
      title: params.title,
      body: params.body,
      chatId: params.chatId,
    })
  }

  async function sendLocalNotification(title: string, body: string): Promise<void> {
    if (!isTauri.value) return
    const granted = await isPermissionGranted()
    if (!granted) {
      const permission = await requestPermission()
      if (permission !== 'granted') return
    }
    tauriSendNotification({ title, body })
  }

  async function checkNotificationPermission(): Promise<boolean> {
    if (!isTauri.value) return false
    return invoke<boolean>('is_notification_permission_granted')
  }

  async function requestNotificationPermission(): Promise<string> {
    if (!isTauri.value) return 'denied'
    return invoke<string>('request_notification_permission')
  }

  // ── Keychain ──

  async function keychainStore(key: string, value: string): Promise<void> {
    if (!isTauri.value) return
    await invoke('keychain_store', { key, value })
  }

  async function keychainGet(key: string): Promise<string | null> {
    if (!isTauri.value) return null
    return invoke<string | null>('keychain_get', { key })
  }

  async function keychainDelete(key: string): Promise<void> {
    if (!isTauri.value) return
    await invoke('keychain_delete', { key })
  }

  // ── Deep Links ──

  async function openTeamsCall(email: string): Promise<void> {
    if (!isTauri.value) return
    await invoke('open_teams_call', { email })
  }

  async function joinMeeting(joinUrl: string): Promise<void> {
    if (!isTauri.value) return
    await invoke('join_meeting', { joinUrl })
  }

  async function openExternalUrl(url: string): Promise<void> {
    if (!isTauri.value) return
    await invoke('open_external_url', { url })
  }

  // ── System Tray ──

  async function setTrayUnreadCount(count: number): Promise<void> {
    if (!isTauri.value) return
    await invoke('set_tray_unread_count', { count })
  }

  // ── Autostart ──

  async function setAutostart(enabled: boolean): Promise<void> {
    if (!isTauri.value) return
    if (enabled) {
      await enableAutostart()
    } else {
      await disableAutostart()
    }
  }

  async function getAutostartEnabled(): Promise<boolean> {
    if (!isTauri.value) return false
    return isAutostartEnabled()
  }

  // ── Events ──

  async function onNavigate(callback: (path: string) => void): Promise<() => void> {
    if (!isTauri.value) return () => {}
    const unlisten = await listen<string>('navigate', (event) => {
      callback(event.payload)
    })
    return unlisten
  }

  return {
    isTauri: readonly(isTauri),

    // Notifications
    sendNotification,
    sendLocalNotification,
    checkNotificationPermission,
    requestNotificationPermission,

    // Keychain
    keychainStore,
    keychainGet,
    keychainDelete,

    // Deep links
    openTeamsCall,
    joinMeeting,
    openExternalUrl,

    // System tray
    setTrayUnreadCount,

    // Autostart
    setAutostart,
    getAutostartEnabled,

    // Events
    onNavigate,
  }
}
