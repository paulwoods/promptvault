import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type {
  RunFailure,
  RunTransport,
  RunUsage,
  StreamHandlers,
} from './streamRun'
import { streamRun } from './streamRun'
import { UNAUTHORIZED_EVENT } from './apiClient'
import { getToken, setToken } from './auth'
import { server } from '../test/server'

const RUN_URL = '/api/prompts/p1/run'

/**
 * A transport handing back one canned event-stream `Response`, delivered as
 * the given chunks so a frame can be cut across a boundary. The body is
 * complete before the read begins: nothing here waits on a clock.
 */
function stream(...chunks: string[]): RunTransport {
  return () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    })
    return Promise.resolve(
      new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
  }
}

/** A sink that records everything it is handed. */
function recordingSink() {
  const tokens: string[] = []
  const completions: RunUsage[] = []
  const errors: RunFailure[] = []
  const sink: StreamHandlers = {
    onToken: (text) => tokens.push(text),
    onDone: (usage) => completions.push(usage),
    onError: (info) => errors.push(info),
  }
  return { tokens, completions, errors, sink }
}

const DONE =
  'event:done\ndata:{"status":"completed","usage":{"inputTokens":1,"outputTokens":2}}\n\n'

const USAGE = { inputTokens: 1, outputTokens: 2 }

describe('streamRun frame parsing', () => {
  it('skips a malformed frame without discarding what was already streamed', async () => {
    const { tokens, completions, sink } = recordingSink()

    await streamRun('p1', sink, {
      transport: stream(
        'event:token\ndata:{"text":"Hello"}\n\n',
        'event:token\ndata:{"text": NOT-JSON\n\n',
        'event:token\ndata:{"text":" world"}\n\n',
        DONE,
      ),
    })

    expect(tokens).toEqual(['Hello', ' world'])
    expect(completions).toEqual([USAGE])
  })

  it('parses CRLF framing', async () => {
    const { tokens, completions, sink } = recordingSink()

    await streamRun('p1', sink, {
      transport: stream(
        'event:token\r\ndata:{"text":"Hi"}\r\n\r\n',
        'event:done\r\ndata:{"status":"completed","usage":{"inputTokens":1,"outputTokens":2}}\r\n\r\n',
      ),
    })

    expect(tokens).toEqual(['Hi'])
    expect(completions).toEqual([USAGE])
  })

  /** "split" is delivered with its terminator \r in one chunk and \n in the next. */
  it('rejoins a CRLF that a chunk boundary cuts in two', async () => {
    const { tokens, completions, sink } = recordingSink()

    await streamRun('p1', sink, {
      transport: stream(
        'event:token\r\ndata:{"text":"split"}\r',
        `\n\r\n${DONE}`,
      ),
    })

    expect(tokens).toEqual(['split'])
    expect(completions).toEqual([USAGE])
  })

  it('ignores comments, ids and retries, and unknown events', async () => {
    const { tokens, completions, errors, sink } = recordingSink()

    await streamRun('p1', sink, {
      transport: stream(
        ': keep-alive\n\n',
        'id: 5\nretry: 3000\nevent:token\ndata:{"text":"quiet"}\n\n',
        // An event this protocol never names (its default would be `message`,
        // which is not one of the three either) arrives and is ignored in place.
        'event:unannounced\ndata:{"anything":true}\n\n',
        DONE,
      ),
    })

    expect(tokens).toEqual(['quiet'])
    expect(completions).toEqual([USAGE])
    expect(errors).toEqual([])
  })
})

describe('streamRun truncation', () => {
  it('reports a close with no terminal frame as an error', async () => {
    const { tokens, completions, errors, sink } = recordingSink()

    await streamRun('p1', sink, {
      transport: stream(
        'event:token\ndata:{"text":"half an "}\n\n',
        'event:token\ndata:{"text":"answer"}\n\n',
      ),
    })

    // The tokens stand — the answer is partial, not absent — but the run has
    // to be told it is over, or nothing downstream ever moves off `running`.
    expect(tokens).toEqual(['half an ', 'answer'])
    expect(completions).toEqual([])
    expect(errors).toEqual([
      {
        category: 'TRUNCATED',
        message:
          'The run ended before it finished. The answer above is partial.',
      },
    ])
  })

  it('says nothing extra when the stream ended on an error frame', async () => {
    const { errors, sink } = recordingSink()

    await streamRun('p1', sink, {
      transport: stream(
        'event:error\ndata:{"status":"failed","category":"RATE_LIMIT","message":"Claude rate limit exceeded"}\n\n',
      ),
    })

    // The wire's envelope does not escape: `status` is dropped and the
    // category is this client's own union, not whatever string arrived.
    expect(errors).toEqual([
      { category: 'RATE_LIMIT', message: 'Claude rate limit exceeded' },
    ])
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
    const unauthorized: RunTransport = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: 'unauthorized',
            message: 'The token expired',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    try {
      await expect(
        streamRun('p1', recordingSink().sink, { transport: unauthorized }),
      ).rejects.toMatchObject({ code: 'unauthorized' })
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, listener)
    }

    expect(getToken()).toBeNull()
    expect(fired).toBe(1)
  })
})

/**
 * The injected transport is the production default, so nothing above proves
 * which request the run actually makes. This is the one test that does.
 */
describe('streamRun over the network', () => {
  it('POSTs the run endpoint with the Bearer token', async () => {
    setToken('t')
    const seen: { method?: string; url?: string; auth?: string | null } = {}
    server.use(
      http.post(RUN_URL, ({ request }) => {
        seen.method = request.method
        seen.url = new URL(request.url).pathname
        seen.auth = request.headers.get('Authorization')
        return new HttpResponse(DONE, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )
    const { completions, sink } = recordingSink()

    await streamRun('p1', sink)

    expect(seen).toEqual({
      method: 'POST',
      url: RUN_URL,
      auth: 'Bearer t',
    })
    expect(completions).toEqual([USAGE])
  })
})
