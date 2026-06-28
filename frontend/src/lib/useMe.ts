import { useQuery } from '@tanstack/react-query'
import { apiClient } from './apiClient'
import type { Me } from './types'

/** The authenticated user's identity, served from /api/me — the source of truth for name/email. */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.get<Me>('/api/me'),
    enabled,
  })
}
