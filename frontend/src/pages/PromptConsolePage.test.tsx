import { fireEvent, screen, waitFor } from '@testing-library/react'
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
 * Unlike editName, the User Prompt has no read mode to click through: the
 * markdown editor is the field. Opening the tab is the whole of it.
 *
 * What comes back is CodeMirror's own textarea — a keystroke buffer, not the
 * document — so it is somewhere to type and not somewhere to read; see
 * `saveUserPrompt` for reading. It carries the cursor the editor autofocuses,
 * which sits at the end of the stored prompt, so typing into it appends.
 * `user.clear` only empties the buffer and leaves the document alone.
 */
async function editUserPrompt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'User Prompt' }))
  return screen.getByRole('textbox', { name: 'User Prompt' })
}

/**
 * What the editor is holding, read the only way jsdom allows: by saving it and
 * looking at what the PATCH carried. CodeMirror keeps its document in an
 * internal model rather than a form control, and renders it through a viewport
 * measured off element heights — which jsdom reports as zero, leaving the lines
 * unrendered. So there is no text on screen here to assert against, and the
 * request body is the closest thing to the value the user is looking at.
 */
async function saveUserPrompt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Save user prompt' }))
}

/**
 * Pins the Console's behavior mechanism-by-mechanism: each inline-edited field,
 * the run pane, and the prompt-level actions (Delete, Duplicate).
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

    // The two prompt bodies live on their own tabs, and unlike every field
    // above they are editors on arrival rather than text waiting for a click.
    await user.click(screen.getByRole('button', { name: 'User Prompt' }))
    expect(
      screen.getByRole('textbox', { name: 'User Prompt' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^User Prompt / }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'System Prompt' }))
    expect(
      screen.getByRole('textbox', { name: 'System Prompt' }),
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

  it('edits the two prompt fields in a markdown editor, not a plain textarea', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    await editUserPrompt(user)

    // The editor brings a formatting toolbar and a preview toggle — neither of
    // which a bare textarea has.
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Toggle Preview' }),
    ).toBeInTheDocument()

    // The System Prompt tab gets the same editor, also without a read mode.
    await user.click(screen.getByRole('button', { name: 'System Prompt' }))
    expect(
      screen.getByRole('textbox', { name: 'System Prompt' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^System Prompt / }),
    ).not.toBeInTheDocument()
  })

  it('writes markdown syntax into the source when the toolbar is used', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse())
      }),
    )

    renderApp('/prompts/p1/console')
    await editUserPrompt(user)
    await user.click(screen.getByRole('button', { name: 'Bold' }))
    await saveUserPrompt(user)

    // The prompt runs as stored (ADR-0009), so Bold has to leave the asterisks
    // in the text rather than styling it and sending something else.
    await waitFor(() =>
      expect(patched).toEqual({ promptText: 'Hello {{topic}}****' }),
    )
  })

  it('stays an editor after saving rather than dropping to a read mode', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', () =>
        HttpResponse.json(promptResponse({ promptText: 'Hello {{topic}}!' })),
      ),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, '!')
    await saveUserPrompt(user)

    // The save leaves the field where it was, now sitting on the saved value,
    // with nothing to commit until it is edited again.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save user prompt' }),
      ).toBeDisabled(),
    )
    expect(
      screen.getByRole('textbox', { name: 'User Prompt' }),
    ).toBeInTheDocument()
  })

  it('types a newline on Enter instead of committing, unlike the one-line fields', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse())
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, '{Enter}second line')

    // A markdown prompt is multi-line, so Enter has to reach the editor as a
    // newline. Nothing was committed by pressing it.
    expect(patched).toBeUndefined()
    await saveUserPrompt(user)
    await waitFor(() =>
      expect(patched).toEqual({ promptText: 'Hello {{topic}}\nsecond line' }),
    )
  })

  it('commits the markdown draft on Ctrl+Enter, the chord that replaces Enter', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse({ promptText: 'Hello!' }))
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, '!')

    // fireEvent rather than user-event: CodeMirror resolves a chord through the
    // legacy `keyCode`, which user-event no longer sends, so a typed Ctrl+Enter
    // arrives as an unrecognised key here and nowhere else.
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 13, ctrlKey: true })

    await waitFor(() =>
      expect(patched).toEqual({ promptText: 'Hello {{topic}}!' }),
    )
  })

  it('commits the markdown draft on the save button', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse())
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    // Nothing to save while the draft still matches what is stored.
    expect(
      screen.getByRole('button', { name: 'Save user prompt' }),
    ).toBeDisabled()

    await user.type(field, ' please')
    await saveUserPrompt(user)

    await waitFor(() =>
      expect(patched).toEqual({ promptText: 'Hello {{topic}} please' }),
    )
  })

  it('puts the stored prompt back on Revert, and offers it only once dirty', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    // Nothing to put back while the draft still matches what is stored.
    expect(
      screen.getByRole('button', { name: 'Revert user prompt' }),
    ).toBeDisabled()

    await user.type(field, ' discarded')
    await user.click(screen.getByRole('button', { name: 'Revert user prompt' }))

    // The editor stays — only the draft goes back to the stored prompt, which
    // is what leaves Save with nothing to commit again.
    expect(
      screen.getByRole('textbox', { name: 'User Prompt' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save user prompt' }),
    ).toBeDisabled()
  })

  it('ignores Escape in the markdown editor, where it would discard unsaved work', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, ' still here')

    await user.type(field, '{Escape}')
    fireEvent.keyDown(field, { key: 'Escape', keyCode: 27 })

    // A read/edit field discards its draft on Escape by leaving edit mode. The
    // editor has no such mode to leave, so the key does nothing rather than
    // silently throwing the draft away.
    expect(
      screen.getByRole('button', { name: 'Save user prompt' }),
    ).toBeEnabled()
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

  it('duplicates the prompt with a "copy" name and opens the copy Console', async () => {
    const user = userEvent.setup()
    setToken('t')
    let posted: unknown
    server.use(
      getPrompt({ name: 'Greeting' }),
      // A duplicate POSTs to /api/prompts (create), never PUTs to
      // /api/prompts/p1 (overwrite the source) -- no PUT handler is registered,
      // so hitting it would fail the test via onUnhandledRequest: 'error'.
      http.post('/api/prompts', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(
          promptResponse({ promptId: 'p2', name: 'Greeting copy' }),
          { status: 201 },
        )
      }),
      http.get('/api/prompts/p2', () =>
        HttpResponse.json(
          promptResponse({ promptId: 'p2', name: 'Greeting copy' }),
        ),
      ),
    )

    renderApp('/prompts/p1/console')
    await user.click(await screen.findByRole('button', { name: 'Duplicate' }))

    // A new prompt is created from the stored content with a "copy" suffix on
    // the name; the source is left untouched.
    await waitFor(() =>
      expect(posted).toMatchObject({
        name: 'Greeting copy',
        promptText: 'Hello {{topic}}',
        model: 'claude-opus-4-8',
        systemPrompt: 'Be brief',
      }),
    )
    // The copy opens on its own Console.
    expect(
      await screen.findByRole('link', {
        name: 'Prompt Vault - Console: Greeting copy',
      }),
    ).toBeInTheDocument()
  })

  it('truncates a near-ceiling name so the copy stays under the 200-char cap', async () => {
    const user = userEvent.setup()
    setToken('t')
    // 200 chars -- the backend's @Size(max = 200) ceiling. Appending " copy"
    // would make 205 and the create would 400; the source is truncated first.
    const longName = 'a'.repeat(200)
    const expectedName = 'a'.repeat(195) + ' copy'
    let posted: unknown
    server.use(
      getPrompt({ name: longName }),
      http.post('/api/prompts', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(
          promptResponse({ promptId: 'p2', name: expectedName }),
          { status: 201 },
        )
      }),
      http.get('/api/prompts/p2', () =>
        HttpResponse.json(
          promptResponse({ promptId: 'p2', name: expectedName }),
        ),
      ),
    )

    renderApp('/prompts/p1/console')
    await user.click(await screen.findByRole('button', { name: 'Duplicate' }))

    await waitFor(() =>
      expect((posted as { name: string }).name).toBe(expectedName),
    )
    expect((posted as { name: string }).name).toHaveLength(200)
  })

  it('waits on the models query before rendering the form and its actions', async () => {
    setToken('t')
    server.use(
      getPrompt(),
      http.get('/api/models', async () => {
        await delay('infinite')
        return HttpResponse.json({ models: [], defaultModel: '' })
      }),
    )

    renderApp('/prompts/p1/console')

    // The prompt has loaded, but the form -- and its Delete/Duplicate actions --
    // wait on the models query, so only the form's loading state shows.
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Name / }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Duplicate' }),
    ).not.toBeInTheDocument()
  })
})
