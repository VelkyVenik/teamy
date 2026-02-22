// Microsoft Graph API response types for Teamy

// --- Pagination ---

export interface PaginatedResponse<T> {
  '@odata.context'?: string
  '@odata.count'?: number
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
  value: T[]
}

// --- Error handling ---

export interface GraphApiErrorInner {
  code: string
  message: string
  innerError?: {
    'request-id'?: string
    date?: string
    'client-request-id'?: string
  }
}

export interface GraphApiError {
  error: GraphApiErrorInner
}

// --- User & Identity ---

export interface User {
  id: string
  displayName: string
  mail: string | null
  userPrincipalName: string
  jobTitle?: string | null
  officeLocation?: string | null
  givenName?: string | null
  surname?: string | null
}

export interface Identity {
  '@odata.type'?: string
  displayName: string
  id: string | null
  tenantId?: string | null
  userIdentityType?: 'aadUser' | 'onPremiseUser' | 'anonymousGuest' | 'federatedUser'
}

export interface IdentitySet {
  application?: Identity
  device?: Identity
  user?: Identity
}

// --- Presence ---

export type PresenceAvailability =
  | 'Available'
  | 'AvailableIdle'
  | 'Away'
  | 'BeRightBack'
  | 'Busy'
  | 'BusyIdle'
  | 'DoNotDisturb'
  | 'Offline'
  | 'PresenceUnknown'

export type PresenceActivity =
  | 'Available'
  | 'Away'
  | 'BeRightBack'
  | 'Busy'
  | 'DoNotDisturb'
  | 'InACall'
  | 'InAConferenceCall'
  | 'Inactive'
  | 'InAMeeting'
  | 'Offline'
  | 'OffWork'
  | 'OutOfOffice'
  | 'PresenceUnknown'
  | 'Presenting'
  | 'UrgentInterruptionsOnly'

export interface Presence {
  id: string
  availability: PresenceAvailability
  activity: PresenceActivity
  statusMessage?: {
    message?: {
      content: string
      contentType: string
    }
    expiryDateTime?: string | null
  } | null
}

// --- Chat ---

export type ChatType = 'oneOnOne' | 'group' | 'meeting'

export interface ChatMessage {
  id: string
  replyToId: string | null
  etag: string | null
  messageType: 'message' | 'chatEvent' | 'typing' | 'unknownFutureValue'
  createdDateTime: string
  lastModifiedDateTime: string | null
  lastEditedDateTime: string | null
  deletedDateTime: string | null
  subject: string | null
  summary: string | null
  chatId: string | null
  importance: 'normal' | 'high' | 'urgent'
  from: IdentitySet | null
  body: {
    contentType: 'text' | 'html'
    content: string
  }
  attachments: ChatMessageAttachment[]
  mentions: ChatMessageMention[]
  reactions: ChatMessageReaction[]
}

export interface ChatMessageAttachment {
  id: string | null
  contentType: string | null
  contentUrl: string | null
  content: string | null
  name: string | null
  thumbnailUrl: string | null
}

export interface ChatMessageMention {
  id: number
  mentionText: string
  mentioned: {
    user?: Identity
    application?: Identity
    conversation?: { id: string; displayName: string; conversationIdentityType: string }
  }
}

export interface ChatMessageReaction {
  reactionType: string
  createdDateTime: string
  user: IdentitySet
}

export interface ChatMember {
  '@odata.type': string
  id: string
  displayName: string
  userId: string
  email: string | null
  roles: string[]
  visibleHistoryStartDateTime?: string
}

export interface ChatViewpoint {
  isHidden?: boolean
  lastMessageReadDateTime?: string | null
}

export interface Chat {
  id: string
  topic: string | null
  createdDateTime: string
  lastUpdatedDateTime: string | null
  chatType: ChatType
  webUrl: string | null
  tenantId: string | null
  members?: ChatMember[]
  lastMessagePreview?: ChatMessagePreview | null
  viewpoint?: ChatViewpoint | null
}

export interface ChatMessagePreview {
  id: string
  createdDateTime: string
  isDeleted: boolean
  body: {
    contentType: 'text' | 'html'
    content: string
  }
  from: IdentitySet | null
}

// --- Teams & Channels ---

export interface Team {
  id: string
  displayName: string
  description: string | null
  createdDateTime?: string
  isArchived: boolean
  webUrl: string | null
}

export interface Channel {
  id: string
  displayName: string
  description: string | null
  createdDateTime: string
  membershipType: 'standard' | 'private' | 'unknownFutureValue' | 'shared'
  webUrl: string | null
  email?: string | null
}

export interface ChannelMessage extends ChatMessage {
  channelIdentity?: {
    teamId: string
    channelId: string
  }
  replies?: ChatMessage[]
}

// --- People ---

export interface Person {
  id: string
  displayName: string
  scoredEmailAddresses?: { address: string }[]
  userPrincipalName?: string
}

// --- Send message payload ---

export interface SendMessagePayload {
  body: {
    contentType: 'text' | 'html'
    content: string
  }
  hostedContents?: ChatMessageHostedContent[]
}

// --- Image attachments ---

export interface PendingImage {
  id: string
  file: File
  previewUrl: string
  mimeType: string
}

export interface ChatMessageHostedContent {
  '@microsoft.graph.temporaryId': string
  contentBytes: string
  contentType: string
}

// --- Batch presence request ---

export interface PresenceBatchRequest {
  ids: string[]
}

// --- Composable return types ---

export interface UseChatsReturn {
  chats: Ref<Chat[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchChats: () => Promise<void>
  refreshChats: () => Promise<void>
}

export interface UseMessagesReturn {
  messages: Ref<ChatMessage[]>
  loading: Ref<boolean>
  loadingMore: Ref<boolean>
  error: Ref<string | null>
  hasMore: Ref<boolean>
  fetchMessages: () => Promise<void>
  loadMore: () => Promise<void>
  sendMessage: (content: string, contentType?: 'text' | 'html', images?: PendingImage[]) => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

export interface UseChannelsReturn {
  teams: Ref<Team[]>
  channels: Ref<Map<string, Channel[]>>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchTeams: () => Promise<void>
  fetchAssociatedTeams: () => Promise<void>
  fetchChannels: (teamId: string) => Promise<void>
  fetchChannelMessages: (teamId: string, channelId: string) => Promise<ChannelMessage[]>
  sendChannelMessage: (teamId: string, channelId: string, content: string, contentType?: 'text' | 'html', images?: PendingImage[]) => Promise<void>
}

export interface UsePresenceReturn {
  presenceMap: Ref<Map<string, Presence>>
  fetchPresence: (userIds: string[]) => Promise<void>
  startPolling: (userIds: string[]) => void
  stopPolling: () => void
  getPresence: (userId: string) => Presence | undefined
}

// Vue ref type for use in interfaces
type Ref<T> = import('vue').Ref<T>
