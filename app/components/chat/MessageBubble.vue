<script setup lang="ts">
import type { ChatMessage } from '~~/types/graph'

const props = defineProps<{
  message: ChatMessage
  showAvatar?: boolean
  isConsecutive?: boolean
  hideActions?: boolean
  isChannel?: boolean
}>()

const emit = defineEmits<{
  reply: [message: ChatMessage]
  react: [message: ChatMessage, reactionType: string]
}>()

const { currentUserId } = useCurrentUser()
const { getToken } = useGraphToken()
const isMe = computed(() => props.message.from?.user?.id === currentUserId.value)
const senderName = computed(() => props.message.from?.user?.displayName ?? 'Unknown')
const avatarUrl = computed(() => {
  if (!props.message.from?.user?.displayName) return undefined
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(props.message.from.user.displayName)}`
})

const formattedTime = computed(() => {
  const date = new Date(props.message.createdDateTime)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const showActions = ref(false)
const reactionPickerOpen = ref(false)

const reactionTypes = [
  { type: 'like', emoji: '\u{1F44D}' },
  { type: 'heart', emoji: '\u{2764}\u{FE0F}' },
  { type: 'laugh', emoji: '\u{1F602}' },
  { type: 'surprised', emoji: '\u{1F62E}' },
  { type: 'sad', emoji: '\u{1F622}' },
  { type: 'angry', emoji: '\u{1F621}' },
]

// Map reaction types to emoji
function reactionEmoji(type: string): string {
  return reactionTypes.find(r => r.type === type)?.emoji ?? type
}

function selectReaction(type: string) {
  reactionPickerOpen.value = false
  emit('react', props.message, type)
}

// Group reactions by type, count, and track if current user reacted
const groupedReactions = computed(() => {
  const groups = new Map<string, { count: number, hasMyReaction: boolean }>()
  for (const r of props.message.reactions) {
    const existing = groups.get(r.reactionType) ?? { count: 0, hasMyReaction: false }
    existing.count++
    if (r.user?.user?.id === currentUserId.value) {
      existing.hasMyReaction = true
    }
    groups.set(r.reactionType, existing)
  }
  return Array.from(groups.entries()).map(([type, { count, hasMyReaction }]) => ({ type, count, hasMyReaction }))
})

const replyCount = computed(() => (props.message as any).replies?.length ?? 0)

// File attachments (reference type = SharePoint/OneDrive files)
const fileAttachments = computed(() =>
  props.message.attachments.filter(a => a.contentType === 'reference' && a.contentUrl),
)

function fileIcon(name: string | null): string {
  const ext = name?.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return 'i-lucide-file-text'
    case 'doc': case 'docx': return 'i-lucide-file-text'
    case 'xls': case 'xlsx': return 'i-lucide-file-spreadsheet'
    case 'ppt': case 'pptx': return 'i-lucide-file-presentation' // fallback below
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': return 'i-lucide-file-image'
    case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return 'i-lucide-file-archive'
    case 'mp4': case 'mov': case 'avi': case 'mkv': return 'i-lucide-file-video'
    case 'mp3': case 'wav': case 'ogg': case 'flac': return 'i-lucide-file-audio'
    case 'ts': case 'js': case 'py': case 'json': case 'html': case 'css': return 'i-lucide-file-code'
    default: return 'i-lucide-file'
  }
}

// Fetch authenticated images in HTML body (Graph API hosted content)
const messageBodyRef = ref<HTMLElement>()

async function loadAuthImages() {
  const container = messageBodyRef.value
  if (!container) return

  const imgs = container.querySelectorAll<HTMLImageElement>('img')
  const authImgs = Array.from(imgs).filter((img) => {
    const src = img.getAttribute('src') || ''
    return (src.includes('graph.microsoft.com') || src.includes('.asm.skype.com')) && !src.startsWith('blob:')
  })
  if (!authImgs.length) return

  const tokenValue = await getToken()

  for (const img of authImgs) {
    const src = img.getAttribute('src') || ''
    try {
      const res = await fetch(src, {
        headers: { Authorization: `Bearer ${tokenValue}` },
      })
      if (res.ok) {
        const blob = await res.blob()
        img.src = URL.createObjectURL(blob)
      }
    }
    catch {
      // Failed to load — leave original src
    }
  }
}

watch([messageBodyRef, () => props.message.id], () => {
  nextTick(loadAuthImages)
}, { flush: 'post' })
</script>

<template>
  <div
    class="group relative flex gap-2 px-5 py-0.5 hover:bg-(--ui-bg-elevated)/50 transition-colors"
    :class="isConsecutive ? 'pt-0' : 'pt-2'"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
  >
    <!-- Avatar column: either show avatar or empty spacer for alignment -->
    <div class="w-9 shrink-0 pt-0.5">
      <template v-if="!isConsecutive">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="senderName"
          class="size-9 rounded-md object-cover"
        >
        <div
          v-else
          class="size-9 rounded-md bg-(--ui-bg-elevated) flex items-center justify-center text-sm font-medium text-(--ui-text-muted)"
        >
          {{ senderName.charAt(0) }}
        </div>
      </template>
      <!-- Consecutive: show timestamp on hover in the avatar column -->
      <template v-else>
        <span
          class="hidden group-hover:flex items-center justify-center text-[10px] text-(--ui-text-dimmed) h-5 leading-none select-none"
        >
          {{ formattedTime }}
        </span>
      </template>
    </div>

    <!-- Message content column -->
    <div class="min-w-0 flex-1">
      <!-- Name + timestamp header (only for first message in group) -->
      <div v-if="!isConsecutive" class="flex items-baseline gap-2 mb-0.5">
        <span class="text-[15px] font-bold text-(--ui-text-highlighted) leading-snug">{{ senderName }}</span>
        <span class="text-xs text-(--ui-text-dimmed) leading-snug">{{ formattedTime }}</span>
      </div>

      <!-- Message body -->
      <div ref="messageBodyRef" class="text-[15px] leading-relaxed text-(--ui-text)">
        <div v-if="message.body.contentType === 'html'" v-html="message.body.content" />
        <span v-else>{{ message.body.content }}</span>
      </div>

      <!-- File attachments -->
      <div v-if="fileAttachments.length" class="flex flex-col gap-1.5 mt-2">
        <a
          v-for="att in fileAttachments"
          :key="att.id"
          :href="att.contentUrl!"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)/50 hover:bg-(--ui-bg-elevated) transition-colors max-w-sm"
        >
          <UIcon :name="fileIcon(att.name)" class="size-5 text-(--ui-text-muted) shrink-0" />
          <span class="text-[13px] font-medium text-(--ui-text-highlighted) truncate">{{ att.name ?? 'Attachment' }}</span>
          <UIcon name="i-lucide-external-link" class="size-3.5 text-(--ui-text-dimmed) shrink-0 ml-auto" />
        </a>
      </div>

      <!-- Reactions -->
      <div v-if="groupedReactions.length" class="flex flex-wrap gap-1.5 mt-2">
        <button
          v-for="reaction in groupedReactions"
          :key="reaction.type"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs cursor-pointer hover:bg-(--ui-bg-elevated) transition-colors"
          :class="reaction.hasMyReaction ? 'border-indigo-400 bg-indigo-500/10' : 'border-(--ui-border) bg-(--ui-bg)'"
          @click="emit('react', message, reaction.type)"
        >
          <span>{{ reactionEmoji(reaction.type) }}</span>
          <span v-if="reaction.count > 1" class="text-(--ui-text-muted) text-[11px] font-medium">{{ reaction.count }}</span>
        </button>
      </div>

      <!-- Thread indicator (channels only) -->
      <button
        v-if="isChannel && replyCount > 0"
        class="flex items-center gap-1.5 mt-2 px-2 py-1 -mx-2 rounded-md text-[13px] text-indigo-400 hover:text-indigo-300 hover:bg-(--ui-bg-elevated) cursor-pointer transition-colors"
        @click="emit('reply', message)"
      >
        <UIcon name="i-lucide-message-square" class="size-4" />
        <span class="font-semibold">{{ replyCount }} {{ replyCount === 1 ? 'reply' : 'replies' }}</span>
      </button>
    </div>

    <!-- Floating hover action bar -->
    <Transition name="actions-fade">
      <div
        v-if="!hideActions && (showActions || reactionPickerOpen)"
        class="absolute -top-3 right-5 z-10 flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-(--ui-border) bg-(--ui-bg) shadow-sm"
      >
        <UPopover v-model:open="reactionPickerOpen">
          <UTooltip text="React" :delay-duration="300">
            <UButton
              icon="i-lucide-smile-plus"
              variant="ghost"
              color="neutral"
              size="xs"
              square
            />
          </UTooltip>
          <template #content>
            <div class="flex items-center gap-0.5 p-1">
              <button
                v-for="r in reactionTypes"
                :key="r.type"
                class="size-8 flex items-center justify-center rounded-md text-lg hover:bg-(--ui-bg-elevated) transition-colors cursor-pointer"
                @click="selectReaction(r.type)"
              >
                {{ r.emoji }}
              </button>
            </div>
          </template>
        </UPopover>
        <UTooltip v-if="isChannel" text="Reply in thread" :delay-duration="300">
          <UButton
            icon="i-lucide-message-square"
            variant="ghost"
            color="neutral"
            size="xs"
            square
            @click="emit('reply', message)"
          />
        </UTooltip>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Hide empty <attachment> tags rendered from Teams HTML body */
:deep(attachment) {
  display: none;
}

/* Constrain inline images from v-html content */
:deep(img) {
  max-width: 100%;
  max-height: 400px;
  border-radius: 0.5rem;
  object-fit: contain;
}

.actions-fade-enter-active,
.actions-fade-leave-active {
  transition: opacity 0.1s ease;
}
.actions-fade-enter-from,
.actions-fade-leave-to {
  opacity: 0;
}
</style>
