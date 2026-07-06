import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('usage section', () => {
  const meHandler = http.get('/api/me', () =>
    HttpResponse.json({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'usage@example.com',
      name: 'Usage User',
    }),
  )
  const apiKeyHandler = http.get('/api/me/api-key', () =>
    HttpResponse.json({ hasKey: false, updatedAt: null }),
  )
  const activityHandler = http.get('/api/me/activity', () =>
    HttpResponse.json({ items: [], hasMore: false }),
  )

  it('renders per-model token totals', async () => {
    setToken('t')
    server.use(
      meHandler,
      apiKeyHandler,
      activityHandler,
      http.get('/api/me/usage', () =>
        HttpResponse.json([
          { model: 'claude-opus-4-8', inputTokens: 150, outputTokens: 300 },
          { model: 'claude-haiku-4-5', inputTokens: 20, outputTokens: 40 },
        ]),
      ),
    )

    renderApp('/profile')

    expect(await screen.findByText(/claude-opus-4-8/)).toBeInTheDocument()
    expect(screen.getByText(/150 input tokens/)).toBeInTheDocument()
    expect(screen.getByText(/300 output tokens/)).toBeInTheDocument()
    expect(screen.getByText(/claude-haiku-4-5/)).toBeInTheDocument()
    expect(screen.getByText(/20 input tokens/)).toBeInTheDocument()
    expect(screen.getByText(/40 output tokens/)).toBeInTheDocument()
  })

  it('shows an empty state for a user with no runs', async () => {
    setToken('t')
    server.use(
      meHandler,
      apiKeyHandler,
      activityHandler,
      http.get('/api/me/usage', () => HttpResponse.json([])),
    )

    renderApp('/profile')

    expect(await screen.findByText('No usage yet.')).toBeInTheDocument()
  })
})

describe('recent activity section', () => {
  const meHandler = http.get('/api/me', () =>
    HttpResponse.json({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'usage@example.com',
      name: 'Usage User',
    }),
  )
  const apiKeyHandler = http.get('/api/me/api-key', () =>
    HttpResponse.json({ hasKey: false, updatedAt: null }),
  )
  const usageHandler = http.get('/api/me/usage', () => HttpResponse.json([]))

  it('renders activity entries with their label and run status', async () => {
    setToken('t')
    server.use(
      meHandler,
      apiKeyHandler,
      usageHandler,
      http.get('/api/me/activity', () =>
        HttpResponse.json({
          items: [
            {
              id: '22222222-2222-2222-2222-222222222221',
              type: 'prompt_created',
              occurredAt: '2026-01-01T00:00:00Z',
              label: 'Weather Report',
            },
            {
              id: '22222222-2222-2222-2222-222222222222',
              type: 'run_started',
              occurredAt: '2026-01-02T00:00:00Z',
              label: 'Weather Report',
              versionNumber: 1,
              runStatus: 'completed',
            },
          ],
          hasMore: false,
        }),
      ),
    )

    renderApp('/profile')

    expect(
      await screen.findByText(/Created "Weather Report"/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Started a run of "Weather Report"/),
    ).toBeInTheDocument()
    expect(screen.getByText(/completed/)).toBeInTheDocument()
  })

  it('clicking "Load more" appends a second page of activity', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      meHandler,
      apiKeyHandler,
      usageHandler,
      http.get('/api/me/activity', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        return page === '1'
          ? HttpResponse.json({
              items: [
                {
                  id: '33333333-3333-3333-3333-333333333331',
                  type: 'registered',
                  occurredAt: '2026-01-01T00:00:00Z',
                  label: 'Usage User',
                },
              ],
              hasMore: true,
            })
          : HttpResponse.json({
              items: [
                {
                  id: '33333333-3333-3333-3333-333333333332',
                  type: 'logged_in',
                  occurredAt: '2026-01-02T00:00:00Z',
                  label: 'Usage User',
                },
              ],
              hasMore: false,
            })
      }),
    )

    renderApp('/profile')

    expect(await screen.findByText('Registered')).toBeInTheDocument()
    expect(screen.queryByText('Logged in')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Logged in')).toBeInTheDocument()
    expect(screen.getByText('Registered')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument()
  })

  it('shows an empty state when there is no activity', async () => {
    setToken('t')
    server.use(
      meHandler,
      apiKeyHandler,
      usageHandler,
      http.get('/api/me/activity', () =>
        HttpResponse.json({ items: [], hasMore: false }),
      ),
    )

    renderApp('/profile')

    expect(await screen.findByText('No activity yet.')).toBeInTheDocument()
  })
})
