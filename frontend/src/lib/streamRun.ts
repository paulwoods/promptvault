import { UNAUTHORIZED_EVENT, toApiError } from './apiClient'
import { clearToken, getToken } from './auth'

export interface RunUsage {
  inputTokens: number
  outputTokens: number
}

export interface StreamHandlers {
  onToken: (text: string) => void
  onDone: (usage: RunUsage) => void
  onError: (info: { category: string; message: string }) => void
}

/**
 * Consumes the streaming run endpoint: a Bearer POST whose response is a
 * text/event-stream parsed with a ReadableStream reader and our own SSE frame
 * parser (the three named events). Pre-stream failures arrive as a JSON error
 * envelope and are thrown as an ApiError (e.g. no_api_key) for the caller to route.
 */
export async function streamRun(
  promptId: string,
  values: Record<string, string>,
  handlers: StreamHandlers,
): Promise<void> {
  const token = getToken()
  const response = await fetch(`/api/prompts/${promptId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ values }),
  })

  const contentType = response.headers.get('content-type') ?? ''
  if (
    !response.ok ||
    !response.body ||
    !contentType.includes('text/event-stream')
  ) {
    if (response.status === 401) {
      clearToken()
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw await toApiError(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      dispatch(buffer.slice(0, boundary), handlers)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
    }
  }
}

function dispatch(rawEvent: string, handlers: StreamHandlers): void {
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of rawEvent.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
    }
  }
  const data = dataLines.join('\n')
  if (data === '') {
    return
  }
  const payload = JSON.parse(data)
  switch (eventName) {
    case 'token':
      handlers.onToken((payload as { text: string }).text)
      break
    case 'done':
      handlers.onDone((payload as { usage: RunUsage }).usage)
      break
    case 'error':
      handlers.onError(payload as { category: string; message: string })
      break
    default:
      break
  }
}
