import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { apiClient } from '../lib/apiClient'
import type { PromptSummary } from '../lib/types'

export function HomePage() {
  const navigate = useNavigate()
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
        <ul className="prompt-grid">
          {data.map((prompt) => (
            <li
              key={prompt.promptId}
              className="prompt-card"
              role="button"
              tabIndex={0}
              aria-label={`Run ${prompt.name}`}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, button')) return
                navigate(
                  `/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}/run`,
                )
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(
                    `/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}/run`,
                  )
                }
              }}
            >
              <div className="prompt-card-header">
                <Link
                  to={`/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}`}
                >
                  {prompt.name}
                </Link>
                <Link
                  to={`/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}/run`}
                  className="button-link button-link-sm"
                >
                  Run
                </Link>
              </div>
              {prompt.description && (
                <p className="prompt-card-description">{prompt.description}</p>
              )}
              <span className="row-actions">
                <Link
                  to={`/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}/edit`}
                  className="button-link button-link-sm button-link-outline"
                >
                  Edit
                </Link>
                <Link
                  to={`/prompts/${prompt.promptId}`}
                  className="button-link button-link-sm button-link-outline"
                >
                  Versions
                </Link>
                <Link
                  to={`/prompts/${prompt.promptId}/runs`}
                  className="button-link button-link-sm button-link-outline"
                >
                  Runs
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
