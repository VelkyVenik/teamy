<script setup lang="ts">
import type { ChatMessage, ChannelMessage, PendingImage } from '~~/types/graph'

const props = defineProps<{
  message: ChannelMessage
  teamId: string
  channelId: string
}>()

const emit = defineEmits<{
  close: []
  react: [message: ChatMessage, reactionType: string]
}>()

const { graphFetchPage } = useGraph()
const { replyToChannelMessage, sending } = useSendMessage()

const replies = ref<ChatMessage[]>(props.message.replies ?? [])
const scrollContainer = ref<HTMLElement>()

async function fetchReplies() {
  const page = await graphFetchPage<ChatMessage>(
    `/teams/${props.teamId}/channels/${props.channelId}/messages/${props.message.id}/replies`,
  )
  replies.value = page.value.toReversed()
}

async function handleSend(content: string, images: PendingImage[] = []) {
  await replyToChannelMessage(props.teamId, props.channelId, props.message.id, content, 'text', images)
  await fetchReplies()
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

// Sort initial replies chronologically (API returns newest first)
onMounted(() => {
  if (replies.value.length) {
    replies.value = [...replies.value].reverse()
  }
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-(--ui-border) min-h-[49px]">
      <div class="flex items-center gap-1.5">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="xs"
          square
          @click="emit('close')"
        />
        <span class="text-[15px] font-bold text-(--ui-text-highlighted)">Thread</span>
      </div>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        square
        @click="emit('close')"
      />
    </div>

    <!-- Scrollable content -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto">
      <!-- Parent message -->
      <div class="pt-4 pb-2">
        <MessageBubble
          :message="message"
          hide-actions
          @react="(msg, type) => emit('react', msg, type)"
        />
      </div>

      <!-- Divider with reply count -->
      <div class="flex items-center gap-3 px-5 my-2">
        <div class="flex-1 h-px bg-(--ui-border)" />
        <span class="text-xs font-medium text-(--ui-text-muted) whitespace-nowrap px-2">
          {{ replies.length }} {{ replies.length === 1 ? 'reply' : 'replies' }}
        </span>
        <div class="flex-1 h-px bg-(--ui-border)" />
      </div>

      <!-- Replies -->
      <div class="flex flex-col pb-2">
        <MessageBubble
          v-for="reply in replies"
          :key="reply.id"
          :message="reply"
          hide-actions
          @react="(msg, type) => emit('react', msg, type)"
        />
      </div>
    </div>

    <!-- Compose bar -->
    <ComposeBar
      placeholder="Reply..."
      :loading="sending"
      @send="handleSend"
    />
  </div>
</template>
