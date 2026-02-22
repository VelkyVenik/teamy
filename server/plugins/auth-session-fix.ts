import { defineNitroPlugin, useStorage } from 'nitropack/runtime'
import { parseCookies, setCookie, getCookie, eventHandler, getQuery, getRequestURL } from 'h3'

/**
 * Workaround for Tauri WebKit webview not preserving cookies set on 302 redirect responses.
 *
 * The nuxt-oidc-auth module stores PKCE state (code_verifier) and state parameter in an
 * "oidc" session cookie during the login redirect. WebKit drops this cookie because it's
 * set on a redirect response.
 *
 * This plugin intercepts the auth flow:
 * 1. After /auth/entra/login: captures the oidc session cookie from the response
 *    and stores it in server-side memory keyed by the OAuth state parameter
 * 2. Before /auth/entra/callback: restores the oidc cookie from memory so
 *    nuxt-oidc-auth can read it normally
 */

const authStateStore = new Map<string, { cookie: string; createdAt: number }>()

// Clean up entries older than 5 minutes
function cleanupStale() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  for (const [key, value] of authStateStore) {
    if (value.createdAt < fiveMinutesAgo) {
      authStateStore.delete(key)
    }
  }
}

export default defineNitroPlugin((nitroApp) => {
  // Intercept responses to capture the oidc cookie from login redirects
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    const path = event.path ?? ''

    if (path.startsWith('/auth/') && path.includes('/login')) {
      // The login handler sets the oidc cookie and redirects
      // Capture the cookie value from the response headers
      const headers = event.node.res.getHeaders()
      const setCookieHeaders = headers['set-cookie']

      if (setCookieHeaders) {
        const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]

        for (const cookieStr of cookieArray) {
          if (cookieStr.startsWith('oidc=')) {
            // Extract the cookie value
            const cookieValue = cookieStr.split(';')[0].substring('oidc='.length)

            // Extract the state from the redirect URL to use as the key
            const location = headers['location'] as string
            if (location) {
              const url = new URL(location)
              const state = url.searchParams.get('state')
              if (state) {
                cleanupStale()
                authStateStore.set(state, {
                  cookie: cookieValue,
                  createdAt: Date.now(),
                })
                console.log(`[auth-fix] Stored oidc session for state: ${state.substring(0, 10)}...`)
              }
            }
          }
        }
      }
    }
  })

  // Intercept requests to restore the oidc cookie on callback
  nitroApp.hooks.hook('request', (event) => {
    const path = event.path ?? ''

    if (path.startsWith('/auth/') && path.includes('/callback')) {
      const query = getQuery(event)
      const state = query.state as string

      if (state && authStateStore.has(state)) {
        const stored = authStateStore.get(state)!
        authStateStore.delete(state)

        // Inject the oidc cookie into the request so nuxt-oidc-auth can read it
        const existingCookies = event.node.req.headers.cookie || ''
        const separator = existingCookies ? '; ' : ''
        event.node.req.headers.cookie = `${existingCookies}${separator}oidc=${stored.cookie}`

        console.log(`[auth-fix] Restored oidc session for state: ${state.substring(0, 10)}...`)
      }
    }
  })
})
