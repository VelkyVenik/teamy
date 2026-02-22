<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'

const colorMode = useColorMode()

const notificationSettings = reactive({
  enabled: true,
  sound: true,
  showPreview: true,
  dnd: false,
})

const appearanceSettings = reactive({
  fontSize: 'medium',
  compactMode: false,
})

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// Claude AI API key management
const claudeKeyStatus = ref<'loading' | 'stored' | 'not-stored'>('loading')
const claudeKeyInput = ref('')
const claudeKeySaving = ref(false)

async function checkClaudeKey() {
  try {
    const stored = await invoke<boolean>('has_claude_api_key')
    claudeKeyStatus.value = stored ? 'stored' : 'not-stored'
  }
  catch {
    claudeKeyStatus.value = 'not-stored'
  }
}

async function saveClaudeKey() {
  if (!claudeKeyInput.value.trim()) return
  claudeKeySaving.value = true
  try {
    await invoke('keychain_store', { key: 'anthropic-api-key', value: claudeKeyInput.value.trim() })
    claudeKeyStatus.value = 'stored'
    claudeKeyInput.value = ''
  }
  finally {
    claudeKeySaving.value = false
  }
}

async function removeClaudeKey() {
  await invoke('keychain_delete', { key: 'anthropic-api-key' })
  claudeKeyStatus.value = 'not-stored'
}

onMounted(() => {
  checkClaudeKey()
})
</script>

<template>
  <NuxtLayout>
    <template #sidebar>
      <div class="flex flex-col h-full">
        <div class="flex items-center gap-2 px-3 pt-3 pb-2">
          <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="xs" to="/" />
          <h1 class="text-lg font-semibold text-(--ui-text-highlighted)">Settings</h1>
        </div>
        <nav class="flex-1 px-2 py-2 space-y-0.5">
          <button class="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm bg-(--ui-color-primary-50) dark:bg-(--ui-color-primary-950) text-(--ui-color-primary-500)">
            <UIcon name="i-lucide-settings" class="size-4" />
            General
          </button>
          <button class="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)/60">
            <UIcon name="i-lucide-bell" class="size-4" />
            Notifications
          </button>
          <button class="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)/60">
            <UIcon name="i-lucide-palette" class="size-4" />
            Appearance
          </button>
          <button class="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)/60">
            <UIcon name="i-lucide-puzzle" class="size-4" />
            Plugins
          </button>
        </nav>
      </div>
    </template>

    <template #default>
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-xl mx-auto px-6 py-8 space-y-8">
          <!-- Appearance -->
          <section>
            <h2 class="text-base font-semibold mb-4 text-(--ui-text-highlighted)">Appearance</h2>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Dark mode</p>
                  <p class="text-xs text-(--ui-text-muted)">Toggle between light and dark theme</p>
                </div>
                <USwitch
                  :model-value="colorMode.value === 'dark'"
                  @update:model-value="toggleColorMode"
                />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Compact mode</p>
                  <p class="text-xs text-(--ui-text-muted)">Reduce spacing in message lists</p>
                </div>
                <USwitch v-model="appearanceSettings.compactMode" />
              </div>
            </div>
          </section>

          <USeparator />

          <!-- Notifications -->
          <section>
            <h2 class="text-base font-semibold mb-4 text-(--ui-text-highlighted)">Notifications</h2>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Enable notifications</p>
                  <p class="text-xs text-(--ui-text-muted)">Show desktop notifications for new messages</p>
                </div>
                <USwitch v-model="notificationSettings.enabled" />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Notification sound</p>
                  <p class="text-xs text-(--ui-text-muted)">Play a sound when receiving notifications</p>
                </div>
                <USwitch v-model="notificationSettings.sound" />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Show message preview</p>
                  <p class="text-xs text-(--ui-text-muted)">Show message content in notifications</p>
                </div>
                <USwitch v-model="notificationSettings.showPreview" />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">Do not disturb</p>
                  <p class="text-xs text-(--ui-text-muted)">Mute all notifications</p>
                </div>
                <USwitch v-model="notificationSettings.dnd" />
              </div>
            </div>
          </section>

          <USeparator />

          <!-- Claude AI -->
          <section>
            <h2 class="text-base font-semibold mb-4 text-(--ui-text-highlighted)">Claude AI</h2>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium">API Key</p>
                  <p class="text-xs text-(--ui-text-muted)">
                    <template v-if="claudeKeyStatus === 'loading'">Checking...</template>
                    <template v-else-if="claudeKeyStatus === 'stored'">Key stored in Keychain</template>
                    <template v-else>No key stored</template>
                  </p>
                </div>
                <UBadge
                  v-if="claudeKeyStatus !== 'loading'"
                  :color="claudeKeyStatus === 'stored' ? 'success' : 'neutral'"
                  variant="subtle"
                >
                  {{ claudeKeyStatus === 'stored' ? 'Active' : 'Not set' }}
                </UBadge>
              </div>
              <div class="flex gap-2">
                <UInput
                  v-model="claudeKeyInput"
                  type="password"
                  :placeholder="claudeKeyStatus === 'stored' ? 'Enter new key to update...' : 'Enter Anthropic API key...'"
                  class="flex-1"
                  size="sm"
                />
                <UButton
                  size="sm"
                  :loading="claudeKeySaving"
                  :disabled="!claudeKeyInput.trim()"
                  @click="saveClaudeKey"
                >
                  Save
                </UButton>
              </div>
              <UButton
                v-if="claudeKeyStatus === 'stored'"
                variant="soft"
                color="error"
                size="xs"
                @click="removeClaudeKey"
              >
                Remove API key
              </UButton>
            </div>
          </section>

          <USeparator />

          <!-- Keyboard Shortcuts -->
          <section>
            <h2 class="text-base font-semibold mb-4 text-(--ui-text-highlighted)">Keyboard Shortcuts</h2>
            <div class="space-y-2">
              <div class="flex items-center justify-between py-1">
                <span class="text-sm">Quick switch</span>
                <div class="flex items-center gap-0.5">
                  <UKbd value="meta" />
                  <UKbd value="K" />
                </div>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm">Toggle Claude panel</span>
                <div class="flex items-center gap-0.5">
                  <UKbd value="meta" />
                  <UKbd value="J" />
                </div>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-sm">Settings</span>
                <div class="flex items-center gap-0.5">
                  <UKbd value="meta" />
                  <UKbd value="," />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </NuxtLayout>
</template>
