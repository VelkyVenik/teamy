import type { ChatMessage, PendingImage } from '~/types/graph'

export function useSendMessage() {
  const { graphFetch } = useGraph()
  const sending = ref(false)
  const error = ref<string | null>(null)

  async function sendToChat(chatId: string, content: string, contentType: 'text' | 'html' = 'text'): Promise<ChatMessage> {
    sending.value = true
    error.value = null
    try {
      const message = await graphFetch<ChatMessage>(`/me/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: { contentType, content },
        }),
      })
      return message
    }
    catch (err: any) {
      error.value = err?.error?.message ?? err?.message ?? 'Failed to send message'
      throw err
    }
    finally {
      sending.value = false
    }
  }

  async function sendToChannel(
    teamId: string,
    channelId: string,
    content: string,
    contentType: 'text' | 'html' = 'text',
    images: PendingImage[] = [],
  ): Promise<ChatMessage> {
    sending.value = true
    error.value = null
    try {
      const payload = await buildMessagePayload(content, images)
      const message = await graphFetch<ChatMessage>(
        `/teams/${teamId}/channels/${channelId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )
      return message
    }
    catch (err: any) {
      error.value = err?.error?.message ?? err?.message ?? 'Failed to send channel message'
      throw err
    }
    finally {
      sending.value = false
    }
  }

  async function replyToChannelMessage(
    teamId: string,
    channelId: string,
    messageId: string,
    content: string,
    contentType: 'text' | 'html' = 'text',
    images: PendingImage[] = [],
  ): Promise<ChatMessage> {
    sending.value = true
    error.value = null
    try {
      const payload = await buildMessagePayload(content, images)
      const message = await graphFetch<ChatMessage>(
        `/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )
      return message
    }
    catch (err: any) {
      error.value = err?.error?.message ?? err?.message ?? 'Failed to reply to message'
      throw err
    }
    finally {
      sending.value = false
    }
  }

  return {
    sending,
    error,
    sendToChat,
    sendToChannel,
    replyToChannelMessage,
  }
}
