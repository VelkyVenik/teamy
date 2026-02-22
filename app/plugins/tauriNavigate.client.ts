export default defineNuxtPlugin(() => {
  if (!window.__TAURI__) return

  const router = useRouter()

  import('@tauri-apps/api/event').then(({ listen }) => {
    listen<string>('navigate', (event) => {
      router.push(event.payload)
    })
  })
})
