<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { loggedIn, login } = useOidcAuth()
const loading = ref(false)

async function handleLogin() {
  loading.value = true
  try {
    await login('entra')
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

      <UButton
        block
        size="lg"
        icon="i-heroicons-arrow-right-end-on-rectangle"
        :loading="loading"
        @click="handleLogin"
      >
        Sign in with Microsoft
      </UButton>
    </UCard>
  </div>
</template>
