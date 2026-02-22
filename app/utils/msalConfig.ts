import type { Configuration, PopupRequest } from '@azure/msal-browser'

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

function getRedirectUri(): string {
  if (typeof window === 'undefined') return 'http://localhost'
  return window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost'
}

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: getRedirectUri(),
  },
  cache: {
    cacheLocation: isTauri ? 'memoryStorage' : 'sessionStorage',
  },
}

export const loginRequest: PopupRequest = {
  scopes: [
    'openid',
    'profile',
    'User.Read',
    'Chat.ReadWrite',
    'ChannelMessage.Read.All',
    'ChannelMessage.Send',
    'Team.ReadBasic.All',
    'Channel.ReadBasic.All',
    'Presence.Read',
    'Presence.Read.All',
    'People.Read',
    'offline_access',
  ],
}
