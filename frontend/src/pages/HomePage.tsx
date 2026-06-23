import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { apiClient } from '../lib/apiClient'
import type { PromptSummary } from '../lib/types'

export function HomePage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => apiClient.get<PromptSummary[]>('/api/prompts'),
  })

  return (
    <>
      <PageHeader
        title="Your prompts"
        actions={
          <Link to="/prompts/new" className="button-link">
            New prompt
          </Link>
        }
      />
      {isPending && <Loading />}
      {isError && <LoadError>Could not load prompts.</LoadError>}
      {data && data.length === 0 && <EmptyState>No prompts yet.</EmptyState>}
      {data && data.length > 0 && (
        <ul>
          {data.map((prompt) => (
            <li key={prompt.promptId}>
              <Link to={`/prompts/${prompt.promptId}`}>{prompt.name}</Link>
              <span className="status status-current">
                (v{prompt.currentVersionNumber})
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
