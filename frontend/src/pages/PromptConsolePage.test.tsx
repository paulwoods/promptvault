import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
 * `AUTOSAVED` for reading. It carries the cursor the reveal effect leaves at
 * the end of the stored prompt, so typing into it appends. `user.clear` only
 * empties the buffer and leaves the document alone.
 */
async function editUserPrompt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'User Prompt' }))
  return screen.getByRole('textbox', { name: 'User Prompt' })
}

/**
 * Long enough to outlast the autosave's one-second idle timer, which runs on
 * the real clock in every test but the ceiling one below.
 *
 * What the editor is holding is read the only way jsdom allows: through the
 * body of the PATCH the autosave sends. CodeMirror keeps its document in an
 * internal model rather than a form control, and renders it through a viewport
 * measured off element heights — which jsdom reports as zero, leaving the lines
 * unrendered. So there is no text on screen to assert against, and the request
 * body is the closest thing to the value the user is looking at.
 */
const AUTOSAVED = { timeout: 3000 }

/**
 * Whether closing the tab right now would warn. Asserted through the event
 * rather than by spying on addEventListener: a listener that is registered but
 * never cancels the event guards nothing, and dispatchEvent returns false
 * exactly when something called preventDefault.
 */
function unloadWarned() {
  return !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
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

  it('carries effort back to the app default when the target model cannot accept it', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt({ effort: 'max' }),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(
          promptResponse({ model: 'claude-haiku-4-5', effort: 'medium' }),
        )
      }),
    )

    renderApp('/prompts/p1/console')
    expect(
      await screen.findByRole('button', { name: 'Effort max' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Model claude-opus-4-8' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Model' }),
      'claude-haiku-4-5',
    )
    await user.click(screen.getByRole('button', { name: 'Save model' }))

    // An effort the target model does not list is the same merged-result trap
    // as thinking: no ordering makes two separate patches both valid.
    await waitFor(() =>
      expect(patched).toEqual({
        model: 'claude-haiku-4-5',
        effort: 'medium',
      }),
    )
    expect(
      screen.queryByRole('button', { name: /^Effort / }),
    ).not.toBeInTheDocument()
  })

  it('offers the model effort levels, extended ones included', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    await user.click(await screen.findByRole('button', { name: 'Effort high' }))

    const effort = screen.getByRole('combobox', { name: 'Effort' })
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(
        within(effort).getByRole('option', { name: level }),
      ).toBeInTheDocument()
    }
  })

  it('offers no thinking control on an always-thinking model', async () => {
    setToken('t')
    server.use(
      getPrompt({
        model: 'claude-fable-5',
        effort: 'xhigh',
        thinking: 'adaptive',
      }),
    )

    renderApp('/prompts/p1/console')

    // The wider effort levels still render; thinking does not — there is no
    // off on Fable 5, so the choice would be false.
    expect(
      await screen.findByRole('button', { name: 'Effort xhigh' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Thinking / }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('adaptive')).not.toBeInTheDocument()
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

    // The prompt runs as stored (ADR-0009), so Bold has to leave the asterisks
    // in the text rather than styling it and sending something else.
    await waitFor(
      () => expect(patched).toEqual({ promptText: 'Hello {{topic}}****' }),
      AUTOSAVED,
    )
  })

  it('autosaves a body once the typing stops, carrying that field alone', async () => {
    const user = userEvent.setup()
    setToken('t')
    const bodies: unknown[] = []
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(
          promptResponse({ promptText: 'Hello {{topic}} please' }),
        )
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, ' please')

    // One PATCH for the whole burst of typing, carrying only this field — the
    // other eight are untouched, which is what keeps a clobber narrow.
    await waitFor(
      () => expect(bodies).toEqual([{ promptText: 'Hello {{topic}} please' }]),
      AUTOSAVED,
    )

    // The field stays an editor sitting on the saved value; there is no read
    // mode for it to drop back to, and nothing further is sent.
    expect(
      screen.getByRole('textbox', { name: 'User Prompt' }),
    ).toBeInTheDocument()
  })

  it('names where the save has got to, in all five states', async () => {
    const user = userEvent.setup()
    setToken('t')
    let reject = false
    server.use(
      // One character, so a single Backspace empties the document.
      getPrompt({ promptText: 'x' }),
      http.patch('/api/prompts/p1', async () => {
        if (reject) {
          return HttpResponse.json(
            { error: 'validation_error', message: 'Validation failed' },
            { status: 400 },
          )
        }
        await delay(400)
        return HttpResponse.json(promptResponse({ promptText: 'xy' }))
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    // Only the showing body has a status line — the other is hidden, and so is
    // its own — which is what makes the bare role unambiguous here.
    const status = () => screen.getByRole('status')

    // Nothing typed yet, so what is on screen is what is stored.
    expect(status()).toHaveTextContent('Saved')

    await user.type(field, 'y')
    expect(status()).toHaveTextContent('Unsaved changes')

    await waitFor(
      () => expect(status()).toHaveTextContent('Saving…'),
      AUTOSAVED,
    )
    await waitFor(() => expect(status()).toHaveTextContent('Saved'), AUTOSAVED)

    // Blank is the state the User has to act on: promptText is @NotBlank, so
    // the save is held rather than sent to be rejected.
    fireEvent.keyDown(field, { key: 'Backspace', keyCode: 8 })
    fireEvent.keyDown(field, { key: 'Backspace', keyCode: 8 })
    await waitFor(() => expect(status()).toHaveTextContent("Can't be empty"))

    reject = true
    await user.type(field, 'z')
    await waitFor(
      () => expect(status()).toHaveTextContent("Couldn't save"),
      AUTOSAVED,
    )
  })

  it('marks the tab of a body that is dirty while another tab is showing', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', () =>
        HttpResponse.json(promptResponse({ systemPrompt: 'Be brief dirty' })),
      ),
    )

    renderApp('/prompts/p1/console')
    await user.click(
      await screen.findByRole('button', { name: 'System Prompt' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'System Prompt' }),
      ' dirty',
    )
    await user.click(screen.getByRole('button', { name: 'User Prompt' }))

    // The System Prompt's own status line went off screen with it, so the tab
    // is the only thing left that can say it has unsaved work.
    expect(
      screen.getByRole('button', { name: 'System Prompt Unsaved changes' }),
    ).toBeInTheDocument()
    // The tab being looked at needs no marker: its status line is right there.
    expect(
      screen.getByRole('button', { name: 'User Prompt' }),
    ).toBeInTheDocument()

    // It clears once the autosave lands, without the tab being revisited.
    await waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: 'System Prompt' }),
        ).toBeInTheDocument(),
      AUTOSAVED,
    )
  })

  it('renders no commit or revert button for either body', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, ' dirty')

    // Both went with the autosave (ADR-0012). Dirty is when they would have
    // been offered, so this is where their absence is worth asserting.
    expect(
      screen.queryByRole('button', { name: 'Save user prompt' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Revert user prompt' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'System Prompt' }))
    await user.type(
      screen.getByRole('textbox', { name: 'System Prompt' }),
      ' dirty',
    )
    expect(
      screen.queryByRole('button', { name: 'Save system prompt' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Revert system prompt' }),
    ).not.toBeInTheDocument()

    // Details keeps its explicit commit — the split is the point.
    await user.click(screen.getByRole('button', { name: 'Details' }))
    await editName(user)
    expect(
      screen.getByRole('button', { name: 'Save name' }),
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

    // A markdown prompt is multi-line, so Enter reaches the editor as a
    // newline; the autosave, not the key, is what writes it.
    await waitFor(
      () =>
        expect(patched).toEqual({
          promptText: 'Hello {{topic}}\nsecond line',
        }),
      AUTOSAVED,
    )
  })

  it('holds the save while the User Prompt is blank rather than sending a 400', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patches = 0
    server.use(
      // One character, so a single Backspace empties the document.
      getPrompt({ promptText: 'x' }),
      http.patch('/api/prompts/p1', () => {
        patches += 1
        return HttpResponse.json(promptResponse())
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    // fireEvent rather than user-event: CodeMirror resolves keys through the
    // legacy `keyCode`, which user-event no longer sends.
    fireEvent.keyDown(field, { key: 'Backspace', keyCode: 8 })

    // promptText is @NotBlank, so an empty body is held rather than sent to be
    // rejected. Typing again releases it.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(patches).toBe(0)

    await user.type(field, 'y')
    await waitFor(() => expect(patches).toBe(1), AUTOSAVED)
  })

  it('lets a blank System Prompt save, since blank is how it is cleared', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patched: unknown
    server.use(
      getPrompt({ systemPrompt: 'x' }),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(promptResponse({ systemPrompt: null }))
      }),
    )

    renderApp('/prompts/p1/console')
    await user.click(
      await screen.findByRole('button', { name: 'System Prompt' }),
    )
    const field = screen.getByRole('textbox', { name: 'System Prompt' })
    fireEvent.keyDown(field, { key: 'Backspace', keyCode: 8 })

    // Unlike promptText it carries no @NotBlank, so the blank string is a
    // legitimate save and is what clears the column.
    await waitFor(
      () => expect(patched).toEqual({ systemPrompt: '' }),
      AUTOSAVED,
    )
  })

  it('does not let a slow earlier save overwrite a newer one', async () => {
    const user = userEvent.setup()
    setToken('t')
    let responses = 0
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async () => {
        responses += 1
        // The first save is overtaken by the second: it goes out first and
        // comes back last, carrying the older text.
        const first = responses === 1
        await delay(first ? 400 : 10)
        return HttpResponse.json(
          promptResponse({ promptText: first ? 'stale' : 'fresh' }),
        )
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, ' one')
    await waitFor(() => expect(responses).toBe(1), AUTOSAVED)
    await user.type(field, ' two')
    await waitFor(() => expect(responses).toBe(2), AUTOSAVED)

    // Both have landed by now. The Details tab reads the same query the stale
    // response would have written, so the name it shows is the proof.
    await new Promise((resolve) => setTimeout(resolve, 500))
    await user.click(screen.getByRole('button', { name: 'Details' }))
    // Nothing crashed and the cache still holds a prompt; what matters is that
    // the later response is the one in it.
    expect(
      screen.getByRole('button', { name: 'Name Greeting' }),
    ).toBeInTheDocument()
  })

  it('ignores Escape in the markdown editor, where it would discard unsaved work', async () => {
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
    await user.type(field, ' still here')
    fireEvent.keyDown(field, { key: 'Escape', keyCode: 27 })

    // A read/edit field discards its draft on Escape by leaving edit mode. The
    // editor has no such mode to leave, so the key does nothing and the draft
    // still reaches the server.
    await waitFor(
      () =>
        expect(patched).toEqual({ promptText: 'Hello {{topic}} still here' }),
      AUTOSAVED,
    )
  })

  it('keeps an unsaved body across a trip to another tab', async () => {
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
    await user.type(field, ' drafted')

    // Only one body is queryable at a time: the other is hidden, which takes it
    // out of the accessibility tree even though it stays mounted.
    expect(
      screen.queryByRole('textbox', { name: 'System Prompt' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(
      screen.queryByRole('textbox', { name: 'User Prompt' }),
    ).not.toBeInTheDocument()
    // Matched loosely: the tab carries its unsaved-changes marker at this point,
    // which is part of its accessible name.
    await user.click(screen.getByRole('button', { name: /^User Prompt/ }))

    // The editor was hidden, not unmounted, so the draft is still there. Typing
    // one more character restarts the autosave, and what it carries is what
    // proves the draft was never re-seeded from the store.
    await user.type(screen.getByRole('textbox', { name: 'User Prompt' }), '!')
    await waitFor(
      () => expect(patched).toEqual({ promptText: 'Hello {{topic}} drafted!' }),
      AUTOSAVED,
    )
  })

  it('focuses the revealed body so it can be typed into without a click', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    expect(field).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Details' }))
    await user.click(screen.getByRole('button', { name: 'User Prompt' }))

    // Focus is re-applied on every reveal, not just the first: `autofocus` only
    // fires at construction, which happens once while the tab is hidden.
    expect(screen.getByRole('textbox', { name: 'User Prompt' })).toHaveFocus()
  })

  it('writes the typed body before it streams, so the run reads what is on screen', async () => {
    const user = userEvent.setup()
    setToken('t')
    const calls: string[] = []
    let patched: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        patched = await request.json()
        calls.push('patch')
        return HttpResponse.json(
          promptResponse({ promptText: 'Hello {{topic}} now' }),
        )
      }),
      http.post(
        '/api/prompts/p1/run',
        () => (
          calls.push('run'),
          new HttpResponse(
            'event: done\ndata: {"status":"completed","usage":{"inputTokens":1,"outputTokens":2}}\n\n',
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        ),
      ),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, ' now')
    await user.click(screen.getByRole('button', { name: 'Run prompt' }))

    // The run reads the *stored* Prompt — the POST carries no body at all
    // (ADR-0009) — so the only way its output can answer what is on screen is
    // for the write to land first. Run cancels the pending debounce and awaits
    // its own PATCH rather than racing it.
    await waitFor(() => expect(calls).toContain('run'))
    expect(patched).toEqual({ promptText: 'Hello {{topic}} now' })
    expect(calls.indexOf('patch')).toBeLessThan(calls.indexOf('run'))
  })

  it('blocks the run and surfaces the error when the write will not land', async () => {
    const user = userEvent.setup()
    setToken('t')
    let runs = 0
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', () =>
        HttpResponse.json(
          { error: 'validation_error', message: 'Prompt text is too long' },
          { status: 400 },
        ),
      ),
      http.post('/api/prompts/p1/run', () => {
        runs += 1
        return new HttpResponse(null, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, ' unsavable')
    await user.click(screen.getByRole('button', { name: 'Run prompt' }))

    // A run against text the server does not have is worse than no run: it
    // would answer the previous prompt and read as though it answered this one.
    // Scoped to the Run pane because the failure is reported twice over — once
    // beside the field that could not save, and once here, where the run the
    // User just asked for did not start.
    const runPane = within(screen.getByRole('region', { name: 'Run' }))
    expect(
      await runPane.findByText('Prompt text is too long'),
    ).toBeInTheDocument()
    expect(runs).toBe(0)
  })

  it('blocks the run outright while the User Prompt is blank', async () => {
    const user = userEvent.setup()
    setToken('t')
    // One character, so a single Backspace empties the document.
    server.use(getPrompt({ promptText: 'x' }))

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    fireEvent.keyDown(field, { key: 'Backspace', keyCode: 8 })

    // Blank is never written (promptText is @NotBlank), so no flush can make the
    // stored Prompt match the screen — leaving the run to quietly use the
    // previous text. The button says why rather than just refusing.
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Run prompt — the User Prompt cannot be empty',
        }),
      ).toBeDisabled(),
    )
  })

  it('warns before the tab closes while a Details editor holds a changed draft', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(getPrompt())

    renderApp('/prompts/p1/console')
    const input = await editName(user)

    // An open editor still showing the stored name has nothing to lose.
    expect(unloadWarned()).toBe(false)

    await user.type(input, '!')
    expect(unloadWarned()).toBe(true)

    // Escape closes the editor and drops the draft, so the guard goes with it —
    // this is also the in-app case, where abandoning an edit is the point.
    await user.keyboard('{Escape}')
    expect(unloadWarned()).toBe(false)
  })

  it('warns while a body is unsaved and stops once the autosave lands', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', async ({ request }) => {
        const body = (await request.json()) as { promptText: string }
        return HttpResponse.json(
          promptResponse({ promptText: body.promptText }),
        )
      }),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)

    // A body is its own editor from the first paint, so `editing` alone cannot
    // mean uncommitted work: on arrival the draft is the stored text.
    expect(unloadWarned()).toBe(false)

    await user.type(field, ' x')
    expect(unloadWarned()).toBe(true)

    // The debounce writes it, the response becomes the stored text, and the
    // draft matches again — nothing left for the dialog to protect.
    await waitFor(() => expect(unloadWarned()).toBe(false), AUTOSAVED)
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

  it('writes nothing on the way to Trash, even with a body mid-edit', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patches = 0
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', () => {
        patches += 1
        return HttpResponse.json(promptResponse())
      }),
      http.delete(
        '/api/prompts/p1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )

    renderApp('/prompts/p1/console')
    const field = await editUserPrompt(user)
    await user.type(field, ' x')
    await user.click(screen.getByRole('button', { name: 'Details' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Your Prompts' }),
    ).toBeInTheDocument()

    // Delete cancels pending saves rather than flushing them — a Prompt on its
    // way to Trash has no use for one last write. That covers the unmount flush
    // the navigation itself triggers, which would otherwise fire after the row
    // is gone.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(patches).toBe(0)
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

  it('copies the typed body, not the text the Console was loaded with', async () => {
    const user = userEvent.setup()
    setToken('t')
    const typed = 'Hello {{topic}} typed'
    let posted: unknown
    server.use(
      getPrompt(),
      http.patch('/api/prompts/p1', () =>
        HttpResponse.json(promptResponse({ promptText: typed })),
      ),
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
    const field = await editUserPrompt(user)
    await user.type(field, ' typed')
    await user.click(screen.getByRole('button', { name: 'Details' }))
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))

    // The copy is taken from the query cache, so an unwritten body would be
    // duplicated at its previous text — silently, since the name and everything
    // else would look right. Duplicate flushes first for the same reason Run does.
    await waitFor(() => expect(posted).toMatchObject({ promptText: typed }))
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
