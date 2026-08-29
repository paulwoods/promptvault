import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from './ApiError'
import { errorMessage } from './errorMessage'
import { streamRun } from './streamRun'

export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped'

interface RunStreamState {
  status: RunStatus
  output: string
  failure: string | null
}

const IDLE_STATE: RunStreamState = {
  status: 'idle',
  output: '',
  failure: null,
}

/** An aborted HTTP request surfaces as an error named `AbortError`. */
function isAbort(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { name?: string }).name === 'AbortError'
  )
}

/**
 * Owns the lifecycle of a single streamed run: idle -> running -> completed/failed,
 * with running -> stopped when the run is stopped or its owner unmounts. Nothing
 * is persisted (ADR-0007), so this state is the only record a run happened —
 * navigating away discards it. Resets to idle when promptId changes even though
 * the caller (the Console's RunPane) isn't remounted for a route-param-only
 * navigation — the cleanup effect below covers both leaving and switching.
 * A missing API key redirects to the settings page instead of failing the run.
 */
export function useRunStream(promptId: string) {
  const navigate = useNavigate()

  const [state, setState] = useState<RunStreamState>(IDLE_STATE)

  // The run in flight, if any. Holding the controller is what makes `stop` and
  // the cleanup below able to reach it.
  const controllerRef = useRef<AbortController | null>(null)

  const run = useCallback(() => {
    // Defensive: only one run can rightly stream at a time, and a stale
    // endpoint whose terminal frame never arrived must not linger.
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ status: 'running', output: '', failure: null })
    streamRun(
      promptId,
      {
        onToken: (text) =>
          setState((current) => ({
            ...current,
            output: current.output + text,
          })),
        onDone: () =>
          setState((current) => ({ ...current, status: 'completed' })),
        onError: (info) =>
          setState((current) => ({
            ...current,
            status: 'failed',
            failure: info.message,
          })),
      },
      { signal: controller.signal },
    ).catch((error: unknown) => {
      // No state here for an abort: `stop` already set it, and the cleanup and
      // prompt-change aborts must not overwrite the idle reset that follows.
      if (isAbort(error)) {
        return
      }
      if (error instanceof ApiError && error.code === 'no_api_key') {
        navigate('/settings/api-key')
        return
      }
      setState((current) => ({
        ...current,
        status: 'failed',
        failure: errorMessage(error),
      }))
    })
  }, [promptId, navigate])

  /** Ends the run in flight: the output stops growing and stays on screen. */
  const stop = useCallback(() => {
    if (!controllerRef.current) {
      return
    }
    controllerRef.current.abort()
    controllerRef.current = null
    // Set here rather than in the abort rejection above: the rejection is
    // asynchronous and a prompt change landing between the two would first
    // reset to idle — the stopped mark must not outlive the run it names.
    setState((current) =>
      current.status === 'running'
        ? { ...current, status: 'stopped' }
        : current,
    )
  }, [])

  // Leaving the Console mid-run ends the run, and so does switching prompts:
  // the run in flight was answered for the old prompt, its tokens must not
  // start filling the new one's output, and a stream nobody is reading is
  // only tokens still being billed. Cleanup runs for both unmount and a
  // promptId change, and resets the output to idle in the same breath.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
      setState(IDLE_STATE)
    }
  }, [promptId])

  return { ...state, run, stop }
}
