<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { loggedIn, login } = useAuth()
const loading = ref(false)
const error = ref<string | null>(null)

async function handleLogin() {
  loading.value = true
  error.value = null
  try {
    await login()
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    console.error('[Login] Failed:', err)
  }
  finally {
    loading.value = false
  }
}

// Redirect to home if already authenticated
watch(loggedIn, (value) => {
  if (value) navigateTo('/')
}, { immediate: true })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-(--ui-bg)">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="text-center">
          <h1 class="text-2xl font-bold">
            Teamy
          </h1>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            Sign in with your Microsoft account
          </p>
        </div>
      </template>

      <div class="space-y-3">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
          :close-icon="'i-lucide-x'"
          @close="error = null"
        />

        <UButton
          block
          size="lg"
          icon="i-heroicons-arrow-right-end-on-rectangle"
          :loading="loading"
          @click="handleLogin"
        >
          Sign in with Microsoft
        </UButton>
      </div>
    </UCard>
  </div>
</template>
