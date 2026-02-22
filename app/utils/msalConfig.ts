import type { Configuration, PopupRequest } from '@azure/msal-browser'

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost',
  },
  cache: {
    cacheLocation: 'memoryStorage',
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
