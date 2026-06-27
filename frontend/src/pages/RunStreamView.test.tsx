import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setToken } from '../lib/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

const RUN_URL = '/api/prompts/p1/versions/1/runs'

function versionNoVars() {
  return {
    promptId: 'p1',
    versionId: 'v1',
    number: 1,
    name: 'P',
    description: null,
    promptText: 'hi',
    model: 'claude-opus-4-8',
    systemPrompt: null,
    maxTokens: 1000,
    effort: 'medium',
    thinking: 'off',
    variables: [],
    createdAt: 'x',
  }
}

function sseStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  const encoder = new TextEncoder()
  const push = (frame: string) => controller.enqueue(encoder.encode(frame))
  const close = () => controller.close()
  return { stream, push, close }
}

describe('streamed run view', () => {
  it('renders tokens incrementally, shows in-progress, then completed', async () => {
    const user = userEvent.setup()
    setToken('t')
    const { stream, push, close } = sseStream()
    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(versionNoVars()),
      ),
      http.post(
        RUN_URL,
        () =>
          new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    )

    renderApp('/prompts/p1/versions/1/run')
    await user.click(await screen.findByRole('button', { name: 'Run' }))

    expect(screen.getByText('Status: running')).toBeInTheDocument()
    push('event:meta\ndata:{"runId":"r1","versionNumber":1}\n\n')
    push('event:token\ndata:{"text":"Hello"}\n\n')
    push('event:token\ndata:{"text":" world"}\n\n')

    await expect
      .poll(() => screen.getByLabelText('response').textContent)
      .toContain('Hello world')
    // Still in progress before the terminal frame arrives.
    expect(screen.getByText('Status: running')).toBeInTheDocument()

    push(
      'event:done\ndata:{"status":"completed","usage":{"inputTokens":3,"outputTokens":5}}\n\n',
    )
    close()

    await screen.findByText('Status: completed')
  })

  it('drives the failed state from an error frame', async () => {
    const user = userEvent.setup()
    setToken('t')
    const { stream, push, close } = sseStream()
    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(versionNoVars()),
      ),
      http.post(
        RUN_URL,
        () =>
          new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    )

    renderApp('/prompts/p1/versions/1/run')
    await user.click(await screen.findByRole('button', { name: 'Run' }))

    push('event:meta\ndata:{"runId":"r1","versionNumber":1}\n\n')
    push(
      'event:error\ndata:{"status":"failed","category":"AUTH","message":"Authentication with Claude failed"}\n\n',
    )
    close()

    await screen.findByText('Status: failed')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Authentication with Claude failed',
    )
  })

  it('routes to the api-key screen on no_api_key', async () => {
    const user = userEvent.setup()
    setToken('t')
    server.use(
      http.get('/api/prompts/p1/versions/1', () =>
        HttpResponse.json(versionNoVars()),
      ),
      http.get('/api/me/api-key', () =>
        HttpResponse.json({ hasKey: false, updatedAt: null }),
      ),
      http.post(RUN_URL, () =>
        HttpResponse.json(
          { error: 'no_api_key', message: 'No API key saved' },
          { status: 400 },
        ),
      ),
    )

    renderApp('/prompts/p1/versions/1/run')
    await user.click(await screen.findByRole('button', { name: 'Run' }))

    await screen.findByRole('heading', { name: 'API Key' })
  })
})
