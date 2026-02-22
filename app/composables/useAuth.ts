import type { AccountInfo, AuthenticationResult, PublicClientApplication } from '@azure/msal-browser'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { loginRequest } from '~/utils/msalConfig'

const currentAccount = ref<AccountInfo | null>(null)
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

// Tauri-only token state (MSAL not used for token management in Tauri)
const tauriTokens = ref<{
  accessToken: string
  refreshToken: string
  expiresAt: number
} | null>(null)

export function useAuth() {
  const nuxtApp = useNuxtApp()

  function getMsal(): PublicClientApplication {
    const msal = nuxtApp.$msal as PublicClientApplication | undefined
    if (!msal) {
      throw new Error('MSAL not initialized. Check that VITE_AZURE_CLIENT_ID is set.')
    }
    return msal
  }

  const loggedIn = computed(() => currentAccount.value !== null)
  const account = computed(() => currentAccount.value)

  function initialize() {
    if (isTauri) return // Tauri uses memoryStorage, no session to restore
    if (!nuxtApp.$msal) return
    const msal = nuxtApp.$msal as PublicClientApplication
    const accounts = msal.getAllAccounts()
    if (accounts.length > 0) {
      currentAccount.value = accounts[0]
      msal.setActiveAccount(accounts[0])
    }
  }

  async function login() {
    if (isTauri) {
      await loginViaTauri()
    }
    else {
      const msal = getMsal()
      const result = await msal.loginPopup(loginRequest)
      currentAccount.value = result.account
      msal.setActiveAccount(result.account)
    }
  }

  async function logout() {
    if (isTauri) {
      tauriTokens.value = null
      currentAccount.value = null
    }
    else {
      const msal = getMsal()
      await msal.logoutPopup()
      currentAccount.value = null
    }
  }

  async function getAccessToken(): Promise<string> {
    if (!currentAccount.value) {
      throw new Error('No account. Please sign in.')
    }

    if (isTauri) {
      return getTauriAccessToken()
    }

    const msal = getMsal()
    try {
      const response = await msal.acquireTokenSilent({
        ...loginRequest,
        account: currentAccount.value,
      })
      return response.accessToken
    }
    catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        const response = await msal.acquireTokenPopup(loginRequest)
        currentAccount.value = response.account
        msal.setActiveAccount(response.account)
        return response.accessToken
      }
      throw error
    }
  }

  return {
    loggedIn,
    account,
    login,
    logout,
    getAccessToken,
    initialize,
  }
}

// --- Tauri-native OAuth2 PKCE flow ---

const TAURI_REDIRECT_URI = 'http://localhost'

function getClientId(): string {
  return import.meta.env.VITE_AZURE_CLIENT_ID
}

function getTenantId(): string {
  return import.meta.env.VITE_AZURE_TENANT_ID
}

async function loginViaTauri() {
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')

  // Generate PKCE + state nonce for CSRF protection
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateCodeVerifier()

  // Build Azure AD authorization URL
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: 'code',
    redirect_uri: TAURI_REDIRECT_URI,
    scope: loginRequest.scopes.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_mode: 'query',
    state,
  })

  const authUrl = `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/authorize?${params}`

  // Open Tauri auth window and wait for the auth code
  const unlisteners: Array<() => void> = []

  try {
    const code = await new Promise<string>((resolve, reject) => {
      const setup = async () => {
        unlisteners.push(
          await listen<{ code: string, state?: string }>('auth:callback', (event) => {
            if (event.payload.state && event.payload.state !== state) {
              reject(new Error('OAuth state mismatch — possible CSRF'))
              return
            }
            resolve(event.payload.code)
          }),
        )
        unlisteners.push(
          await listen<{ error: string, description: string }>('auth:error', (event) => {
            reject(new Error(`${event.payload.error}: ${event.payload.description}`))
          }),
        )
        unlisteners.push(
          await listen('auth:cancelled', () => {
            reject(new Error('Authentication cancelled'))
          }),
        )

        await invoke('open_auth_window', {
          authUrl,
          redirectUri: TAURI_REDIRECT_URI,
        })
      }
      setup().catch(reject)
    })

    // Exchange auth code for tokens directly with Azure AD
    const tokenData = await exchangeCodeForTokens(code, codeVerifier)

    // Parse the ID token to get user info
    const idClaims = parseJwtPayload(tokenData.id_token)

    // Store tokens for later use
    tauriTokens.value = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    }

    // Create an AccountInfo-compatible object
    currentAccount.value = {
      homeAccountId: `${idClaims.oid}.${idClaims.tid}`,
      localAccountId: idClaims.oid,
      environment: 'login.microsoftonline.com',
      tenantId: idClaims.tid,
      username: idClaims.preferred_username ?? idClaims.email ?? '',
      name: idClaims.name ?? '',
    } as AccountInfo
  }
  finally {
    unlisteners.forEach(fn => fn())
  }
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  id_token: string
  expires_in: number
  token_type: string
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
  const response = await fetch(
    `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getClientId(),
        scope: loginRequest.scopes.join(' '),
        code,
        redirect_uri: TAURI_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    },
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  return response.json()
}

async function refreshAccessToken(): Promise<TokenResponse> {
  if (!tauriTokens.value?.refreshToken) {
    throw new Error('No refresh token available. Please sign in again.')
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getClientId(),
        scope: loginRequest.scopes.join(' '),
        refresh_token: tauriTokens.value.refreshToken,
        grant_type: 'refresh_token',
      }),
    },
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token refresh failed: ${error}`)
  }

  return response.json()
}

// Guard against concurrent refresh requests (token stampede prevention)
let pendingRefresh: Promise<string> | null = null

async function getTauriAccessToken(): Promise<string> {
  if (!tauriTokens.value) {
    throw new Error('No tokens. Please sign in.')
  }

  // Return cached token if not expired (with 5 min buffer)
  if (tauriTokens.value.expiresAt > Date.now() + 5 * 60 * 1000) {
    return tauriTokens.value.accessToken
  }

  // If a refresh is already in flight, wait for it
  if (pendingRefresh) {
    return pendingRefresh
  }

  // Refresh the token (single flight)
  pendingRefresh = refreshAccessToken()
    .then((tokenData) => {
      tauriTokens.value = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      }
      return tokenData.access_token
    })
    .finally(() => {
      pendingRefresh = null
    })

  return pendingRefresh
}

// --- Utilities ---

function parseJwtPayload(token: string): Record<string, any> {
  const payload = token.split('.')[1]
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

function base64UrlEncode(buffer: Uint8Array): string {
  const str = btoa(String.fromCharCode(...buffer))
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
