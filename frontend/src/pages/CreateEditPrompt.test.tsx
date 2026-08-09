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
