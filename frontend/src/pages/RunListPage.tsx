import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { LoadError } from '../components/LoadError'
import { LoadMoreButton } from '../components/LoadMoreButton'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import type { Page, RunSummary } from '../lib/types'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'in_progress', label: 'In progress' },
]

/**
 * Run history for either the whole Prompt (`/prompts/:id/runs`) or a single
 * Version (`/prompts/:id/versions/:number/runs`), depending on which route
 * rendered this page.
 */
export function RunListPage() {
  const { id = '', number: versionNumber } = useParams()
  const [status, setStatus] = useState('')
  const endpoint = versionNumber
    ? `/api/prompts/${id}/versions/${versionNumber}/runs`
    : `/api/prompts/${id}/runs`
  const runs = useInfiniteQuery({
    queryKey: versionNumber
      ? ['runs', 'version', id, versionNumber, status]
      : ['runs', 'prompt', id, status],
    queryFn: ({ pageParam }) =>
      apiClient.get<Page<RunSummary>>(
        status
          ? `${endpoint}?status=${status}&page=${pageParam}`
          : `${endpoint}?page=${pageParam}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
  })
  const runItems = runs.data?.pages.flatMap((page) => page.items)

  return (
    <>
      <PromptTabs promptId={id} versionNumber={versionNumber} />
      <PageHeader
        title={
          versionNumber ? `Run History — v${versionNumber}` : 'Run History'
        }
      />
      <label>
        Status
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {runs.isPending && <Loading />}
      {runs.isError && <LoadError>Could not load runs.</LoadError>}
      {runItems && runItems.length === 0 && (
        <EmptyState>
          {status ? 'No runs match this filter.' : 'No runs yet.'}
        </EmptyState>
      )}
      {runItems && runItems.length > 0 && (
        <ul>
          {runItems.map((run) => (
            <li key={run.runId}>
              <Link to={`/prompts/${id}/runs/${run.runId}`}>
                v{run.versionNumber} — {run.status}
              </Link>
              <span>{new Date(run.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <LoadMoreButton
        hasMore={runs.hasNextPage}
        isLoading={runs.isFetchingNextPage}
        onClick={() => runs.fetchNextPage()}
      />
    </>
  )
}
