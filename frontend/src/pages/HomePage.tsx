import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
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
        <nav>
          <Link to="/settings/api-key">API key</Link>
        </nav>
        <LogoutButton />
      </header>
      <p>
        <Link to="/prompts/new">New prompt</Link>
      </p>
      {isPending && <p>Loading…</p>}
      {isError && <p>Could not load prompts.</p>}
      {data && data.length === 0 && <p>No prompts yet.</p>}
      {data && data.length > 0 && (
        <ul>
          {data.map((prompt) => (
            <li key={prompt.promptId}>
              <Link to={`/prompts/${prompt.promptId}`}>{prompt.name}</Link> (v
              {prompt.currentVersionNumber})
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
