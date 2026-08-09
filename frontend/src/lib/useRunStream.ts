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
}

const IDLE_STATE: RunStreamState = {
  status: 'idle',
  output: '',
  failure: null,
}

/**
 * Owns the lifecycle of a single streamed run: idle -> running -> completed/failed.
 * Nothing is persisted (ADR-0007), so this state is the only record a run
 * happened — navigating away discards it. Resets to idle when promptId changes
 * even though the caller (the Console's RunPane) isn't remounted for a
 * route-param-only navigation — adjusted during render, not an effect, per
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
 * A missing API key redirects to the settings page instead of failing the run.
 */
export function useRunStream(promptId: string) {
  const navigate = useNavigate()

  const [state, setState] = useState<RunStreamState>(IDLE_STATE)

  const [prevPromptId, setPrevPromptId] = useState(promptId)
  if (promptId !== prevPromptId) {
    setPrevPromptId(promptId)
    setState(IDLE_STATE)
  }

  const run = useCallback(() => {
    setState({ status: 'running', output: '', failure: null })
    streamRun(promptId, {
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
  }, [promptId, navigate])

  return { ...state, run }
}
