import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

function promptResponse(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p9',
    name: 'Greeting',
    description: null,
    promptText: 'Hello there',
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

describe('create / edit prompt', () => {
  it('saving a new prompt navigates to it', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.post('/api/prompts', () =>
        HttpResponse.json(promptResponse(), { status: 201 }),
      ),
      http.get('/api/prompts/p9', () => HttpResponse.json(promptResponse())),
    )

    renderApp('/prompts/new')
    await user.type(await screen.findByLabelText('Name'), 'Greeting')
    await user.type(screen.getByLabelText('User Prompt'), 'Hello there')
    await user.click(screen.getByRole('button', { name: 'Create prompt' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Greeting' }),
    ).toBeInTheDocument()
  })

  it('shows the server validation error inline', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.post('/api/prompts', () =>
        HttpResponse.json(
          {
            error: 'validation_error',
            message: 'Validation failed',
            details: { model: 'unsupported model' },
          },
          { status: 400 },
        ),
      ),
    )

    renderApp('/prompts/new')
    await user.type(await screen.findByLabelText('Name'), 'Greeting')
    await user.type(screen.getByLabelText('User Prompt'), 'Hello there')
    await user.click(screen.getByRole('button', { name: 'Create prompt' }))

    // The envelope's details carry the reason -- "Validation failed" alone is useless.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Validation failed: unsupported model',
    )
    expect(
      screen.getByRole('link', { name: 'Prompt Vault - New prompt' }),
    ).toBeInTheDocument()
  })

  it('hides effort and forces thinking off when Haiku is selected', async () => {
    const user = userEvent.setup()
    setToken('t')

    renderApp('/prompts/new')
    // Default model (opus) supports effort + adaptive thinking.
    expect(await screen.findByLabelText('Effort')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Model'), 'claude-haiku-4-5')

    expect(screen.queryByLabelText('Effort')).not.toBeInTheDocument()
    const thinking = screen.getByLabelText('Thinking')
    expect(thinking).toBeDisabled()
    expect(thinking).toHaveValue('off')
    expect(
      screen.queryByRole('option', { name: 'adaptive' }),
    ).not.toBeInTheDocument()
  })

  it('editing overwrites the prompt and navigates back to it', async () => {
    const user = userEvent.setup()
    setToken('t')
    let submitted: unknown
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json(promptResponse({ promptId: 'p1', name: 'Current' })),
      ),
      // A save is a PUT over the prompt, never a POST that would append.
      http.put('/api/prompts/p1', async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json(
          promptResponse({ promptId: 'p1', name: 'Renamed' }),
        )
      }),
    )

    renderApp('/prompts/p1/edit')
    const nameField = await screen.findByLabelText('Name')
    expect(nameField).toHaveValue('Current')
    await user.clear(nameField)
    await user.type(nameField, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Current' }),
    ).toBeInTheDocument()
    expect(submitted).toMatchObject({ name: 'Renamed' })
  })
})
