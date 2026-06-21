import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('api key screen', () => {
  it('shows that a key is set without revealing it', async () => {
    setToken('t')
    server.use(
      http.get('/api/me/api-key', () =>
        HttpResponse.json({ hasKey: true, updatedAt: '2026-01-01T00:00:00Z' }),
      ),
    )

    renderApp('/settings/api-key')

    expect(await screen.findByText('A key is set')).toBeInTheDocument()
  })

  it('shows when no key is set', async () => {
    setToken('t')
    server.use(
      http.get('/api/me/api-key', () =>
        HttpResponse.json({ hasKey: false, updatedAt: null }),
      ),
    )

    renderApp('/settings/api-key')

    expect(await screen.findByText('No key set')).toBeInTheDocument()
  })

  it('saves a key and reflects the new status without displaying the plaintext', async () => {
    const user = userEvent.setup()
    setToken('t')
    let hasKey = false
    server.use(
      http.get('/api/me/api-key', () =>
        HttpResponse.json({
          hasKey,
          updatedAt: hasKey ? '2026-01-01T00:00:00Z' : null,
        }),
      ),
      http.put('/api/me/api-key', () => {
        hasKey = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderApp('/settings/api-key')
    await screen.findByText('No key set')
    await user.type(
      screen.getByLabelText('Anthropic API key'),
      'sk-ant-secret-123',
    )
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('A key is set')).toBeInTheDocument()
    // The plaintext key is never shown anywhere on the page.
    expect(screen.queryByText('sk-ant-secret-123')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('sk-ant-secret-123')
  })
})
