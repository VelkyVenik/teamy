<script setup lang="ts">
const emit = defineEmits<{
  close: []
}>()

const { messages, isStreaming, error, quickActions, sendMessage, clearMessages } = useClaude()

const input = ref('')
const messagesContainer = ref<HTMLElement>()

async function handleSend() {
  const text = input.value.trim()
  if (!text || isStreaming.value) return

  input.value = ''
  await sendMessage(text)
}

function handleQuickAction(name: string) {
  input.value = `/${name}`
  handleSend()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toolDisplayName(name: string): string {
  const map: Record<string, string> = {
    create_plugin: 'Creating plugin',
    update_plugin: 'Updating plugin',
    list_plugins: 'Listing plugins',
    toggle_plugin: 'Toggling plugin',
    delete_plugin: 'Deleting plugin',
    get_plugin_logs: 'Reading logs',
    read_file: 'Reading file',
    write_file: 'Writing file',
    edit_file: 'Editing file',
    list_directory: 'Listing directory',
    search_files: 'Searching files',
  }
  return map[name] || name
}

function toolSubtitle(tool: { name: string; input: Record<string, unknown> }): string | null {
  const path = tool.input.path as string | undefined
  if (path) return path
  const pattern = tool.input.pattern as string | undefined
  if (pattern) return pattern
  const id = tool.input.id as string | undefined
  if (id) return id
  return null
}

function toolStatusIcon(status: string): string {
  switch (status) {
    case 'pending': return 'i-lucide-circle-dashed'
    case 'running': return 'i-lucide-loader-2'
    case 'success': return 'i-lucide-check-circle'
    case 'error': return 'i-lucide-x-circle'
    default: return 'i-lucide-circle'
  }
}

function toolCardClass(status: string): string {
  switch (status) {
    case 'pending': return 'border-(--ui-border) bg-(--ui-bg-elevated)/50 text-(--ui-text-muted)'
    case 'running': return 'border-indigo-500/30 bg-indigo-500/5 text-indigo-400'
    case 'success': return 'border-green-500/30 bg-green-500/5 text-green-400'
    case 'error': return 'border-red-500/30 bg-red-500/5 text-red-400'
    default: return 'border-(--ui-border) bg-(--ui-bg-elevated)/50'
  }
}

// Auto-scroll to bottom on new messages
watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  },
)

// Also scroll during streaming (content changes + tool call status changes)
watch(
  () => {
    const last = messages.value[messages.value.length - 1]
    if (!last) return ''
    const toolStatus = last.toolCalls?.map((tc: { status: string }) => tc.status).join(',') ?? ''
    return `${last.content}|${toolStatus}`
  },
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  },
)
</script>

<template>
  <div class="flex flex-col h-full bg-(--ui-bg)">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-(--ui-border) min-h-[49px]">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="xs"
          square
          @click="emit('close')"
        />
        <UIcon name="i-lucide-sparkles" class="text-(--ui-primary) size-4" />
        <span class="font-semibold text-sm">Teamy AI</span>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-trash-2"
          variant="ghost"
          color="neutral"
          size="xs"
          square
          :disabled="messages.length === 0"
          @click="clearMessages"
        />
      </div>
    </div>

    <!-- Messages -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-4 py-3 space-y-4"
    >
      <!-- Empty state -->
      <div
        v-if="messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-center gap-4"
      >
        <UIcon name="i-lucide-sparkles" class="text-(--ui-text-dimmed) size-10" />
        <div>
          <p class="text-sm font-medium text-(--ui-text-muted)">Teamy AI Assistant</p>
          <p class="text-xs text-(--ui-text-dimmed) mt-1">
            Ask me anything about your chats, or use quick actions below.
          </p>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-2 w-full max-w-xs mt-2">
          <UButton
            v-for="action in quickActions"
            :key="action.name"
            :icon="action.icon"
            :label="action.label"
            variant="soft"
            color="neutral"
            size="sm"
            block
            @click="handleQuickAction(action.name)"
          />
        </div>
      </div>

      <!-- Message list -->
      <template v-for="msg in messages" :key="msg.id">
        <!-- User message -->
        <div v-if="msg.role === 'user'" class="flex justify-end">
          <div class="max-w-[85%] rounded-xl px-3 py-2 bg-(--ui-primary) text-white text-sm">
            {{ msg.content }}
          </div>
        </div>

        <!-- Assistant message -->
        <div v-else class="flex justify-start">
          <div class="max-w-[85%]">
            <div class="flex items-center gap-1.5 mb-1">
              <UIcon name="i-lucide-sparkles" class="text-(--ui-primary) size-3.5" />
              <span class="text-xs font-medium text-(--ui-text-muted)">Teamy AI</span>
              <span class="text-xs text-(--ui-text-dimmed)">{{ formatTime(msg.timestamp) }}</span>
            </div>

            <!-- Tool call cards -->
            <div v-if="msg.toolCalls?.length" class="space-y-1.5 mb-2">
              <details
                v-for="tool in msg.toolCalls"
                :key="tool.id"
                class="rounded-lg border text-xs"
                :class="toolCardClass(tool.status)"
              >
                <summary class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer list-none select-none">
                  <UIcon :name="toolStatusIcon(tool.status)" class="size-3.5 shrink-0" :class="tool.status === 'running' ? 'animate-spin' : ''" />
                  <div class="flex flex-col min-w-0">
                    <span class="font-medium truncate">{{ toolDisplayName(tool.name) }}</span>
                    <span v-if="toolSubtitle(tool)" class="text-[10px] text-(--ui-text-dimmed) truncate">{{ toolSubtitle(tool) }}</span>
                  </div>
                  <span v-if="tool.status === 'success'" class="text-(--ui-text-dimmed) truncate ml-auto">Done</span>
                  <span v-if="tool.status === 'error'" class="text-red-400 truncate ml-auto">Failed</span>
                </summary>
                <div v-if="tool.result" class="px-2.5 pb-2 pt-1 border-t border-current/10">
                  <pre class="whitespace-pre-wrap break-all text-[11px] text-(--ui-text-muted) max-h-48 overflow-y-auto font-mono">{{ tool.result }}</pre>
                </div>
              </details>
            </div>

            <div
              v-if="msg.content"
              class="rounded-xl px-3 py-2 bg-(--ui-bg-elevated) text-sm prose prose-sm max-w-none"
              v-html="renderMarkdown(msg.content)"
            />
            <span
              v-if="msg.isStreaming"
              class="inline-block w-1.5 h-4 bg-(--ui-primary) animate-pulse rounded-sm ml-0.5"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Error -->
    <div v-if="error" class="px-4 pb-2">
      <UAlert
        color="error"
        variant="soft"
        :title="error"
        :close-button="{ onClick: () => {} }"
      />
    </div>

    <!-- Input -->
    <div class="border-t border-(--ui-border) p-3">
      <!-- Quick action hints when input starts with / -->
      <div
        v-if="input.startsWith('/')"
        class="mb-2 flex flex-wrap gap-1"
      >
        <UBadge
          v-for="action in quickActions.filter(a => `/${a.name}`.startsWith(input))"
          :key="action.name"
          :label="`/${action.name}`"
          variant="subtle"
          color="primary"
          size="xs"
          class="cursor-pointer"
          @click="input = `/${action.name}`"
        />
      </div>

      <div class="flex gap-2">
        <UTextarea
          v-model="input"
          :rows="1"
          autoresize
          :maxrows="5"
          placeholder="Ask Teamy AI..."
          class="flex-1"
          :disabled="isStreaming"
          @keydown="handleKeydown"
        />
        <UButton
          icon="i-lucide-send"
          color="primary"
          variant="solid"
          size="sm"
          :loading="isStreaming"
          :disabled="!input.trim() || isStreaming"
          class="self-end"
          @click="handleSend"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.code-details) {
  margin: 0.25rem 0;
}
:deep(.code-details summary) {
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ui-text-muted);
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  user-select: none;
}
:deep(.code-details summary:hover) {
  color: var(--ui-text);
}
:deep(.code-details pre) {
  margin: 0.25rem 0 0;
  padding: 0.5rem;
  border-radius: 0.375rem;
  background: var(--ui-bg-elevated);
  overflow-x: auto;
  font-size: 0.75rem;
  line-height: 1.4;
}
:deep(.code-details code) {
  font-family: ui-monospace, monospace;
}
</style>

<script lang="ts">
import DOMPurify from 'dompurify'

// Simple markdown rendering with sanitization
function renderMarkdown(text: string): string {
  if (!text) return ''

  const html = text
    // Code blocks — escape HTML inside, wrap in collapsible <details>
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const label = lang ? `Code (${lang})` : 'Code'
      return `<details class="code-details"><summary>${label}</summary><pre><code class="language-${lang}">${escaped}</code></pre></details>`
    })
    // Inline code — escape HTML inside
    .replace(/`([^`]+)`/g, (_match: string, code: string) => {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<code>${escaped}</code>`
    })
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links — only allow http/https protocols
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, linkText: string, href: string) => {
      if (href.startsWith('https://') || href.startsWith('http://')) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a>`
      }
      return linkText
    })
    // Line breaks
    .replace(/\n/g, '<br>')

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['pre', 'code', 'strong', 'em', 'a', 'br', 'p', 'ul', 'ol', 'li', 'span', 'details', 'summary'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  })
}
</script>
