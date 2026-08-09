import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

function promptResponse(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p1',
    name: 'Original',
    description: null,
    promptText: 'Hello',
    model: 'claude-opus-4-8',
    systemPrompt: null,
    maxTokens: 1000,
    effort: 'medium',
    thinking: 'off',
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  }
}

describe('duplicate prompt', () => {
  it('pre-fills the form with the source prompt content', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json(
          promptResponse({
            description: 'Original description',
            promptText: 'Hello {{name}}',
          }),
        ),
      ),
    )

    renderApp('/prompts/p1/duplicate')

    const nameField = await screen.findByLabelText('Name')
    expect(nameField).toHaveValue('Original')
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Original description',
    )
    expect(screen.getByLabelText('User Prompt')).toHaveValue('Hello {{name}}')
  })

  it('saving creates a new, independent prompt without altering the source', async () => {
    const user = userEvent.setup()
    setToken('t')

    server.use(
      http.get('/api/prompts/p1', () => HttpResponse.json(promptResponse())),
      // The duplicate must POST to /api/prompts (create), never PUT to
      // /api/prompts/p1 (overwrite the source) -- no handler is registered
      // for the latter, so hitting it would fail the test via
      // onUnhandledRequest: 'error'.
      http.post('/api/prompts', () =>
        HttpResponse.json(promptResponse({ promptId: 'p2' }), { status: 201 }),
      ),
      http.get('/api/prompts/p2', () =>
        HttpResponse.json(promptResponse({ promptId: 'p2' })),
      ),
    )

    renderApp('/prompts/p1/duplicate')
    await screen.findByLabelText('Name')
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Original' }),
    ).toBeInTheDocument()
  })

  it('shows the Duplicate tab alongside View/Edit/Console', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json(promptResponse({ name: 'Greeting' })),
      ),
    )

    renderApp('/prompts/p1')

    expect(
      await screen.findByRole('link', { name: 'View' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Console' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Duplicate' })).toHaveAttribute(
      'href',
      '/prompts/p1/duplicate',
    )
  })
})
