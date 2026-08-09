import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

/** The default body HomePage posts when New Prompt is clicked. Kept in sync
 *  with the NEW_PROMPT_BODY constant in HomePage.tsx. */
const DEFAULT_BODY = {
  name: 'New prompt',
  description: '',
  promptText: 'hi',
  systemPrompt: 'you are a helpful assistant',
  model: 'claude-sonnet-4-6',
  maxTokens: 1000,
  effort: 'medium',
  thinking: 'adaptive',
}

function promptResponse(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p9',
    name: 'New prompt',
    description: null,
    promptText: 'hi',
    model: 'claude-sonnet-4-6',
    systemPrompt: 'you are a helpful assistant',
    maxTokens: 1000,
    effort: 'medium',
    thinking: 'adaptive',
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  }
}

describe('HomePage New Prompt', () => {
  it('creates a prompt with the default values and opens the Console', async () => {
    const user = userEvent.setup()
    setToken('t')
    let posted: unknown
    server.use(
      http.post('/api/prompts', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(promptResponse(), { status: 201 })
      }),
      http.get('/api/prompts/p9', () => HttpResponse.json(promptResponse())),
    )

    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'New Prompt' }))

    // The Console sets the page title to "Console: <name>"; the brand link
    // picks it up, proving navigation to /prompts/p9/console.
    expect(
      await screen.findByRole('link', {
        name: 'Prompt Vault - Console: New prompt',
      }),
    ).toBeInTheDocument()
    expect(posted).toMatchObject(DEFAULT_BODY)
  })

  it('disables and relabels the button while the create is in flight', async () => {
    const user = userEvent.setup()
    setToken('t')
    let resolveCreate: () => void = () => {}
    server.use(
      http.post('/api/prompts', async () => {
        await new Promise<void>((resolve) => {
          resolveCreate = resolve
        })
        return HttpResponse.json(promptResponse(), { status: 201 })
      }),
      http.get('/api/prompts/p9', () => HttpResponse.json(promptResponse())),
    )

    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'New Prompt' }))

    const pending = await screen.findByRole('button', { name: 'Creating…' })
    expect(pending).toBeDisabled()

    // Let the request settle so no dangling mutation survives the test.
    resolveCreate()
    await screen.findByRole('link', {
      name: 'Prompt Vault - Console: New prompt',
    })
  })

  it('shows the server error inline and re-enables on failure', async () => {
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

    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'New Prompt' }))

    // The envelope's details carry the reason -- "Validation failed" alone is
    // useless.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Validation failed: unsupported model',
    )
    expect(screen.getByRole('button', { name: 'New Prompt' })).toBeEnabled()
  })
})
