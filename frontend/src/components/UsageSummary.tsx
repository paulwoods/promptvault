import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import type { ModelUsage } from '../lib/types'
import { EmptyState } from './EmptyState'
import { LoadError } from './LoadError'
import { Loading } from './Loading'
import { SimpleList } from './SimpleList'

/** Read-only, all-time token totals per model (ADR-0005: token counts, no dollar cost). */
export function UsageSummary() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['usage'],
    queryFn: () => apiClient.get<ModelUsage[]>('/api/me/usage'),
  })

  return (
    <>
      {isPending && <Loading />}
      {isError && <LoadError>Could not load usage.</LoadError>}
      {data && data.length === 0 && <EmptyState>No usage yet.</EmptyState>}
      {data && data.length > 0 && (
        <SimpleList>
          {data.map((usage) => (
            <li key={usage.model}>
              {usage.model}: {usage.inputTokens} input tokens,{' '}
              {usage.outputTokens} output tokens
            </li>
          ))}
        </SimpleList>
      )}
    </>
  )
}
