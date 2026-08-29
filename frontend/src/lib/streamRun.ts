import { clearAndAnnounceUnauthorized, toApiError } from './apiClient'
import { getToken } from './auth'

/**
 * A stream that stopped mid-answer. Not a category the backend can send — it
 * is this client's conclusion about a body that ended without saying why.
 */
export const TRUNCATED = 'TRUNCATED'

export interface RunUsage {
  inputTokens: number
  outputTokens: number
}

export interface StreamHandlers {
  onToken: (text: string) => void
  onDone: (usage: RunUsage) => void
  onError: (info: { category: string; message: string }) => void
}

export interface StreamOptions {
  /** Cancels the run: the reader rejects and no further tokens are consumed. */
  signal?: AbortSignal
}

/**
 * Consumes the streaming run endpoint: a Bearer POST whose response is a
 * text/event-stream parsed with a ReadableStream reader and our own SSE frame
 * parser (the three named events). The prompt is run as stored (ADR-0009) —
 * there is no request body. Pre-stream failures arrive as a JSON error
 * envelope and are thrown as an ApiError (e.g. no_api_key) for the caller to route.
 */
export async function streamRun(
  promptId: string,
  handlers: StreamHandlers,
  options: StreamOptions = {},
): Promise<void> {
  const token = getToken()
  const response = await fetch(`/api/prompts/${promptId}/run`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: options.signal,
  })

  const contentType = response.headers.get('content-type') ?? ''
  if (
    !response.ok ||
    !response.body ||
    !contentType.includes('text/event-stream')
  ) {
    if (response.status === 401) {
      clearAndAnnounceUnauthorized()
    }
    throw await toApiError(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  // A `done` or `error` frame is the stream saying how it ended. Without one,
  // the end of the body is the only thing left to conclude from — see below.
  let terminated = false
  // Holds a trailing \r that may be the first half of a CRLF continuing in the
  // next chunk — without the hold, a split pair would normalise into a blank
  // line, closing a frame at exactly the wrong place.
  let carriageHold = ''
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buffer += carriageHold
    carriageHold = ''
    buffer += decoder.decode(value, { stream: true })
    // CRLF framing is tolerated: the SSE spec allows \n, \r\n and a bare \r.
    // A \r at the tail is held back (see carriageHold) in case it pairs with
    // the next chunk's \n.
    if (buffer.endsWith('\r')) {
      carriageHold = buffer.slice(-1)
      buffer = buffer.slice(0, -1)
    }
    buffer = buffer.replace(/\r\n?/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      terminated = dispatch(buffer.slice(0, boundary), handlers) || terminated
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
    }
  }
  // The body ended with neither terminal frame: the key was spent and the
  // answer is cut off, which is a failure. Reported rather than resolved
  // quietly, because a silent resolve leaves the run `running` forever — the
  // caller has no other signal that the stream is over.
  if (!terminated) {
    handlers.onError({
      category: TRUNCATED,
      message: 'The run ended before it finished. The answer above is partial.',
    })
  }
}

/** Dispatches one frame; returns whether it was a terminal one. */
function dispatch(rawEvent: string, handlers: StreamHandlers): boolean {
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of rawEvent.split('\n')) {
    // `:` starts a comment line, which carries nothing (keep-alives).
    if (line.startsWith(':')) {
      continue
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
    }
    // `id:` and `retry:` and any unknown field are ignored: the run is
    // one-shot with no reconnect, so there is nothing to remember them for.
  }
  const data = dataLines.join('\n')
  if (data === '') {
    return false
  }
  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    // One frame we cannot read is skipped in place: throwing out of the reader
    // loop would discard everything already streamed, and a re-read is not an
    // option on a one-shot stream.
    return false
  }
  switch (eventName) {
    case 'token':
      handlers.onToken((payload as { text: string }).text)
      return false
    case 'done':
      handlers.onDone((payload as { status: string; usage: RunUsage }).usage)
      return true
    case 'error':
      handlers.onError(
        payload as { status: string; category: string; message: string },
      )
      return true
    default:
      return false
  }
}
