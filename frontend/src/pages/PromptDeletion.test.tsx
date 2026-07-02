import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('prompt deletion and trash', () => {
  it('deletes immediately (no confirmation) and moves the prompt to Trash', async () => {
    const user = userEvent.setup()
    setToken('t')

    let prompts = [
      {
        promptId: 'p1',
        name: 'ToDelete',
        currentVersionNumber: 1,
        createdAt: 'x',
      },
    ]
    let trash: { promptId: string; name: string; deletedAt: string }[] = []

    server.use(
      http.get('/api/prompts', () =>
        HttpResponse.json({ items: prompts, hasMore: false }),
      ),
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versions: [
            {
              versionId: 'v1',
              number: 1,
              name: 'ToDelete',
              createdAt: 'x',
              current: true,
            },
          ],
        }),
      ),
      http.get('/api/prompts/trash', () => HttpResponse.json(trash)),
      http.delete('/api/prompts/p1', () => {
        trash = [
          {
            promptId: 'p1',
            name: 'ToDelete',
            deletedAt: '2026-01-01T00:00:00Z',
          },
        ]
        prompts = []
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderApp('/prompts/p1')
    await screen.findByRole('heading', { name: 'Version History' })

    // No confirmation dialog: a single click fires the delete immediately.
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Deletion navigates away (the prompt's own page would now 404) and the
    // prompt list no longer shows it.
    await screen.findByRole('heading', { name: 'Your Prompts' })
    expect(screen.queryByText('ToDelete')).not.toBeInTheDocument()

    renderApp('/trash')
    expect(await screen.findByText('ToDelete')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })

  it('lists only Trashed prompts, minimally (name + deleted-at + Restore)', async () => {
    setToken('t')
    server.use(
      http.get('/api/prompts/trash', () =>
        HttpResponse.json([
          {
            promptId: 'p1',
            name: 'InTrash',
            deletedAt: '2026-01-01T00:00:00Z',
          },
        ]),
      ),
    )

    renderApp('/trash')

    expect(await screen.findByText('InTrash')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })

  it('shows an empty state when Trash has nothing in it', async () => {
    setToken('t')
    server.use(http.get('/api/prompts/trash', () => HttpResponse.json([])))

    renderApp('/trash')

    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
  })

  it('restore removes the prompt from Trash and returns it to the normal list', async () => {
    const user = userEvent.setup()
    setToken('t')

    let trash = [
      { promptId: 'p1', name: 'Restorable', deletedAt: '2026-01-01T00:00:00Z' },
    ]
    let prompts: {
      promptId: string
      name: string
      currentVersionNumber: number
      createdAt: string
    }[] = []

    server.use(
      http.get('/api/prompts/trash', () => HttpResponse.json(trash)),
      http.get('/api/prompts', () =>
        HttpResponse.json({ items: prompts, hasMore: false }),
      ),
      http.post('/api/prompts/p1/restore', () => {
        trash = []
        prompts = [
          {
            promptId: 'p1',
            name: 'Restorable',
            currentVersionNumber: 1,
            createdAt: 'x',
          },
        ]
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderApp('/trash')
    await screen.findByText('Restorable')

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()

    renderApp('/')
    expect(
      await screen.findByRole('link', { name: /Restorable/ }),
    ).toBeInTheDocument()
  })
})
