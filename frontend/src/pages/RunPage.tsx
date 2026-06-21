import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
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

  function run(values: Record<string, string>) {
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
  }

  if (version.isPending) {
    return <p>Loading…</p>
  }
  if (version.isError || !version.data) {
    return <p>Could not load this version.</p>
  }

  return (
    <main>
      <h1>
        Run {version.data.name} (v{version.data.number})
      </h1>
      {status === 'idle' ? (
        <RunForm variables={version.data.variables} onRun={run} />
      ) : (
        <section>
          <p>Status: {status}</p>
          <pre aria-label="response">{output}</pre>
          {status === 'failed' && failure && <p role="alert">{failure}</p>}
          {runId && (
            <p>
              <Link to={`/runs/${runId}`}>Open this run</Link>
            </p>
          )}
        </section>
      )}
    </main>
  )
}
