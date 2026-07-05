import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AppIcon } from '../components/AppIcon'
import { EmptyState } from '../components/EmptyState'
import { LoadError } from '../components/LoadError'
import { LoadMoreButton } from '../components/LoadMoreButton'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { apiClient } from '../lib/apiClient'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import type { Page, PromptSummary } from '../lib/types'

export function HomePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search)
  const {
    data,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['prompts', q],
    queryFn: ({ pageParam }) =>
      apiClient.get<Page<PromptSummary>>(
        q
          ? `/api/prompts?q=${encodeURIComponent(q)}&page=${pageParam}`
          : `/api/prompts?page=${pageParam}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
  })
  const prompts = data?.pages.flatMap((page) => page.items)

  return (
    <>
      <PageHeader
        title={
          <span className="title-with-icon">
            <AppIcon className="app-icon" />
            Your Prompts
          </span>
        }
        actions={
          <Link to="/prompts/new" className="button-link button-link-sm">
            New Prompt
          </Link>
        }
      />
      <input
        type="search"
        aria-label="Search prompts"
        placeholder="Search prompts…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {isPending && <Loading />}
      {isError && <LoadError>Could not load prompts.</LoadError>}
      {prompts && prompts.length === 0 && (
        <EmptyState>
          {q ? 'No matches for this search.' : 'No prompts yet.'}
        </EmptyState>
      )}
      {prompts && prompts.length > 0 && (
        <ul className="prompt-grid">
          {prompts.map((prompt) => (
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
                  to={`/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}/run`}
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
                  to={`/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}`}
                  className="button-link button-link-sm button-link-outline"
                >
                  View
                </Link>
                <Link
                  to={`/prompts/${prompt.promptId}/versions/${prompt.currentVersionNumber}/edit`}
                  className="button-link button-link-sm button-link-outline"
                >
                  Edit
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      <LoadMoreButton
        hasMore={hasNextPage}
        isLoading={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />
    </>
  )
}
