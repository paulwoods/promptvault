import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { LogoutButton } from '../components/LogoutButton'
import type { PromptSummary } from '../lib/types'

export function HomePage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => apiClient.get<PromptSummary[]>('/api/prompts'),
  })

  return (
    <main>
      <header>
        <h1>Your prompts</h1>
        <LogoutButton />
      </header>
      {isPending && <p>Loading…</p>}
      {isError && <p>Could not load prompts.</p>}
      {data && <p>{data.length} prompt(s)</p>}
    </main>
  )
}
