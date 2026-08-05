import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptTabs } from '../components/PromptTabs'
import { RunForm } from '../components/RunForm'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import { useRunStream } from '../lib/useRunStream'
import type { VersionResponse } from '../lib/types'

export function RunPage() {
  const { id = '', number = '' } = useParams()

  // No number in the URL (/prompts/:id/run) means "run the current version",
  // which the backend serves directly at /versions/current.
  const isCurrentRun = number === ''
  const target = number || 'current'
  const version = useQuery({
    queryKey: ['version', id, target],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${target}`),
  })
  usePageTitle(version.data ? `Run: ${version.data.name}` : 'Run')

  // Runs execute against a concrete version, so drive the stream off the
  // resolved number rather than the (possibly absent) URL param.
  const runNumber = String(version.data?.number ?? '')
  const { status, output, runId, failure, run } = useRunStream(id, runNumber)

  // A prompt with no variables has nothing to fill in, so run it immediately.
  // Guarding on status (rather than a ref) both prevents re-triggering once
  // the run has started and survives useRunStream's reset on navigation.
  // Schedule the run in a microtask rather than calling it synchronously
  // here: run() flips status to 'running', and setState inside an effect
  // body would trigger a cascading render (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (status !== 'idle' || !version.data) return
    if (version.data.variables.length === 0) {
      queueMicrotask(() => run({}))
    }
  }, [version.data, run, status])

  if (version.isPending) {
    return <Loading />
  }
  if (version.isError || !version.data) {
    return <LoadError>Could not load this version.</LoadError>
  }

  return (
    <>
      <PromptTabs
        promptId={id}
        versionNumber={version.data.number}
        current={isCurrentRun}
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
