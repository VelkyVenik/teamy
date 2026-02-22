import type { PaginatedResponse, Person } from '~/types/graph'

export function useSearch() {
  const { graphFetch } = useGraph()
  const results = ref<Person[]>([])
  const loading = ref(false)

  async function searchPeople(query: string) {
    if (query.length < 2) {
      results.value = []
      return
    }

    loading.value = true
    try {
      const response = await graphFetch<PaginatedResponse<Person>>('/me/people', {
        params: {
          $search: `"${query}"`,
          $top: '10',
          $select: 'id,displayName,scoredEmailAddresses,userPrincipalName',
        },
      })
      results.value = response.value
    }
    catch (err: any) {
      console.error('[useSearch] searchPeople failed:', err)
      results.value = []
    }
    finally {
      loading.value = false
    }
  }

  return { results, loading, searchPeople }
}
