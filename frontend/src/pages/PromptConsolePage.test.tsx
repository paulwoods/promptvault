import { screen, waitFor, within } from '@testing-library/react'
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
 * Name reads as plain text until clicked, so there is no form control to query
 * in read mode. Clicks the value to swap in the editor and returns the input.
 */
async function editName(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Name / }))
  return screen.getByRole('textbox', { name: 'Name' })
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

    // Name reads as text, not a field, until it is clicked.
    expect(
      await screen.findByRole('button', { name: 'Name Greeting' }),
    ).toBeInTheDocument()
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

  it('saving carries the stored name, not the inline field draft', async () => {
    const user = userEvent.setup()
    setToken('t')
    let submitted: unknown
    server.use(
      getPrompt(),
      // A save is still a PUT over the whole prompt for the fields the form owns.
      http.put('/api/prompts/p1', async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json(promptResponse())
      }),
    )

    renderApp('/prompts/p1/console')
    // Name is inline-edited, so an uncommitted draft must not ride along on the
    // PUT -- the body carries the name the query holds.
    const nameField = await editName(user)
    await user.clear(nameField)
    await user.type(nameField, 'Uncommitted')
    const tokens = screen.getByLabelText('Max tokens')
    await user.clear(tokens)
    await user.type(tokens, '4096')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Greeting' }),
    ).toBeInTheDocument()
    expect(submitted).toMatchObject({
      name: 'Greeting',
      maxTokens: 4096,
      promptText: 'Hello {{topic}}',
      effort: 'high',
    })
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
    // Enter falling through would PUT every other field from `values`.
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

    // Scoped: a field-level alert can now coexist with the form's bottom one.
    const profile = screen.getByRole('group', { name: 'Profile' })
    expect(await within(profile).findByRole('alert')).toHaveTextContent(
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
    // Delete included, now that it sits beside Save -- wait on the models query.
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
