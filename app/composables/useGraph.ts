import type { GraphApiError, PaginatedResponse } from '~/types/graph'

interface GraphFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
  params?: Record<string, string>
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export function useGraph() {
  const baseUrl = 'https://graph.microsoft.com/v1.0'

  // Hoist token access to setup level so useOidcAuth() is called synchronously
  // during composable initialization — not inside async callbacks where the
  // Nuxt app context may be lost.
  const { token } = useGraphToken()

  function getToken(): string {
    if (!token.value) {
      throw createGraphError('NO_TOKEN', 'No Graph API access token available. Please sign in.')
    }
    return token.value
  }

  function createGraphError(code: string, message: string): GraphApiError & Error {
    const err = new Error(message) as GraphApiError & Error
    err.error = { code, message }
    return err
  }

  async function graphFetch<T>(path: string, options: GraphFetchOptions = {}): Promise<T> {
    const accessToken = getToken()

    const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path}`)
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value)
      }
    }

    const { params: _, headers: extraHeaders, ...fetchOptions } = options

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await $fetch<T>(url.toString(), {
          ...fetchOptions,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...extraHeaders,
          },
        })
        return response
      }
      catch (err: any) {
        const status = err?.response?.status ?? err?.statusCode

        // Rate limited — retry with exponential backoff
        if (status === 429) {
          const retryAfter = err?.response?.headers?.get?.('Retry-After')
          const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : 0
          const delay = delaySeconds > 0
            ? delaySeconds * 1000
            : BASE_DELAY_MS * Math.pow(2, attempt)

          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // Parse Graph API error body
        if (err?.data?.error) {
          lastError = createGraphError(err.data.error.code, err.data.error.message)
        }
        else {
          lastError = createGraphError(
            status?.toString() ?? 'UNKNOWN',
            err?.message ?? 'Unknown Graph API error',
          )
        }
        break
      }
    }

    throw lastError
  }

  async function graphFetchAll<T>(path: string, options: GraphFetchOptions = {}): Promise<T[]> {
    const items: T[] = []
    let nextLink: string | undefined

    const firstPage = await graphFetch<PaginatedResponse<T>>(path, options)
    items.push(...firstPage.value)
    nextLink = firstPage['@odata.nextLink']

    while (nextLink) {
      const page = await graphFetch<PaginatedResponse<T>>(nextLink)
      items.push(...page.value)
      nextLink = page['@odata.nextLink']
    }

    return items
  }

  async function graphFetchPage<T>(path: string, options: GraphFetchOptions = {}): Promise<PaginatedResponse<T>> {
    return graphFetch<PaginatedResponse<T>>(path, options)
  }

  return {
    graphFetch,
    graphFetchAll,
    graphFetchPage,
  }
}
