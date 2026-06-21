import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { apiClient } from '../lib/apiClient'
import type { PromptDetail } from '../lib/types'

export function PromptDetailPage() {
  const { id = '' } = useParams()
  const { data, isPending, isError } = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptDetail>(`/api/prompts/${id}`),
  })

  return (
    <main>
      <p>
        <Link to="/">Back to prompts</Link>
      </p>
      <h1>Version history</h1>
      {isPending && <p>Loading…</p>}
      {isError && <p>Could not load this prompt.</p>}
      {data && (
        <ul>
          {data.versions.map((version) => (
            <li key={version.versionId}>
              <Link to={`/prompts/${id}/versions/${version.number}`}>
                {version.name} (v{version.number})
              </Link>
              {version.current && <span> — current</span>}{' '}
              <Link to={`/prompts/${id}/versions/${version.number}/edit`}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
