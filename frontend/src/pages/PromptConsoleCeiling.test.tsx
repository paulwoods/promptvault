import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

const STORED = {
  promptId: 'p1',
  name: 'Greeting',
  description: 'A greeting',
  promptText: 'Hello',
  model: 'claude-opus-4-8',
  systemPrompt: 'Be brief',
  maxTokens: 2048,
  effort: 'high',
  thinking: 'off',
  createdAt: 'x',
  updatedAt: 'x',
}

/**
 * The autosave's ten-second ceiling, alone in its own file because it is the
 * one test here that takes real seconds — vitest runs files in parallel, so it
 * overlaps the rest of the suite instead of adding to it.
 *
 * It runs on the real clock deliberately. A fake one cannot drive this: the
 * typing has to go through user-event, whose await chain and React Testing
 * Library's async act drain both block on timers that only the test advances,
 * and the whole thing deadlocks on the first keystroke.
 */
describe('autosave ceiling', () => {
  it('saves under unbroken typing, which never leaves a pause to debounce on', async () => {
    const user = userEvent.setup()
    setToken('t')
    let patches = 0
    server.use(
      http.get('/api/prompts/p1', () => HttpResponse.json(STORED)),
      http.patch('/api/prompts/p1', () => {
        patches += 1
        return HttpResponse.json(STORED)
      }),
    )

    renderApp('/prompts/p1/console')
    await user.click(await screen.findByRole('button', { name: 'User Prompt' }))
    const field = screen.getByRole('textbox', { name: 'User Prompt' })

    // A keystroke every 850ms, for a little over the ceiling: never a gap long
    // enough for the one-second idle timer, so a plain debounce would sit here
    // indefinitely and write nothing at all.
    for (let stroke = 0; stroke < 14; stroke += 1) {
      await user.type(field, 'x')
      await new Promise((resolve) => setTimeout(resolve, 850))
      if (patches > 0) {
        break
      }
    }

    // The ceiling is what fires instead — the whole reason it exists alongside
    // the idle timer.
    expect(patches).toBeGreaterThan(0)
  }, 30000)
})
