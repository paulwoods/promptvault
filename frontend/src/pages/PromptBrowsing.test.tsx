import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('prompt browsing', () => {
  it('lists prompts by name', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts', () =>
        HttpResponse.json({
          items: [
            {
              promptId: 'p1',
              name: 'Greeting',
              createdAt: 'x',
              updatedAt: 'x',
            },
          ],
          hasMore: false,
        }),
      ),
    )

    renderApp('/')

    expect(
      await screen.findByRole('link', { name: /Greeting/ }),
    ).toBeInTheDocument()
  })

  it('opens a prompt with its full content', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
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
          updatedAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1')

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Original' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Tell me about {{topic}}')).toBeInTheDocument()
    expect(screen.getByText('claude-opus-4-8')).toBeInTheDocument()
    const variables = screen.getByRole('list')
    expect(within(variables).getByText(/topic/)).toBeInTheDocument()
  })

  it('navigates from the list into a prompt', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts', () =>
        HttpResponse.json({
          items: [
            {
              promptId: 'p1',
              name: 'Greeting',
              createdAt: 'x',
              updatedAt: 'x',
            },
          ],
          hasMore: false,
        }),
      ),
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
          name: 'Greeting',
          description: null,
          promptText: 'Hello',
          model: 'claude-opus-4-8',
          systemPrompt: null,
          maxTokens: 1000,
          effort: 'medium',
          thinking: 'off',
          variables: [],
          createdAt: 'x',
          updatedAt: 'x',
        }),
      ),
    )

    renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'Greeting' }))

    expect(
      await screen.findByRole('link', { name: 'Prompt Vault - Greeting' }),
    ).toBeInTheDocument()
  })

  it('shows "no prompts yet" when the list is empty and unsearched', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts', () =>
        HttpResponse.json({ items: [], hasMore: false }),
      ),
    )

    renderApp('/')

    expect(await screen.findByText('No prompts yet.')).toBeInTheDocument()
  })

  it('typing in the search box debounces a request with q and filters the list', async () => {
    const user = userEvent.setup()
    setToken('t')
    let capturedUrl: string | undefined
    server.use(
      http.get('/api/prompts', ({ request }) => {
        capturedUrl = request.url
        const q = new URL(request.url).searchParams.get('q')
        const all = [
          {
            promptId: 'p1',
            name: 'Email Summarizer',
            createdAt: 'x',
            updatedAt: 'x',
          },
          {
            promptId: 'p2',
            name: 'Code Reviewer',
            createdAt: 'x',
            updatedAt: 'x',
          },
        ]
        const filtered = q
          ? all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
          : all
        return HttpResponse.json({ items: filtered, hasMore: false })
      }),
    )

    renderApp('/')
    expect(
      await screen.findByRole('link', { name: /Email Summarizer/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Code Reviewer/ }),
    ).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'email')

    await waitFor(() => {
      expect(capturedUrl).toContain('q=email')
    })
    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: /Code Reviewer/ }),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('link', { name: /Email Summarizer/ }),
    ).toBeInTheDocument()
  })

  it('shows "no matches for this search" distinctly from "no prompts yet"', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')
        return HttpResponse.json({
          items: q
            ? []
            : [
                {
                  promptId: 'p1',
                  name: 'Alpha',
                  createdAt: 'x',
                  updatedAt: 'x',
                },
              ],
          hasMore: false,
        })
      }),
    )

    renderApp('/')
    await screen.findByRole('link', { name: /Alpha/ })

    await user.type(screen.getByRole('searchbox'), 'zzz')

    expect(
      await screen.findByText('No matches for this search.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No prompts yet.')).not.toBeInTheDocument()
  })

  it('clearing the search box restores the full list', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')
        const all = [
          {
            promptId: 'p1',
            name: 'Alpha',
            createdAt: 'x',
            updatedAt: 'x',
          },
          {
            promptId: 'p2',
            name: 'Beta',
            createdAt: 'x',
            updatedAt: 'x',
          },
        ]
        return HttpResponse.json({
          items: q ? all.filter((p) => p.name.includes(q)) : all,
          hasMore: false,
        })
      }),
    )

    renderApp('/')
    await screen.findByRole('link', { name: /Alpha/ })

    const search = screen.getByRole('searchbox')
    await user.type(search, 'Alpha')
    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: /Beta/ }),
      ).not.toBeInTheDocument()
    })

    await user.clear(search)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Beta/ })).toBeInTheDocument()
    })
  })

  it('clicking "Load more" appends the next page and then disappears', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        return page === '1'
          ? HttpResponse.json({
              items: [
                {
                  promptId: 'p1',
                  name: 'First',
                  createdAt: 'x',
                  updatedAt: 'x',
                },
              ],
              hasMore: true,
            })
          : HttpResponse.json({
              items: [
                {
                  promptId: 'p2',
                  name: 'Second',
                  createdAt: 'x',
                  updatedAt: 'x',
                },
              ],
              hasMore: false,
            })
      }),
    )

    renderApp('/')

    expect(
      await screen.findByRole('link', { name: /First/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Second/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(
      await screen.findByRole('link', { name: /Second/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /First/ })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument()
  })
})
