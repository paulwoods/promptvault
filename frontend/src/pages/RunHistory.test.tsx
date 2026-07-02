import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('run history', () => {
  it('lists runs from multiple versions together on the runs page', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versions: [
            {
              versionId: 'v2',
              number: 2,
              name: 'Current',
              createdAt: 'x',
              current: true,
            },
          ],
        }),
      ),
      http.get('/api/prompts/p1/runs', () =>
        HttpResponse.json({
          items: [
            {
              runId: 'rA',
              versionNumber: 2,
              status: 'completed',
              responsePreview: 'answer A',
              createdAt: 'x',
            },
            {
              runId: 'rB',
              versionNumber: 1,
              status: 'failed',
              responsePreview: null,
              createdAt: 'x',
            },
          ],
          hasMore: false,
        }),
      ),
    )

    renderApp('/prompts/p1/runs')

    expect(
      await screen.findByRole('link', { name: /v2 — completed/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /v1 — failed/ }),
    ).toBeInTheDocument()
  })

  it('re-opens a completed run with full detail', async () => {
    setToken('t')
    server.use(
      http.get('/api/runs/rA', () =>
        HttpResponse.json({
          runId: 'rA',
          versionNumber: 2,
          model: 'claude-opus-4-8',
          variableValues: { topic: 'rivers' },
          renderedPrompt: 'Tell me about rivers',
          response: 'Rivers are watercourses.',
          inputTokens: 12,
          outputTokens: 34,
          status: 'completed',
          errorCategory: null,
          errorMessage: null,
          createdAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1/runs/rA')

    expect(await screen.findByLabelText('response')).toHaveTextContent(
      'Rivers are watercourses.',
    )
    expect(screen.getByText(/topic: rivers/)).toBeInTheDocument()
    expect(screen.getByText('Tell me about rivers')).toBeInTheDocument()
  })

  it('navigates from the runs page into a run', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({ promptId: 'p1', versions: [] }),
      ),
      http.get('/api/prompts/p1/runs', () =>
        HttpResponse.json({
          items: [
            {
              runId: 'rA',
              versionNumber: 1,
              status: 'completed',
              responsePreview: 'hi',
              createdAt: 'x',
            },
          ],
          hasMore: false,
        }),
      ),
      http.get('/api/runs/rA', () =>
        HttpResponse.json({
          runId: 'rA',
          versionNumber: 1,
          model: 'claude-opus-4-8',
          variableValues: {},
          renderedPrompt: 'hi',
          response: 'hello',
          inputTokens: 1,
          outputTokens: 1,
          status: 'completed',
          errorCategory: null,
          errorMessage: null,
          createdAt: 'x',
        }),
      ),
    )

    renderApp('/prompts/p1/runs')
    await user.click(
      await screen.findByRole('link', { name: /v1 — completed/ }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Run Detail' }),
    ).toBeInTheDocument()
  })

  it('selecting a status filters the per-Prompt run view and "all" restores it', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({ promptId: 'p1', versions: [] }),
      ),
      http.get('/api/prompts/p1/runs', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        const all = [
          {
            runId: 'rA',
            versionNumber: 1,
            status: 'completed',
            responsePreview: 'ok',
            createdAt: 'x',
          },
          {
            runId: 'rB',
            versionNumber: 1,
            status: 'failed',
            responsePreview: null,
            createdAt: 'x',
          },
        ]
        return HttpResponse.json({
          items: status ? all.filter((r) => r.status === status) : all,
          hasMore: false,
        })
      }),
    )

    renderApp('/prompts/p1/runs')
    expect(
      await screen.findByRole('link', { name: /v1 — completed/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /v1 — failed/ }),
    ).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Status'), 'completed')

    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: /v1 — failed/ }),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('link', { name: /v1 — completed/ }),
    ).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Status'), 'All statuses')

    expect(
      await screen.findByRole('link', { name: /v1 — failed/ }),
    ).toBeInTheDocument()
  })

  it('shows the per-Version run view, filterable by status', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/2/runs', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        const all = [
          {
            runId: 'rA',
            versionNumber: 2,
            status: 'completed',
            responsePreview: 'ok',
            createdAt: 'x',
          },
          {
            runId: 'rB',
            versionNumber: 2,
            status: 'in_progress',
            responsePreview: null,
            createdAt: 'x',
          },
        ]
        return HttpResponse.json({
          items: status ? all.filter((r) => r.status === status) : all,
          hasMore: false,
        })
      }),
    )

    renderApp('/prompts/p1/versions/2/runs')

    expect(
      await screen.findByRole('link', { name: /v2 — completed/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /v2 — in_progress/ }),
    ).toBeInTheDocument()
  })

  it('clicking "Load more" appends further runs on the per-Prompt view and then disappears', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({ promptId: 'p1', versions: [] }),
      ),
      http.get('/api/prompts/p1/runs', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        return page === '1'
          ? HttpResponse.json({
              items: [
                {
                  runId: 'rA',
                  versionNumber: 1,
                  status: 'completed',
                  responsePreview: 'a',
                  createdAt: 'x',
                },
              ],
              hasMore: true,
            })
          : HttpResponse.json({
              items: [
                {
                  runId: 'rB',
                  versionNumber: 1,
                  status: 'failed',
                  responsePreview: null,
                  createdAt: 'x',
                },
              ],
              hasMore: false,
            })
      }),
    )

    renderApp('/prompts/p1/runs')

    expect(
      await screen.findByRole('link', { name: /v1 — completed/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /v1 — failed/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(
      await screen.findByRole('link', { name: /v1 — failed/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /v1 — completed/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument()
  })

  it('clicking "Load more" appends further runs on the per-Version view and then disappears', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/2/runs', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        return page === '1'
          ? HttpResponse.json({
              items: [
                {
                  runId: 'rA',
                  versionNumber: 2,
                  status: 'completed',
                  responsePreview: 'a',
                  createdAt: 'x',
                },
              ],
              hasMore: true,
            })
          : HttpResponse.json({
              items: [
                {
                  runId: 'rB',
                  versionNumber: 2,
                  status: 'failed',
                  responsePreview: null,
                  createdAt: 'x',
                },
              ],
              hasMore: false,
            })
      }),
    )

    renderApp('/prompts/p1/versions/2/runs')

    expect(
      await screen.findByRole('link', { name: /v2 — completed/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /v2 — failed/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(
      await screen.findByRole('link', { name: /v2 — failed/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /v2 — completed/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument()
  })
})
