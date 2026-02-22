<script setup lang="ts">
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

// Also scroll during streaming
watch(
  () => messages.value[messages.value.length - 1]?.content,
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
    <div class="flex items-center justify-between px-4 py-3 border-b border-(--ui-border)">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="text-(--ui-primary) size-5" />
        <span class="font-semibold text-sm">Teamy AI</span>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-trash-2"
          variant="ghost"
          color="neutral"
          size="xs"
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
            <div
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

<script lang="ts">
import DOMPurify from 'dompurify'

// Simple markdown rendering with sanitization
function renderMarkdown(text: string): string {
  if (!text) return ''

  const html = text
    // Code blocks — escape HTML inside code blocks first
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<pre><code class="language-${lang}">${escaped}</code></pre>`
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
    ALLOWED_TAGS: ['pre', 'code', 'strong', 'em', 'a', 'br', 'p', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  })
}
</script>
