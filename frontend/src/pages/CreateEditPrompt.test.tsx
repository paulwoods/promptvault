import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('create / edit prompt', () => {
  it('saving a prompt produces a new version and navigates to it', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.post('/api/prompts', () =>
        HttpResponse.json(
          { promptId: 'p9', versionId: 'v1', number: 1 },
          { status: 201 },
        ),
      ),
      http.get('/api/prompts/p9', () =>
        HttpResponse.json({
          promptId: 'p9',
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

    renderApp('/prompts/new')
    await user.type(await screen.findByLabelText('Name'), 'Greeting')
    await user.type(screen.getByLabelText('User Prompt'), 'Hello there')
    await user.click(screen.getByRole('button', { name: 'Create prompt' }))

    expect(
      await screen.findByRole('heading', { name: 'Versions: Greeting' }),
    ).toBeInTheDocument()
  })

  it('shows the server placeholder/variable mismatch error inline', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.post('/api/prompts', () =>
        HttpResponse.json(
          {
            error: 'validation_error',
            message: 'Validation failed',
            details: { variables: 'mismatch' },
          },
          { status: 400 },
        ),
      ),
    )

    renderApp('/prompts/new')
    await user.type(await screen.findByLabelText('Name'), 'Greeting')
    await user.type(screen.getByLabelText('User Prompt'), 'Hello {{name}}')
    await user.click(screen.getByRole('button', { name: 'Create prompt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Validation failed',
    )
    expect(
      screen.getByRole('heading', { name: 'New prompt' }),
    ).toBeInTheDocument()
  })

  it('hides effort and forces thinking off when Haiku is selected', async () => {
    const user = userEvent.setup()
    setToken('t')

    renderApp('/prompts/new')
    // Default model (opus) supports effort + adaptive thinking.
    expect(await screen.findByLabelText('Effort')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Model'), 'claude-haiku-4-5')

    expect(screen.queryByLabelText('Effort')).not.toBeInTheDocument()
    const thinking = screen.getByLabelText('Thinking')
    expect(thinking).toBeDisabled()
    expect(thinking).toHaveValue('off')
    expect(
      screen.queryByRole('option', { name: 'adaptive' }),
    ).not.toBeInTheDocument()
  })

  it('edits from a version, seeding the form and appending a new version', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versionId: 'v1',
          number: 1,
          name: 'Original',
          description: null,
          promptText: 'Hello',
          model: 'claude-opus-4-8',
          systemPrompt: null,
          maxTokens: 1000,
          effort: 'medium',
          thinking: 'off',
          variables: [],
          createdAt: 'x',
        }),
      ),
      http.post('/api/prompts/p1/versions', () =>
        HttpResponse.json(
          { promptId: 'p1', versionId: 'v2', number: 2 },
          { status: 201 },
        ),
      ),
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

    renderApp('/prompts/p1/versions/1/edit')
    const nameField = await screen.findByLabelText('Name')
    expect(nameField).toHaveValue('Original')
    await user.clear(nameField)
    await user.type(nameField, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save new version' }))

    expect(
      await screen.findByRole('heading', { name: 'Versions: Renamed' }),
    ).toBeInTheDocument()
  })

  it('edits the current version at /prompts/:id/edit', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/current', () =>
        HttpResponse.json({
          promptId: 'p1',
          versionId: 'v2',
          number: 2,
          name: 'Current',
          description: null,
          promptText: 'Hello',
          model: 'claude-opus-4-8',
          systemPrompt: null,
          maxTokens: 1000,
          effort: 'medium',
          thinking: 'off',
          variables: [],
          createdAt: 'x',
        }),
      ),
      http.post('/api/prompts/p1/versions', () =>
        HttpResponse.json(
          { promptId: 'p1', versionId: 'v3', number: 3 },
          { status: 201 },
        ),
      ),
      http.get('/api/prompts/p1', () =>
        HttpResponse.json({
          promptId: 'p1',
          versions: [
            {
              versionId: 'v3',
              number: 3,
              name: 'Renamed',
              createdAt: 'x',
              current: true,
            },
          ],
        }),
      ),
    )

    renderApp('/prompts/p1/edit')
    const nameField = await screen.findByLabelText('Name')
    expect(nameField).toHaveValue('Current')
    await user.clear(nameField)
    await user.type(nameField, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save new version' }))

    expect(
      await screen.findByRole('heading', { name: 'Versions: Renamed' }),
    ).toBeInTheDocument()
  })
})
