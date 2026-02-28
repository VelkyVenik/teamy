<script setup lang="ts">
import type { PendingImage } from '~/types/graph'

const MAX_IMAGE_SIZE = 4 * 1024 * 1024 // 4 MB

const props = defineProps<{
  loading?: boolean
  placeholder?: string
  draftKey?: string
}>()

const emit = defineEmits<{
  send: [content: string, images: PendingImage[]]
}>()

const drafts = useState<Record<string, string>>('compose-drafts', () => ({}))

const content = computed({
  get: () => props.draftKey ? (drafts.value[props.draftKey] ?? '') : '',
  set: (val: string) => {
    if (props.draftKey) drafts.value[props.draftKey] = val
  },
})
const textareaRef = ref<{ textareaRef?: HTMLTextAreaElement }>()
const pendingImages = ref<PendingImage[]>([])
const isDragging = ref(false)

// Plugin slash commands
const commandOutput = ref<string | null>(null)
const availableCommands = computed(() => getRegisteredCommands())
const matchingCommands = computed(() => {
  const text = content.value.trim()
  if (!text.startsWith('/')) return []
  const typed = text.split(/\s/)[0]!.slice(1).toLowerCase()
  return availableCommands.value.filter(cmd => cmd.name.toLowerCase().startsWith(typed))
})

function selectCommand(name: string) {
  const parts = content.value.trim().split(/\s+/)
  parts[0] = `/${name}`
  content.value = parts.join(' ') + (parts.length === 1 ? ' ' : '')
  nextTick(() => textareaRef.value?.textareaRef?.focus())
}

function addImages(files: File[]) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    if (file.size > MAX_IMAGE_SIZE) continue
    pendingImages.value.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      mimeType: file.type,
    })
  }
}

function removeImage(id: string) {
  const idx = pendingImages.value.findIndex(i => i.id === id)
  if (idx !== -1) {
    URL.revokeObjectURL(pendingImages.value[idx].previewUrl)
    pendingImages.value.splice(idx, 1)
  }
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }

  if (imageFiles.length > 0) {
    e.preventDefault()
    addImages(imageFiles)
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  addImages(files)
}

async function handleSend() {
  const text = content.value.trim()
  if (!text && pendingImages.value.length === 0) return
  if (props.loading) return

  // Try to execute as plugin slash command
  if (text.startsWith('/') && pendingImages.value.length === 0) {
    const spaceIdx = text.indexOf(' ')
    const cmdName = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx)
    const cmdArg = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1)
    const { executed, result } = await executeCommand(cmdName, cmdArg)
    if (executed) {
      content.value = ''
      commandOutput.value = result || `/${cmdName} executed`
      setTimeout(() => { commandOutput.value = null }, 15000)
      nextTick(() => textareaRef.value?.textareaRef?.focus())
      return
    }
  }

  const images = [...pendingImages.value]
  emit('send', text, images)
  content.value = ''
  // Revoke blob URLs for sent images
  for (const img of pendingImages.value) {
    URL.revokeObjectURL(img.previewUrl)
  }
  pendingImages.value = []
  nextTick(() => {
    textareaRef.value?.textareaRef?.focus()
  })
}

function handleInput() {
  const val = content.value
  if (!val) return
  const last = val[val.length - 1]
  if (last !== ' ' && last !== '\n') return

  const replaced = replaceEmoticons(val)
  if (replaced === val) return

  const ta = textareaRef.value?.textareaRef
  const cursorPos = ta?.selectionStart ?? val.length
  const diff = replaced.length - val.length

  content.value = replaced

  nextTick(() => {
    ta?.setSelectionRange(cursorPos + diff, cursorPos + diff)
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

const hasContent = computed(() => content.value.trim().length > 0 || pendingImages.value.length > 0)

function focus() {
  textareaRef.value?.textareaRef?.focus()
}

watch(() => props.draftKey, () => {
  nextTick(() => focus())
})

onMounted(() => {
  nextTick(() => focus())
})

defineExpose({ focus })

onUnmounted(() => {
  for (const img of pendingImages.value) {
    URL.revokeObjectURL(img.previewUrl)
  }
})
</script>

<template>
  <div class="px-5 pb-4 pt-1">
    <div
      class="rounded-lg border bg-(--ui-bg) px-3 py-2 transition-colors"
      :class="isDragging ? 'border-primary-400 bg-primary-50/5' : 'border-(--ui-border)'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <!-- Plugin command output -->
      <div v-if="commandOutput" class="mb-2 flex items-start gap-2 px-1 py-2 rounded-md bg-(--ui-bg-elevated) border border-(--ui-border) text-sm text-(--ui-text)">
        <UIcon name="i-lucide-puzzle" class="size-4 text-(--ui-primary) shrink-0 mt-0.5" />
        <p class="flex-1 whitespace-pre-wrap">{{ commandOutput }}</p>
        <button class="text-(--ui-text-dimmed) hover:text-(--ui-text) shrink-0" @click="commandOutput = null">
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>

      <!-- Plugin command suggestions -->
      <div v-if="matchingCommands.length > 0" class="mb-2">
        <div class="flex flex-wrap gap-1">
          <button
            v-for="cmd in matchingCommands"
            :key="cmd.name"
            class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-(--ui-bg-elevated) hover:bg-(--ui-bg-elevated)/80 border border-(--ui-border) text-(--ui-text) cursor-pointer transition-colors"
            @click="selectCommand(cmd.name)"
          >
            <UIcon name="i-lucide-puzzle" class="size-3 text-(--ui-text-muted)" />
            <span class="font-medium">/{{ cmd.name }}</span>
            <span class="text-(--ui-text-dimmed)">{{ cmd.description }}</span>
          </button>
        </div>
      </div>

      <!-- Image previews -->
      <div v-if="pendingImages.length" class="flex flex-wrap gap-2 mb-2">
        <div
          v-for="img in pendingImages"
          :key="img.id"
          class="relative group"
        >
          <img
            :src="img.previewUrl"
            class="h-16 rounded-md object-cover"
          >
          <button
            class="absolute -top-1.5 -right-1.5 size-5 flex items-center justify-center rounded-full bg-(--ui-bg-inverted) text-(--ui-text-inverted) opacity-0 group-hover:opacity-100 transition-opacity text-xs"
            @click="removeImage(img.id)"
          >
            &times;
          </button>
        </div>
      </div>

      <div class="flex items-end gap-2">
        <UTextarea
          ref="textareaRef"
          v-model="content"
          :placeholder="placeholder ?? 'Type a message...'"
          autoresize
          :rows="1"
          :maxrows="6"
          :ui="{
            root: 'flex-1',
            base: 'border-0 shadow-none ring-0 focus:ring-0 focus-visible:ring-0 outline-none focus:outline-none bg-transparent resize-none text-[15px] py-0.5 px-0',
          }"
          class="flex-1"
          @keydown="handleKeydown"
          @paste="handlePaste"
          @input="handleInput"
        />
        <UButton
          icon="i-lucide-send-horizontal"
          :color="hasContent ? 'primary' : 'neutral'"
          :variant="hasContent ? 'solid' : 'ghost'"
          size="xs"
          square
          :loading="loading"
          :disabled="!hasContent"
          @click="handleSend"
        />
      </div>
    </div>
  </div>
</template>
