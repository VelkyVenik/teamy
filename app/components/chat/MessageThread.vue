<script setup lang="ts">
import type { ChatMessage } from '~~/types/graph'

const props = defineProps<{
  messages: ChatMessage[]
  loading?: boolean
  isChannel?: boolean
}>()

const emit = defineEmits<{
  reply: [message: ChatMessage]
  react: [message: ChatMessage, reactionType: string]
}>()

const scrollContainer = ref<HTMLElement>()
const isUserScrolledUp = ref(false)
let programmaticScroll = false

function doScroll() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

function scrollToBottom(force = false) {
  if (!force && isUserScrolledUp.value) return
  programmaticScroll = true
  // Scroll at multiple stages to handle late-rendering HTML content
  nextTick(() => {
    doScroll()
    setTimeout(() => {
      doScroll()
      setTimeout(() => {
        doScroll()
        programmaticScroll = false
      }, 100)
    }, 50)
  })
}

function handleScroll() {
  if (programmaticScroll) return
  if (!scrollContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value
  isUserScrolledUp.value = scrollHeight - scrollTop - clientHeight > 100
}

// When loading finishes (spinner → messages), reset and scroll to bottom
watch(() => props.loading, (loading, wasLoading) => {
  if (wasLoading && !loading) {
    isUserScrolledUp.value = false
    scrollToBottom(true)
  }
})

// When the messages array ref changes (chat/channel switch)
watch(() => props.messages, () => {
  isUserScrolledUp.value = false
  scrollToBottom(true)
})

// Scroll on new incoming messages unless user scrolled up
watch(() => props.messages.length, (len, oldLen) => {
  if (len !== oldLen) scrollToBottom()
})

defineExpose({ scrollToBottom })

// --- Date separator logic ---
function isSameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate()
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (msgDate.getTime() === today.getTime()) return 'Today'
  if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function shouldShowDateSeparator(index: number): boolean {
  if (index === 0) return true
  return !isSameDay(props.messages[index - 1].createdDateTime, props.messages[index].createdDateTime)
}

// --- Message grouping logic ---
// Consecutive messages from same sender within 5 minutes => grouped
function isConsecutiveMessage(index: number): boolean {
  if (index === 0) return false
  // If a date separator is shown, it's not consecutive
  if (shouldShowDateSeparator(index)) return false

  const prev = props.messages[index - 1]
  const curr = props.messages[index]

  // Different sender
  if (prev.from?.user?.id !== curr.from?.user?.id) return false

  // More than 5 minutes apart
  const prevTime = new Date(prev.createdDateTime).getTime()
  const currTime = new Date(curr.createdDateTime).getTime()
  if (currTime - prevTime > 5 * 60 * 1000) return false

  return true
}
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-y-auto"
    @scroll="handleScroll"
  >
    <div v-if="loading" class="flex items-center justify-center h-full">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-(--ui-text-muted)" />
    </div>
    <div v-else-if="messages.length === 0" class="flex items-center justify-center h-full text-(--ui-text-muted) text-sm">
      No messages yet. Start the conversation!
    </div>
    <div v-else class="flex flex-col pb-2">
      <!-- Top spacer -->
      <div class="pt-6" />

      <template v-for="(msg, i) in messages" :key="msg.id">
        <!-- Date separator -->
        <div v-if="shouldShowDateSeparator(i)" class="flex items-center gap-3 px-5 my-4">
          <div class="flex-1 h-px bg-(--ui-border)" />
          <span class="text-xs font-bold text-(--ui-text-muted) whitespace-nowrap px-2">
            {{ formatDateSeparator(msg.createdDateTime) }}
          </span>
          <div class="flex-1 h-px bg-(--ui-border)" />
        </div>

        <MessageBubble
          :message="msg"
          :is-consecutive="isConsecutiveMessage(i)"
          :is-channel="isChannel"
          @reply="emit('reply', $event)"
          @react="(msg, type) => emit('react', msg, type)"
        />
      </template>

      <!-- Bottom spacer -->
      <div class="pt-2" />
    </div>
  </div>
</template>
