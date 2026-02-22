import { defineEventHandler, getQuery, readBody, getHeader, createError } from 'h3'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// Simple in-memory cache for team/channel lists
const cache = new Map<string, { data: any; expiry: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const CACHEABLE_PATTERNS = [
  /^\/me\/joinedTeams$/,
  /^\/teams\/[^/]+\/channels$/,
]

function isCacheable(path: string, method: string): boolean {
  if (method !== 'GET') return false
  return CACHEABLE_PATTERNS.some(pattern => pattern.test(path))
}

function getCached(key: string): any | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: any) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS })
}

export default defineEventHandler(async (event) => {
  const path = '/' + (event.context.params?.path ?? '')
  const method = event.method
  const authHeader = getHeader(event, 'authorization')

  if (!authHeader) {
    throw createError({ statusCode: 401, message: 'Missing authorization header' })
  }

  // Check cache for GET requests
  if (isCacheable(path, method)) {
    const cached = getCached(path)
    if (cached) return cached
  }

  // Build query string from incoming request
  const query = getQuery(event)
  const url = new URL(`${GRAPH_BASE}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }

  // Forward the request to Graph API
  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  }

  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await readBody(event)
      if (body) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
      }
    }
    catch {
      // No body — that's fine for some requests
    }
  }

  const response = await fetch(url.toString(), fetchOptions)

  if (!response.ok) {
    const errorBody = await response.text()
    let parsed
    try {
      parsed = JSON.parse(errorBody)
    }
    catch {
      parsed = { error: { code: String(response.status), message: errorBody } }
    }
    throw createError({
      statusCode: response.status,
      data: parsed,
    })
  }

  const data = await response.json()

  // Cache the result if applicable
  if (isCacheable(path, method)) {
    setCache(path, data)
  }

  return data
})
