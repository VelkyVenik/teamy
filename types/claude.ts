// --- Claude API Request/Response Types ---

export type ClaudeRole = 'user' | 'assistant'

export interface ClaudeTextBlock {
  type: 'text'
  text: string
}

export interface ClaudeToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ClaudeToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock | ClaudeToolResultBlock

export interface ClaudeMessage {
  role: ClaudeRole
  content: string | ClaudeContentBlock[]
}

export interface ClaudeToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ClaudeRequest {
  model: string
  max_tokens: number
  system?: string
  messages: ClaudeMessage[]
  stream?: boolean
  temperature?: number
  tools?: ClaudeToolDefinition[]
}

export interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
}

export interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ClaudeContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null
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
  content_block: { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
}

export interface ClaudeStreamContentBlockDelta {
  type: 'content_block_delta'
  index: number
  delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string }
}

export interface ClaudeStreamContentBlockStop {
  type: 'content_block_stop'
  index: number
}

export interface ClaudeStreamMessageDelta {
  type: 'message_delta'
  delta: { stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' }
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

export interface ClaudeToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error'
  result?: string
}

export interface ClaudeChatMessage {
  id: string
  role: ClaudeRole
  content: string
  timestamp: number
  isStreaming?: boolean
  toolCalls?: ClaudeToolCall[]
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
