import { screen } from '@testing-library/react'
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

  it('renders per-model token totals', async () => {
    setToken('t')
    server.use(
      meHandler,
      apiKeyHandler,
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
      http.get('/api/me/usage', () => HttpResponse.json([])),
    )

    renderApp('/profile')

    expect(await screen.findByText('No usage yet.')).toBeInTheDocument()
  })
})
