import { useQuery } from '@tanstack/react-query'
import { apiClient } from './apiClient'
import type { AuthConfig } from './types'

/**
 * Public auth configuration, read before login. It is delivered at runtime
 * rather than baked into the bundle because the SPA is built inside its Docker
 * image (ADR-0011), and it never changes while the page is open.
 */
export function useAuthConfig() {
  return useQuery({
    queryKey: ['authConfig'],
    queryFn: () => apiClient.get<AuthConfig>('/api/auth/config'),
    staleTime: Infinity,
  })
}
