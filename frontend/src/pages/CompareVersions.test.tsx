import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

const promptDetail = {
  promptId: 'p1',
  versions: [
    {
      versionId: 'v1',
      number: 1,
      name: 'First',
      createdAt: 'x',
      current: false,
    },
    {
      versionId: 'v2',
      number: 2,
      name: 'Second',
      createdAt: 'x',
      current: true,
    },
  ],
}

function version(overrides: Record<string, unknown>) {
  return {
    promptId: 'p1',
    versionId: 'v1',
    number: 1,
    name: 'First',
    description: null,
    promptText: 'Hello world',
    model: 'claude-opus-4-8',
    systemPrompt: null,
    maxTokens: 100,
    effort: 'medium',
    thinking: 'off',
    variables: [],
    createdAt: 'x',
    ...overrides,
  }
}

describe('version diff view', () => {
  it('selecting two versions and clicking Compare navigates to the right URL', async () => {
    const user = userEvent.setup()
    setToken('t')

    server.use(
      http.get('/api/prompts/p1', () => HttpResponse.json(promptDetail)),
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(version({ number: 1, name: 'First' })),
      ),
      http.get('/api/prompts/p1/versions/2', () =>
        HttpResponse.json(
          version({ versionId: 'v2', number: 2, name: 'Second' }),
        ),
      ),
    )

    renderApp('/prompts/p1/version')
    await screen.findByRole('link', { name: 'Prompt Vault - Versions: Second' })
    await screen.findByLabelText('From version')

    await user.selectOptions(screen.getByLabelText('From version'), '1')
    await user.selectOptions(screen.getByLabelText('To version'), '2')
    await user.click(screen.getByRole('link', { name: 'Compare' }))

    expect(
      await screen.findByRole('link', {
        name: 'Prompt Vault - Compare v1 → v2',
      }),
    ).toBeInTheDocument()
  })

  it('renders a word-level diff of a prompt_text change', async () => {
    setToken('t')

    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(
          version({ number: 1, promptText: 'Hello brave world' }),
        ),
      ),
      http.get('/api/prompts/p1/versions/2', () =>
        HttpResponse.json(
          version({
            versionId: 'v2',
            number: 2,
            promptText: 'Hello new world',
          }),
        ),
      ),
    )

    renderApp('/prompts/p1/compare?from=1&to=2')

    await screen.findByRole('link', { name: 'Prompt Vault - Compare v1 → v2' })
    const pre = document.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.querySelector('del.diff-removed')?.textContent).toBe('brave')
    expect(pre?.querySelector('ins.diff-added')?.textContent).toBe('new')
    expect(pre?.textContent).toContain('Hello')
    expect(pre?.textContent).toContain('world')
  })

  it('shows a Run Settings change (model) as old → new', async () => {
    setToken('t')

    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(version({ number: 1, model: 'claude-opus-4-8' })),
      ),
      http.get('/api/prompts/p1/versions/2', () =>
        HttpResponse.json(
          version({
            versionId: 'v2',
            number: 2,
            model: 'claude-haiku-4-5',
          }),
        ),
      ),
    )

    renderApp('/prompts/p1/compare?from=1&to=2')

    await screen.findByRole('link', { name: 'Prompt Vault - Compare v1 → v2' })
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(
      screen.getByText('claude-opus-4-8 → claude-haiku-4-5'),
    ).toBeInTheDocument()
  })

  it('omits fields that did not change', async () => {
    setToken('t')

    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(version({ number: 1, name: 'Same name' })),
      ),
      http.get('/api/prompts/p1/versions/2', () =>
        HttpResponse.json(
          version({
            versionId: 'v2',
            number: 2,
            name: 'Same name',
            model: 'claude-haiku-4-5',
          }),
        ),
      ),
    )

    renderApp('/prompts/p1/compare?from=1&to=2')

    await screen.findByRole('link', { name: 'Prompt Vault - Compare v1 → v2' })
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.queryByText('Name')).not.toBeInTheDocument()
  })

  it('shows no differences when comparing a Version to itself', async () => {
    setToken('t')

    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(version({ number: 1 })),
      ),
    )

    renderApp('/prompts/p1/compare?from=1&to=1')

    await screen.findByRole('link', { name: 'Prompt Vault - Compare v1 → v1' })
    expect(screen.getByText('No other differences.')).toBeInTheDocument()
    const pre = document.querySelector('pre')
    expect(pre?.querySelector('ins.diff-added')).toBeNull()
    expect(pre?.querySelector('del.diff-removed')).toBeNull()
  })
})
