import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { RunUsage, StreamHandlers } from './streamRun'
import { streamRun } from './streamRun'
import { UNAUTHORIZED_EVENT } from './apiClient'
import { getToken, setToken } from './auth'
import { server } from '../test/server'

const RUN_URL = '/api/prompts/p1/run'

/** An SSE body the test feeds frame by frame, as MSW's streaming mocks do. */
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

/** A sink that records everything it is handed. */
function recordingSink() {
  const tokens: string[] = []
  const completions: RunUsage[] = []
  const errors: { category: string; message: string }[] = []
  const sink: StreamHandlers = {
    onToken: (text) => tokens.push(text),
    onDone: (usage) => completions.push(usage),
    onError: (info) => errors.push(info),
  }
  return { tokens, completions, errors, sink }
}

function serve(body: ReadableStream<Uint8Array>) {
  server.use(
    http.post(
      RUN_URL,
      () =>
        new HttpResponse(body, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    ),
  )
}

const DONE =
  'event:done\ndata:{"status":"completed","usage":{"inputTokens":1,"outputTokens":2}}\n\n'

describe('streamRun frame parsing', () => {
  it('skips a malformed frame without discarding what was already streamed', async () => {
    const stream = sseStream()
    serve(stream.stream)
    const { tokens, completions, sink } = recordingSink()

    stream.push('event:token\ndata:{"text":"Hello"}\n\n')
    stream.push('event:token\ndata:{"text": NOT-JSON\n\n')
    stream.push('event:token\ndata:{"text":" world"}\n\n')
    stream.push(DONE)
    stream.close()

    await streamRun('p1', sink)

    expect(tokens).toEqual(['Hello', ' world'])
    expect(completions).toEqual([{ inputTokens: 1, outputTokens: 2 }])
  })

  it('parses CRLF framing', async () => {
    const stream = sseStream()
    serve(stream.stream)
    const { tokens, completions, sink } = recordingSink()

    stream.push('event:token\r\ndata:{"text":"Hi"}\r\n\r\n')
    stream.push(
      'event:done\r\ndata:{"status":"completed","usage":{"inputTokens":1,"outputTokens":2}}\r\n\r\n',
    )
    stream.close()

    await streamRun('p1', sink)

    expect(tokens).toEqual(['Hi'])
    expect(completions).toEqual([{ inputTokens: 1, outputTokens: 2 }])
  })

  /** "split" is pushed with its terminator \r in one chunk and \n in the next. */
  it('rejoins a CRLF that a chunk boundary cuts in two', async () => {
    const stream = sseStream()
    serve(stream.stream)
    const { tokens, completions, sink } = recordingSink()

    stream.push('event:token\r\ndata:{"text":"split"}\r')
    stream.push(`\n\r\n${DONE}`)
    stream.close()

    await streamRun('p1', sink)

    expect(tokens).toEqual(['split'])
    expect(completions).toEqual([{ inputTokens: 1, outputTokens: 2 }])
  })

  it('ignores comments, ids and retries, and unknown events', async () => {
    const stream = sseStream()
    serve(stream.stream)
    const { tokens, completions, errors, sink } = recordingSink()

    stream.push(': keep-alive\n\n')
    stream.push('id: 5\nretry: 3000\nevent:token\ndata:{"text":"quiet"}\n\n')
    // An event this protocol never names (its default would be `message`,
    // which is not one of the three either) arrives and is ignored in place.
    stream.push('event:unannounced\ndata:{"anything":true}\n\n')
    stream.push(DONE)
    stream.close()

    await streamRun('p1', sink)

    expect(tokens).toEqual(['quiet'])
    expect(completions).toEqual([{ inputTokens: 1, outputTokens: 2 }])
    expect(errors).toEqual([])
  })
})

describe('streamRun auth', () => {
  it('clears the token and announces it on a 401, then throws', async () => {
    setToken('t')
    let fired = 0
    const listener = () => {
      fired += 1
    }
    window.addEventListener(UNAUTHORIZED_EVENT, listener)
    server.use(
      http.post(RUN_URL, () =>
        HttpResponse.json(
          { error: 'unauthorized', message: 'The token expired' },
          { status: 401 },
        ),
      ),
    )

    try {
      await expect(streamRun('p1', recordingSink().sink)).rejects.toMatchObject(
        {
          code: 'unauthorized',
        },
      )
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, listener)
    }

    expect(getToken()).toBeNull()
    expect(fired).toBe(1)
  })
})
