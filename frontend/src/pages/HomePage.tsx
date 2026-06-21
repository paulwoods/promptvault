import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import type { PromptSummary } from '../lib/types'

export function HomePage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => apiClient.get<PromptSummary[]>('/api/prompts'),
  })

  if (isPending) {
    return <p>Loading…</p>
  }
  if (isError) {
    return <p>Could not load prompts.</p>
  }

  return (
    <main>
      <h1>Your prompts</h1>
      <p>{data.length} prompt(s)</p>
    </main>
  )
}
