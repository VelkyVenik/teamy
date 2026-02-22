import type { Chat } from '~/types/graph'

export function useCreateChat() {
  const { graphFetch } = useGraph()
  const { currentUserId } = useCurrentUser()

  async function createOneOnOneChat(userId: string): Promise<Chat> {
    return await graphFetch<Chat>('/chats', {
      method: 'POST',
      body: JSON.stringify({
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            'roles': ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${currentUserId.value}')`,
          },
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            'roles': ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
          },
        ],
      }),
    })
  }

  return { createOneOnOneChat }
}
