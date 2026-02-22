export function useGraphToken() {
  const { user } = useOidcAuth()

  const token = computed<string | null>(() => {
    return user.value?.accessToken ?? null
  })

  return { token }
}
