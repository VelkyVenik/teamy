import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from '~/utils/msalConfig'

export default defineNuxtPlugin(async (nuxtApp) => {
  const clientId = import.meta.env.VITE_AZURE_CLIENT_ID

  if (!clientId) {
    console.warn('[MSAL] VITE_AZURE_CLIENT_ID is not set — auth disabled')
    return
  }

  try {
    const msalInstance = new PublicClientApplication(msalConfig)
    await msalInstance.initialize()
    await msalInstance.handleRedirectPromise()

    // Provide first so useAuth() can access $msal
    nuxtApp.provide('msal', msalInstance)

    // Restore active account from MSAL cache
    const { initialize } = useAuth()
    initialize()
  }
  catch (err) {
    console.error('[MSAL] Failed to initialize:', err)
  }
})
