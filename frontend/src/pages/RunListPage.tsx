import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { apiClient } from '../lib/apiClient'
import type { RunSummary } from '../lib/types'

export function RunListPage() {
  const { id = '' } = useParams()
  const runs = useQuery({
    queryKey: ['runs', 'prompt', id],
    queryFn: () => apiClient.get<RunSummary[]>(`/api/prompts/${id}/runs`),
  })

  return (
    <>
      <PageHeader
        title="Runs"
        back={{ to: `/prompts/${id}`, label: 'Back to history' }}
      />
      {runs.isPending && <Loading />}
      {runs.isError && <LoadError>Could not load runs.</LoadError>}
      {runs.data && runs.data.length === 0 && (
        <EmptyState>No runs yet.</EmptyState>
      )}
      {runs.data && runs.data.length > 0 && (
        <ul>
          {runs.data.map((run) => (
            <li key={run.runId}>
              <Link to={`/prompts/${id}/runs/${run.runId}`}>
                v{run.versionNumber} — {run.status}
              </Link>
              {run.responsePreview && <span> — {run.responsePreview}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
