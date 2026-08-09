import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('PromptViewPage', () => {
  it('labels a variable with omitted required as required', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
          name: 'Greeting',
          description: null,
          promptText: 'Hello {{topic}}',
          model: 'claude-opus-4-8',
          systemPrompt: null,
          maxTokens: 100,
          effort: 'medium',
          thinking: 'off',
          variables: [{ name: 'topic', defaultValue: null }],
          createdAt: 'x',
          updatedAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1')

    expect(await screen.findByText('topic (required)')).toBeInTheDocument()
  })
})
