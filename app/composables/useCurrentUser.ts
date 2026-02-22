export function useCurrentUser() {
  const { user } = useOidcAuth()

  // Entra ID 'oid' claim (object ID) matches Graph API user IDs.
  // Requires optionalClaims: ['oid'] in nuxt.config.ts entra provider.
  const currentUserId = computed<string>(() => {
    return (user.value?.claims?.oid as string) ?? ''
  })

  return { currentUserId }
}
