import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptTabs } from '../components/PromptTabs'
import { RunForm } from '../components/RunForm'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import { useRunStream } from '../lib/useRunStream'
import type { PromptResponse } from '../lib/types'

export function RunPage() {
  const { id = '' } = useParams()

  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptResponse>(`/api/prompts/${id}`),
  })
  usePageTitle(prompt.data ? `Run: ${prompt.data.name}` : 'Run')

  const { status, output, failure, run } = useRunStream(id)

  // A prompt with no variables has nothing to fill in, so run it immediately.
  // Guarding on status (rather than a ref) both prevents re-triggering once
  // the run has started and survives useRunStream's reset on navigation.
  // Schedule the run in a microtask rather than calling it synchronously
  // here: run() flips status to 'running', and setState inside an effect
  // body would trigger a cascading render (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (status !== 'idle' || !prompt.data) return
    if (prompt.data.variables.length === 0) {
      queueMicrotask(() => run({}))
    }
  }, [prompt.data, run, status])

  if (prompt.isPending) {
    return <Loading />
  }
  if (prompt.isError || !prompt.data) {
    return <LoadError>Could not load this prompt.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} />
      {status === 'idle' ? (
        <RunForm variables={prompt.data.variables} onRun={run} />
      ) : (
        <section>
          <p>Status: {status}</p>
          <pre aria-label="response">{output}</pre>
          {status === 'failed' && failure && <ErrorAlert>{failure}</ErrorAlert>}
        </section>
      )}
    </>
  )
}
