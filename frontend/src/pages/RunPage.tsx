import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { RunForm } from '../components/RunForm'
import { ApiError } from '../lib/ApiError'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { streamRun } from '../lib/streamRun'
import type { VersionResponse } from '../lib/types'

type RunStatus = 'idle' | 'running' | 'completed' | 'failed'

export function RunPage() {
  const { id = '', number = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const version = useQuery({
    queryKey: ['version', id, number],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${number}`),
  })

  const [status, setStatus] = useState<RunStatus>('idle')
  const [output, setOutput] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const autoRan = useRef(false)

  const run = useCallback(
    (values: Record<string, string>) => {
      setStatus('running')
      setOutput('')
      setRunId(null)
      setFailure(null)
      streamRun(id, number, values, {
        onMeta: (meta) => setRunId(meta.runId),
        onToken: (text) => setOutput((current) => current + text),
        onDone: () => {
          setStatus('completed')
          void queryClient.invalidateQueries({ queryKey: ['runs'] })
        },
        onError: (info) => {
          setStatus('failed')
          setFailure(info.message)
          void queryClient.invalidateQueries({ queryKey: ['runs'] })
        },
      }).catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'no_api_key') {
          navigate('/settings/api-key')
          return
        }
        setStatus('failed')
        setFailure(errorMessage(error))
      })
    },
    [id, number, navigate, queryClient],
  )

  // A prompt with no variables has nothing to fill in, so run it immediately.
  // Schedule the run in a microtask rather than calling it synchronously here:
  // run() flips status to 'running', and setState inside an effect body would
  // trigger a cascading render (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (autoRan.current || !version.data) return
    if (version.data.variables.length === 0) {
      autoRan.current = true
      queueMicrotask(() => run({}))
    }
  }, [version.data, run])

  if (version.isPending) {
    return <Loading />
  }
  if (version.isError || !version.data) {
    return <LoadError>Could not load this version.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} versionNumber={number} />
      <PageHeader
        title={`Run ${version.data.name} (v${version.data.number})`}
      />
      {status === 'idle' ? (
        <RunForm variables={version.data.variables} onRun={run} />
      ) : (
        <section>
          <p>Status: {status}</p>
          <pre aria-label="response">{output}</pre>
          {status === 'failed' && failure && <ErrorAlert>{failure}</ErrorAlert>}
          {runId && (
            <p>
              <Link to={`/prompts/${id}/runs/${runId}`}>Open this run</Link>
            </p>
          )}
        </section>
      )}
    </>
  )
}
