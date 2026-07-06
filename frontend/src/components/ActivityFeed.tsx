import { useInfiniteQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import type { ActivityItem, Page } from '../lib/types'
import { EmptyState } from './EmptyState'
import { LoadError } from './LoadError'
import { LoadMoreButton } from './LoadMoreButton'
import { Loading } from './Loading'
import { SimpleList } from './SimpleList'

const RUN_STATUS_LABELS: Record<string, string> = {
  in_progress: 'in progress',
  completed: 'completed',
  failed: 'failed',
}

/** Type-appropriate wording for a single activity entry (ADR-0006: plain text, no links). */
function describeActivity(item: ActivityItem): string {
  switch (item.type) {
    case 'registered':
      return 'Registered'
    case 'logged_in':
      return 'Logged in'
    case 'api_key_set':
      return 'Saved API key'
    case 'name_changed':
      return `Renamed to "${item.label}"`
    case 'prompt_created':
      return `Created "${item.label}"`
    case 'version_saved':
      return `Saved version ${item.versionNumber} of "${item.label}"`
    case 'prompt_deleted':
      return `Deleted "${item.label}"`
    case 'prompt_restored':
      return `Restored "${item.label}"`
    case 'run_started': {
      const status = item.runStatus
        ? (RUN_STATUS_LABELS[item.runStatus] ?? item.runStatus)
        : null
      return `Started a run of "${item.label}"${status ? ` — ${status}` : ''}`
    }
    default:
      return item.label
  }
}

/** "Recent activity" section on ProfilePage (ADR-0006) — the User's own account history. */
export function ActivityFeed() {
  const activity = useInfiniteQuery({
    queryKey: ['activity'],
    queryFn: ({ pageParam }) =>
      apiClient.get<Page<ActivityItem>>(`/api/me/activity?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
  })
  const items = activity.data?.pages.flatMap((page) => page.items)

  return (
    <>
      {activity.isPending && <Loading />}
      {activity.isError && <LoadError>Could not load activity.</LoadError>}
      {items && items.length === 0 && <EmptyState>No activity yet.</EmptyState>}
      {items && items.length > 0 && (
        <SimpleList>
          {items.map((item) => (
            <li key={item.id}>
              <span>{describeActivity(item)}</span>{' '}
              <span>{new Date(item.occurredAt).toLocaleString()}</span>
            </li>
          ))}
        </SimpleList>
      )}
      <LoadMoreButton
        hasMore={activity.hasNextPage}
        isLoading={activity.isFetchingNextPage}
        onClick={() => activity.fetchNextPage()}
      />
    </>
  )
}
