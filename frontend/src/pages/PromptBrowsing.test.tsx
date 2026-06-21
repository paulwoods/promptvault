import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('prompt browsing', () => {
  it('lists prompts by current-version name', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts', () =>
        HttpResponse.json([
          {
            promptId: 'p1',
            name: 'Greeting',
            currentVersionNumber: 2,
            createdAt: 'x',
          },
        ]),
      ),
    )

    renderApp('/')

    expect(
      await screen.findByRole('link', { name: /Greeting/ }),
    ).toBeInTheDocument()
  })

  it('shows version history descending with the current version marked', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versions: [
            {
              versionId: 'v2',
              number: 2,
              name: 'Renamed',
              createdAt: 'x',
              current: true,
            },
            {
              versionId: 'v1',
              number: 1,
              name: 'Original',
              createdAt: 'x',
              current: false,
            },
          ],
        }),
      ),
    )

    renderApp('/prompts/p1')

    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Renamed (v2)')
    expect(items[0]).toHaveTextContent('current')
    expect(items[1]).toHaveTextContent('Original (v1)')
    expect(items[1]).not.toHaveTextContent('current')
  })

  it('opens a historical version with full content', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versionId: 'v1',
          number: 1,
          name: 'Original',
          description: 'first',
          promptText: 'Tell me about {{topic}}',
          model: 'claude-opus-4-8',
          systemPrompt: 'Be brief',
          maxTokens: 1000,
          effort: 'medium',
          thinking: 'off',
          variables: [{ name: 'topic', required: true }],
          createdAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1/versions/1')

    expect(
      await screen.findByRole('heading', { name: 'Original (v1)' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Tell me about {{topic}}')).toBeInTheDocument()
    expect(screen.getByText('claude-opus-4-8')).toBeInTheDocument()
    const variables = screen.getByRole('list')
    expect(within(variables).getByText(/topic/)).toBeInTheDocument()
  })

  it('navigates from the list into a prompt and a version', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts', () =>
        HttpResponse.json([
          {
            promptId: 'p1',
            name: 'Greeting',
            currentVersionNumber: 1,
            createdAt: 'x',
          },
        ]),
      ),
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versions: [
            {
              versionId: 'v1',
              number: 1,
              name: 'Greeting',
              createdAt: 'x',
              current: true,
            },
          ],
        }),
      ),
    )

    renderApp('/')
    await user.click(await screen.findByRole('link', { name: /Greeting/ }))

    expect(
      await screen.findByRole('heading', { name: 'Version history' }),
    ).toBeInTheDocument()
  })
})
