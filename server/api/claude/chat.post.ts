import type { ClaudeRequest } from '~/types/claude'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const apiKey = config.anthropicApiKey

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      message: 'ANTHROPIC_API_KEY is not configured',
    })
  }

  const body = await readBody<{
    messages: ClaudeRequest['messages']
    system?: string
    stream?: boolean
  }>(event)

  if (!body.messages || !Array.isArray(body.messages)) {
    throw createError({
      statusCode: 400,
      message: 'messages array is required',
    })
  }

  const claudeRequest: ClaudeRequest = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: body.system,
    messages: body.messages,
    stream: body.stream ?? true,
  }

  // Streaming response
  if (claudeRequest.stream) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeRequest),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw createError({
        statusCode: response.status,
        message: `Claude API error: ${errorText}`,
      })
    }

    // Forward the SSE stream
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const reader = response.body?.getReader()
    if (!reader) {
      throw createError({
        statusCode: 500,
        message: 'Failed to read Claude API stream',
      })
    }

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(value)
      },
      cancel() {
        reader.cancel()
      },
    })

    return sendStream(event, stream)
  }

  // Non-streaming response
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(claudeRequest),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw createError({
      statusCode: response.status,
      message: `Claude API error: ${errorText}`,
    })
  }

  return response.json()
})
