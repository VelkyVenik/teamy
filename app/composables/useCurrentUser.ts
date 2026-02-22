export function useCurrentUser() {
  const { account } = useAuth()

  const currentUserId = computed<string>(() => {
    return account.value?.localAccountId ?? ''
  })

  return { currentUserId }
}
