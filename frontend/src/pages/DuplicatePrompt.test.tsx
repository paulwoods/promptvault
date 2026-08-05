import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('duplicate prompt', () => {
  it('pre-fills the form with the source version content', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versionId: 'v1',
          number: 1,
          name: 'Original',
          description: 'Original description',
          promptText: 'Hello {{name}}',
          model: 'claude-opus-4-8',
          systemPrompt: null,
          maxTokens: 1000,
          effort: 'medium',
          thinking: 'off',
          variables: [{ name: 'name', defaultValue: null }],
          createdAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1/versions/1/duplicate')

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
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versionId: 'v1',
          number: 1,
          name: 'Original',
          description: null,
          promptText: 'Hello',
          model: 'claude-opus-4-8',
          systemPrompt: null,
          maxTokens: 1000,
          effort: 'medium',
          thinking: 'off',
          variables: [],
          createdAt: 'x',
        }),
      ),
      // The duplicate must POST to /api/prompts (create), never to
      // /api/prompts/p1/versions (append to the source's history) -- no
      // handler is registered for the latter, so hitting it would fail the
      // test via onUnhandledRequest: 'error'.
      http.post('/api/prompts', () =>
        HttpResponse.json(
          { promptId: 'p2', versionId: 'v1', number: 1 },
          { status: 201 },
        ),
      ),
      http.get('/api/prompts/p2', () =>
        HttpResponse.json({
          promptId: 'p2',
          versions: [
            {
              versionId: 'v1',
              number: 1,
              name: 'Original',
              createdAt: 'x',
              current: true,
            },
          ],
        }),
      ),
    )

    renderApp('/prompts/p1/versions/1/duplicate')
    await screen.findByLabelText('Name')
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))

    expect(
      await screen.findByRole('link', {
        name: 'Prompt Vault - Versions: Original',
      }),
    ).toBeInTheDocument()
  })

  it('shows the Duplicate tab alongside View/Edit/Run, linking to the current version', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versionId: 'v1',
          number: 1,
          name: 'Greeting',
          description: null,
          promptText: 'Hello',
          model: 'claude-opus-4-8',
          systemPrompt: null,
          maxTokens: 1000,
          effort: 'medium',
          thinking: 'off',
          variables: [],
          createdAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1/versions/1')

    expect(
      await screen.findByRole('link', { name: 'View' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Duplicate' })).toHaveAttribute(
      'href',
      '/prompts/p1/versions/1/duplicate',
    )
  })
})
