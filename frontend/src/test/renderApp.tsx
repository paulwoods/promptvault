import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '../app/AppRoutes'
import { createQueryClient } from '../app/queryClient'

/** Renders the app's routes under a fresh query client and an in-memory router. */
export function renderApp(initialPath = '/') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
