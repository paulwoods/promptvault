import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

function promptResponse(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p1',
    name: 'Greeting',
    description: 'A greeting',
    promptText: 'Hello {{topic}}',
    model: 'claude-opus-4-8',
    systemPrompt: 'Be brief',
    maxTokens: 2048,
    effort: 'high',
    thinking: 'off',
    variables: [
      { name: 'topic', description: null, required: true, defaultValue: null },
    ],
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  }
}

function getPrompt(overrides: Record<string, unknown> = {}) {
  return http.get('/api/prompts/p1', () =>
    HttpResponse.json(promptResponse(overrides)),
  )
}

/**
 * Pins the Console's behavior mechanism-by-mechanism so the form can be inlined
 * off PromptForm and proven faithful by an unchanged suite (Phase 13.3/13.4).
 * The five placeholder/variable cases live in CreateEditPrompt.test.tsx: they
 * exercise variableMismatch(), a shared pure function that is not being
 * inlined, so one case here is enough to prove the gate is wired.
 */
describe('prompt console', () => {
  it('seeds every field from the loaded prompt', async () => {
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')

    expect(await screen.findByLabelText('Name')).toHaveValue('Greeting')
    expect(screen.getByLabelText('Description')).toHaveValue('A greeting')
    expect(screen.getByLabelText('User Prompt')).toHaveValue('Hello {{topic}}')
    expect(screen.getByLabelText('System Prompt')).toHaveValue('Be brief')
    expect(screen.getByLabelText('Model')).toHaveValue('claude-opus-4-8')
    expect(screen.getByLabelText('Max tokens')).toHaveValue(2048)
    expect(screen.getByLabelText('Effort')).toHaveValue('high')
    expect(screen.getByLabelText('Variable 1 name')).toHaveValue('topic')
  })

  it('blocks submit when the prompt and its variables disagree', async () => {
    const user = userEvent.setup()
    setToken('t')
    let saved = false
    server.use(
      getPrompt(),
      http.put('/api/prompts/p1', () => {
        saved = true
        return HttpResponse.json(promptResponse())
      }),
    )

    renderApp('/prompts/p1/console')
    // Declare a second variable the prompt text never uses.
    await user.click(
      await screen.findByRole('button', { name: 'Add variable' }),
    )
    await user.type(screen.getByLabelText('Variable 2 name'), 'tone')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Variable {{tone}} not used in the prompt',
    )
    expect(saved).toBe(false)
  })

  it('hides effort and forces thinking off when Haiku is selected', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt({ thinking: 'adaptive' }))

    renderApp('/prompts/p1/console')
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

  it('saving overwrites the prompt with a PUT and navigates back to it', async () => {
    const user = userEvent.setup()
    setToken('t')
    let submitted: unknown
    server.use(
      getPrompt(),
      // A save is a PUT over the prompt -- the console does not PATCH yet.
      http.put('/api/prompts/p1', async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json(promptResponse({ name: 'Renamed' }))
      }),
    )

    renderApp('/prompts/p1/console')
    const nameField = await screen.findByLabelText('Name')
    await user.clear(nameField)
    await user.type(nameField, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Greeting' }),
    ).toBeInTheDocument()
    expect(submitted).toMatchObject({
      name: 'Renamed',
      promptText: 'Hello {{topic}}',
      maxTokens: 2048,
      effort: 'high',
    })
  })

  it('deletes immediately with no confirmation and navigates home', async () => {
    const user = userEvent.setup()
    setToken('t')
    let deleted = false
    server.use(
      getPrompt(),
      http.delete('/api/prompts/p1', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderApp('/prompts/p1/console')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Your Prompts' }),
    ).toBeInTheDocument()
    expect(deleted).toBe(true)
  })

  it('shadows a stale server error once the client gate fires', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      getPrompt(),
      http.put('/api/prompts/p1', () =>
        HttpResponse.json(
          {
            error: 'validation_error',
            message: 'Validation failed',
            details: { name: 'must not be blank' },
          },
          { status: 400 },
        ),
      ),
    )

    renderApp('/prompts/p1/console')
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Validation failed: must not be blank',
    )

    // The client gate now blocks submit, so the server error above is stale.
    await user.click(screen.getByRole('button', { name: 'Add variable' }))
    await user.type(screen.getByLabelText('Variable 2 name'), 'tone')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Variable {{tone}} not used in the prompt',
    )
  })

  it('shows the tabs and Delete while the models query is still pending', async () => {
    setToken('t')
    server.use(
      getPrompt(),
      http.get('/api/models', async () => {
        await delay('infinite')
        return HttpResponse.json({ models: [], defaultModel: '' })
      }),
    )

    renderApp('/prompts/p1/console')

    // The prompt has loaded, so the page chrome renders; only the form waits.
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })
})
