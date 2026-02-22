import { defineEventHandler, getHeader, setHeader, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''

  // Only apply to /api/graph/* routes
  if (!path.startsWith('/api/graph')) return

  // Try to get token from the session (set by nuxt-oidc-auth)
  const authHeader = getHeader(event, 'authorization')

  if (authHeader) {
    // Client already sent an auth header — pass it through
    return
  }

  // Try to extract token from the OIDC session cookie
  try {
    const session = await getUserSession(event)
    const accessToken = (session as any)?.accessToken ?? (session as any)?.tokens?.accessToken

    if (accessToken) {
      // Inject the token as Authorization header for the proxy handler
      setHeader(event, 'authorization', `Bearer ${accessToken}`)
      return
    }
  }
  catch {
    // No session available
  }

  throw createError({
    statusCode: 401,
    message: 'Not authenticated. Please sign in first.',
  })
})

// Helper — provided by nuxt-oidc-auth server utils
// If not available, we define a stub that reads the session from the event
async function getUserSession(event: any): Promise<any> {
  // nuxt-oidc-auth provides this via server utils auto-import
  // This acts as a type-safe wrapper
  if (typeof globalThis.getUserSession === 'function') {
    return globalThis.getUserSession(event)
  }
  return null
}
