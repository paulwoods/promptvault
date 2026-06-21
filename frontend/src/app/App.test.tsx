import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { getToken, setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('app shell', () => {
  it('attaches the bearer token to authenticated requests', async () => {
    setToken('test-token')
    let authHeader: string | null = null
    server.use(
      http.get('/api/prompts', ({ request }) => {
        authHeader = request.headers.get('Authorization')
        return HttpResponse.json([])
      }),
    )

    renderApp('/')

    await screen.findByRole('heading', { name: 'Your prompts' })
    expect(authHeader).toBe('Bearer test-token')
  })

  it('clears the token and routes to login on a 401', async () => {
    setToken('expired-token')
    server.use(
      http.get('/api/prompts', () =>
        HttpResponse.json(
          { error: 'unauthorized', message: 'nope' },
          { status: 401 },
        ),
      ),
    )

    renderApp('/')

    await screen.findByRole('heading', { name: 'Log in' })
    expect(getToken()).toBeNull()
  })

  it('redirects to login when there is no token', async () => {
    renderApp('/')

    await screen.findByRole('heading', { name: 'Log in' })
  })
})
