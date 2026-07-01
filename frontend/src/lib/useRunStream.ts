import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from './ApiError'
import { errorMessage } from './errorMessage'
import { streamRun } from './streamRun'

export type RunStatus = 'idle' | 'running' | 'completed' | 'failed'

interface RunStreamState {
  status: RunStatus
  output: string
  failure: string | null
  runId: string | null
}

const IDLE_STATE: RunStreamState = {
  status: 'idle',
  output: '',
  failure: null,
  runId: null,
}

/**
 * Owns the lifecycle of a single streamed Run: idle -> running -> completed/failed.
 * Resets to idle when promptId/versionNumber changes even though the caller
 * (RunPage) isn't remounted for a route-param-only navigation — adjusted during
 * render, not an effect, per
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
 * A missing API key redirects to the settings page instead of failing the Run;
 * every settled Run (completed or failed) invalidates the run history list.
 */
export function useRunStream(promptId: string, versionNumber: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [state, setState] = useState<RunStreamState>(IDLE_STATE)

  const runKey = `${promptId}/${versionNumber}`
  const [prevRunKey, setPrevRunKey] = useState(runKey)
  if (runKey !== prevRunKey) {
    setPrevRunKey(runKey)
    setState(IDLE_STATE)
  }

  const run = useCallback(
    (values: Record<string, string>) => {
      setState({ status: 'running', output: '', failure: null, runId: null })
      streamRun(promptId, versionNumber, values, {
        onMeta: (meta) =>
          setState((current) => ({ ...current, runId: meta.runId })),
        onToken: (text) =>
          setState((current) => ({
            ...current,
            output: current.output + text,
          })),
        onDone: () => {
          setState((current) => ({ ...current, status: 'completed' }))
          void queryClient.invalidateQueries({ queryKey: ['runs'] })
        },
        onError: (info) => {
          setState((current) => ({
            ...current,
            status: 'failed',
            failure: info.message,
          }))
          void queryClient.invalidateQueries({ queryKey: ['runs'] })
        },
      }).catch((error: unknown) => {
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
    },
    [promptId, versionNumber, navigate, queryClient],
  )

  return { ...state, run }
}
