// --- Claude API Request/Response Types ---

export type ClaudeRole = 'user' | 'assistant'

export interface ClaudeTextBlock {
  type: 'text'
  text: string
}

export interface ClaudeMessage {
  role: ClaudeRole
  content: string | ClaudeTextBlock[]
}

export interface ClaudeRequest {
  model: string
  max_tokens: number
  system?: string
  messages: ClaudeMessage[]
  stream?: boolean
  temperature?: number
}

export interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
}

export interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ClaudeTextBlock[]
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null
  usage: ClaudeUsage
}

// --- SSE Streaming Event Types ---

export interface ClaudeStreamMessageStart {
  type: 'message_start'
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    model: string
    usage: { input_tokens: number; output_tokens: number }
  }
}

export interface ClaudeStreamContentBlockStart {
  type: 'content_block_start'
  index: number
  content_block: { type: 'text'; text: string }
}

export interface ClaudeStreamContentBlockDelta {
  type: 'content_block_delta'
  index: number
  delta: { type: 'text_delta'; text: string }
}

export interface ClaudeStreamContentBlockStop {
  type: 'content_block_stop'
  index: number
}

export interface ClaudeStreamMessageDelta {
  type: 'message_delta'
  delta: { stop_reason: string }
  usage: { output_tokens: number }
}

export interface ClaudeStreamMessageStop {
  type: 'message_stop'
}

export type ClaudeStreamEvent =
  | ClaudeStreamMessageStart
  | ClaudeStreamContentBlockStart
  | ClaudeStreamContentBlockDelta
  | ClaudeStreamContentBlockStop
  | ClaudeStreamMessageDelta
  | ClaudeStreamMessageStop

// --- Frontend Chat Types ---

export interface ClaudeChatMessage {
  id: string
  role: ClaudeRole
  content: string
  timestamp: number
  isStreaming?: boolean
}

export interface QuickAction {
  name: string
  label: string
  icon: string
  description: string
}

export interface ClaudeContext {
  chatName?: string
  chatType?: string
  recentMessages?: Array<{ sender: string; content: string }>
  installedPlugins?: Array<{ id: string; name: string; description: string }>
}
