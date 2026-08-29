import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useEffect, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthListener } from '../app/AuthListener'
import { setToken, getToken } from './auth'
import { server } from '../test/server'
import { useRunStream } from './useRunStream'

const RUN_URL = '/api/prompts/p1/run'

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

let currentPath = ''

function LocationProbe() {
  const { pathname } = useLocation()
  useEffect(() => {
    currentPath = pathname
  }, [pathname])
  return null
}

function makeWrapper(queryClient: QueryClient, withAuthListener = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/prompts/p1/console']}>
          <LocationProbe />
          {withAuthListener && <AuthListener />}
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  setToken('t')
  currentPath = '/prompts/p1/console'
})

describe('useRunStream', () => {
  it('streams tokens to completion', async () => {
    const { stream, push, close } = sseStream()
    server.use(
      http.post(
        RUN_URL,
        () =>
          new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    )
    const queryClient = new QueryClient()

    const { result } = renderHook(() => useRunStream('p1'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => result.current.run())
    await waitFor(() => expect(result.current.status).toBe('running'))

    act(() => push('event:token\ndata:{"text":"Hello"}\n\n'))
    await waitFor(() => expect(result.current.output).toBe('Hello'))

    act(() => {
      push(
        'event:done\ndata:{"status":"completed","usage":{"inputTokens":1,"outputTokens":1}}\n\n',
      )
      close()
    })

    await waitFor(() => expect(result.current.status).toBe('completed'))
  })

  it('sets failed status with the message from an error frame', async () => {
    const { stream, push, close } = sseStream()
    server.use(
      http.post(
        RUN_URL,
        () =>
          new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    )
    const queryClient = new QueryClient()

    const { result } = renderHook(() => useRunStream('p1'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => result.current.run())
    act(() => {
      push(
        'event:error\ndata:{"status":"failed","category":"AUTH","message":"Authentication with Claude failed"}\n\n',
      )
      close()
    })

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.failure).toBe('Authentication with Claude failed')
  })

  it('redirects to the API key settings page on no_api_key instead of failing', async () => {
    server.use(
      http.post(RUN_URL, () =>
        HttpResponse.json(
          { error: 'no_api_key', message: 'No API key saved' },
          { status: 400 },
        ),
      ),
    )
    const queryClient = new QueryClient()

    const { result } = renderHook(() => useRunStream('p1'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => result.current.run())

    await waitFor(() => expect(currentPath).toBe('/settings/api-key'))
    expect(result.current.status).toBe('running')
  })

  it('resets to idle when the prompt changes mid-run', async () => {
    const { stream, push } = sseStream()
    server.use(
      http.post(
        RUN_URL,
        () =>
          new HttpResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    )
    const queryClient = new QueryClient()

    const { result, rerender } = renderHook(
      ({ promptId }) => useRunStream(promptId),
      {
        wrapper: makeWrapper(queryClient),
        initialProps: { promptId: 'p1' },
      },
    )

    act(() => result.current.run())
    act(() => push('event:token\ndata:{"text":"Hello"}\n\n'))
    await waitFor(() => expect(result.current.output).toBe('Hello'))

    rerender({ promptId: 'p2' })

    expect(result.current.status).toBe('idle')
    expect(result.current.output).toBe('')
  })

  it('stop aborts the fetch and leaves the partial output on screen', async () => {
    const captured: { signal?: AbortSignal } = {}
    const { stream, push } = sseStream()
    server.use(
      http.post(RUN_URL, ({ request }) => {
        captured.signal = request.signal
        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )
    const queryClient = new QueryClient()

    const { result } = renderHook(() => useRunStream('p1'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => result.current.run())
    await waitFor(() => expect(result.current.status).toBe('running'))
    act(() => push('event:token\ndata:{"text":"partial"}\n\n'))
    await waitFor(() => expect(result.current.output).toBe('partial'))

    act(() => result.current.stop())

    await waitFor(() => expect(captured.signal?.aborted).toBe(true))
    expect(result.current.status).toBe('stopped')
    expect(result.current.output).toBe('partial')

    // After the abort nothing reads the stream any more, so a frame pushed
    // afterwards can never reach the (unmounted) output.
    act(() => push('event:token\ndata:{"text":"-too late"}\n\n'))
    expect(result.current.output).toBe('partial')
  })

  it('aborts the fetch when the hook unmounts mid-run', async () => {
    const captured: { signal?: AbortSignal } = {}
    const { stream } = sseStream()
    server.use(
      http.post(RUN_URL, ({ request }) => {
        captured.signal = request.signal
        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )
    const queryClient = new QueryClient()

    const { result, unmount } = renderHook(() => useRunStream('p1'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => result.current.run())
    await waitFor(() => expect(result.current.status).toBe('running'))

    unmount()

    // The one hard failure of leaving without the abort: the fetch keeps
    // reading and the settled state updates into a hook that is not there.
    await waitFor(() => expect(captured.signal?.aborted).toBe(true))
  })

  it('clears the token and routes to login on a 401 from the run endpoint', async () => {
    setToken('expired-token')
    server.use(
      http.post(RUN_URL, () =>
        HttpResponse.json(
          { error: 'unauthorized', message: 'The token expired' },
          { status: 401 },
        ),
      ),
    )
    const queryClient = new QueryClient()

    // The real AuthListener rides along because it is the component that
    // turns the announced 401 into the /login route.
    const { result } = renderHook(() => useRunStream('p1'), {
      wrapper: makeWrapper(queryClient, true),
    })

    act(() => result.current.run())

    await waitFor(() => expect(currentPath).toBe('/login'))
    expect(getToken()).toBeNull()
  })
})
