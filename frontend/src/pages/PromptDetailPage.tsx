import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { apiClient } from '../lib/apiClient'
import type { PromptDetail, RunSummary } from '../lib/types'

export function PromptDetailPage() {
  const { id = '' } = useParams()
  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptDetail>(`/api/prompts/${id}`),
  })
  const runs = useQuery({
    queryKey: ['runs', 'prompt', id],
    queryFn: () => apiClient.get<RunSummary[]>(`/api/prompts/${id}/runs`),
  })

  return (
    <main>
      <p>
        <Link to="/">Back to prompts</Link>
      </p>
      <h1>Version history</h1>
      {prompt.isPending && <p>Loading…</p>}
      {prompt.isError && <p>Could not load this prompt.</p>}
      {prompt.data && (
        <ul>
          {prompt.data.versions.map((version) => (
            <li key={version.versionId}>
              <Link to={`/prompts/${id}/versions/${version.number}`}>
                {version.name} (v{version.number})
              </Link>
              {version.current && <span> — current</span>}{' '}
              <Link to={`/prompts/${id}/versions/${version.number}/run`}>
                Run
              </Link>{' '}
              <Link to={`/prompts/${id}/versions/${version.number}/edit`}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Runs</h2>
      {runs.data && runs.data.length === 0 && <p>No runs yet.</p>}
      {runs.data && runs.data.length > 0 && (
        <ul>
          {runs.data.map((run) => (
            <li key={run.runId}>
              <Link to={`/runs/${run.runId}`}>
                v{run.versionNumber} — {run.status}
              </Link>
              {run.responsePreview && <span> — {run.responsePreview}</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
