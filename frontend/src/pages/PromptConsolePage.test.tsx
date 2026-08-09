import { screen, waitFor } from '@testing-library/react'
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
 * Name reads as plain text until clicked, so there is no form control to query
 * in read mode. Clicks the value to swap in the editor and returns the input.
 */
async function editName(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Name / }))
  return screen.getByRole('textbox', { name: 'Name' })
}

/** editName's counterpart for Description, which reads as text the same way. */
async function editDescription(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Description / }))
  return screen.getByRole('textbox', { name: 'Description' })
}

/**
 * Pins the Console's behavior mechanism-by-mechanism so the form can be inlined
 * off PromptForm and proven faithful by an unchanged suite (Phase 13.3/13.4).
 */
describe('prompt console', () => {
  it('seeds every field from the loaded prompt', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')

    // Name reads as text, not a field, until it is clicked.
    expect(
      await screen.findByRole('button', { name: 'Name Greeting' }),
    ).toBeInTheDocument()
    // Description reads as text too, for the same reason.
    expect(
      screen.getByRole('button', { name: 'Description A greeting' }),
    ).toBeInTheDocument()
    // The run settings read as text too — all on the Details tab.
    expect(
      screen.getByRole('button', { name: 'Model claude-opus-4-8' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Max tokens 2048' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Effort high' }),
    ).toBeInTheDocument()

    // The prompt text and system prompt live on their own tabs.
    await user.click(screen.getByRole('button', { name: 'User Prompt' }))
    expect(
      screen.getByRole('button', { name: 'User Prompt Hello {{topic}}' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'System Prompt' }))
    expect(
      screen.getByRole('button', { name: 'System Prompt Be brief' }),
    ).toBeInTheDocument()
  })

  it('carries thinking off in the same patch that moves to Haiku', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt({ thinking: 'adaptive' }),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(
          promptResponse({ model: 'claude-haiku-4-5', thinking: 'off' }),
        )
      }),
    )

    renderApp('/prompts/p1/console')
    expect(
      await screen.findByRole('button', { name: 'Effort high' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Model claude-opus-4-8' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Model' }),
      'claude-haiku-4-5',
    )
    await user.click(screen.getByRole('button', { name: 'Save model' }))

    // Adaptive thinking on Haiku is the one combination the server rejects, and
    // no ordering makes two separate patches both valid.
    await waitFor(() =>
      expect(patched).toEqual({
        model: 'claude-haiku-4-5',
        thinking: 'off',
      }),
    )
    // Haiku has no effort control and no thinking choice left to offer.
    expect(
      screen.queryByRole('button', { name: /^Effort / }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Thinking / }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('off')).toBeInTheDocument()
  })

  it('committing PATCHes the name alone and takes the new value from the response', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    let gets = 0
    server.use(
      http.get('/api/prompts/p1', () => {
        gets += 1
        return HttpResponse.json(promptResponse())
      }),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse({ name: 'Renamed' }))
      }),
    )

    renderApp('/prompts/p1/console')
    const nameField = await editName(user)
    await user.clear(nameField)
    await user.type(nameField, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    // Back in read mode, showing the value the PATCH itself returned.
    expect(
      await screen.findByRole('button', { name: 'Name Renamed' }),
    ).toBeInTheDocument()
    expect(patched).toEqual({ name: 'Renamed' })
    // setQueryData, not invalidate: the detail query is never refetched.
    expect(gets).toBe(1)
  })

  it('shows the commit button only while editing, disabled until the draft differs', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    await screen.findByRole('button', { name: 'Name Greeting' })
    // Read mode is text: no field, and nothing to commit.
    expect(
      screen.queryByRole('textbox', { name: 'Name' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save name' }),
    ).not.toBeInTheDocument()

    const nameField = await editName(user)
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()

    await user.type(nameField, '!')
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled()

    // Blank matches the server's @NotBlank, so the commit stays refused.
    await user.clear(nameField)
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
  })

  it('commits on Enter without submitting the outer form', async () => {
    const user = userEvent.setup()
    setToken('t')
    let put = false
    let patched: unknown
    server.use(
      getPrompt(),
      http.put('/api/prompts/p1', () => {
        put = true
        return HttpResponse.json(promptResponse())
      }),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse({ name: 'Renamed' }))
      }),
    )

    renderApp('/prompts/p1/console')
    const nameField = await editName(user)
    await user.clear(nameField)
    await user.type(nameField, 'Renamed{Enter}')

    await waitFor(() => expect(patched).toEqual({ name: 'Renamed' }))
    // Enter commits the inline field; it must not fall through to anything else.
    expect(put).toBe(false)
  })

  it('reverts to the stored name on Escape', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    const nameField = await editName(user)
    await user.clear(nameField)
    await user.type(nameField, 'Discarded')
    expect(nameField).toHaveValue('Discarded')

    await user.type(nameField, '{Escape}')

    // Back to read mode showing the stored name; the draft is gone with it.
    expect(
      screen.getByRole('button', { name: 'Name Greeting' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Name' }),
    ).not.toBeInTheDocument()
  })

  it('reverts to the stored name on the cancel button', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    const nameField = await editName(user)
    await user.clear(nameField)
    await user.type(nameField, 'Discarded')

    await user.click(screen.getByRole('button', { name: 'Cancel name edit' }))

    expect(
      screen.getByRole('button', { name: 'Name Greeting' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Name' }),
    ).not.toBeInTheDocument()
  })

  it('committing PATCHes the description alone', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse({ description: 'Rewritten' }))
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editDescription(user)
    await user.clear(field)
    await user.type(field, 'Rewritten{Enter}')

    expect(
      await screen.findByRole('button', { name: 'Description Rewritten' }),
    ).toBeInTheDocument()
    expect(patched).toEqual({ description: 'Rewritten' })
  })

  it('lets an optional field be cleared, unlike Name', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse({ description: null }))
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editDescription(user)
    await user.clear(field)
    // Blank is a legal description, so the commit button stays enabled and the
    // blank string is what tells the server to clear the column.
    await user.click(screen.getByRole('button', { name: 'Save description' }))

    await waitFor(() => expect(patched).toEqual({ description: '' }))
    // A cleared description leaves nothing to click, so the field offers its
    // own prompt to start editing again.
    expect(
      await screen.findByRole('button', {
        name: 'Description Add a description',
      }),
    ).toBeInTheDocument()
  })

  it('patches max tokens as a number, not the drafted string', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse({ maxTokens: 4096 }))
      }),
    )

    renderApp('/prompts/p1/console')
    await user.click(
      await screen.findByRole('button', { name: /^Max tokens / }),
    )
    const field = screen.getByRole('spinbutton', { name: 'Max tokens' })
    await user.clear(field)
    await user.type(field, '4096{Enter}')

    await waitFor(() => expect(patched).toEqual({ maxTokens: 4096 }))
    expect(
      await screen.findByRole('button', { name: 'Max tokens 4096' }),
    ).toBeInTheDocument()
  })

  it('keeps the draft and reports a failed patch beside the field', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', () =>
        HttpResponse.json(
          {
            error: 'validation_error',
            message: 'Validation failed',
            details: { name: 'size must be between 0 and 200' },
          },
          { status: 400 },
        ),
      ),
    )

    renderApp('/prompts/p1/console')
    const nameField = await editName(user)
    await user.clear(nameField)
    await user.type(nameField, 'Rejected')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    // The field-level alert sits in the form alongside the form's bottom one.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Validation failed: size must be between 0 and 200',
    )
    // The draft survives the failure -- there is nothing to recover it from.
    expect(nameField).toHaveValue('Rejected')
    expect(
      screen.getByRole('button', { name: 'Save name' }),
    ).toBeInTheDocument()
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

  it('shows the tabs while the models query is still pending', async () => {
    setToken('t')
    server.use(
      getPrompt(),
      http.get('/api/models', async () => {
        await delay('infinite')
        return HttpResponse.json({ models: [], defaultModel: '' })
      }),
    )

    renderApp('/prompts/p1/console')

    // The prompt has loaded, so the tabs render; the form and its actions --
    // Delete included -- wait on the models query.
    expect(
      await screen.findByRole('link', { name: 'View' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Name / }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
  })
})
