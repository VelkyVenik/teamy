export function useGraphToken() {
  const { getAccessToken } = useAuth()

  async function getToken(): Promise<string> {
    return await getAccessToken()
  }

  return { getToken }
}
