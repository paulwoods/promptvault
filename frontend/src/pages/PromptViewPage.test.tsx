import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('PromptViewPage', () => {
  it('renders the prompt text and run settings', async () => {
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
          createdAt: 'x',
          updatedAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1')

    // {{topic}} is ordinary text now (ADR-0009) -- shown verbatim, no Variable list.
    expect(await screen.findByText('Hello {{topic}}')).toBeInTheDocument()
    expect(screen.getByText('claude-opus-4-8')).toBeInTheDocument()
  })
})
