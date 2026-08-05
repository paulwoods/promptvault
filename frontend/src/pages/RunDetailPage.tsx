import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptTabs } from '../components/PromptTabs'
import { SimpleList } from '../components/SimpleList'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import type { RunDetail } from '../lib/types'

export function RunDetailPage() {
  const { id = '', runId = '' } = useParams()
  const { data, isPending, isError } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => apiClient.get<RunDetail>(`/api/runs/${runId}`),
  })
  usePageTitle('Run Detail')

  if (isPending) {
    return <Loading />
  }
  if (isError || !data) {
    return <LoadError>Could not load this run.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} versionNumber={data.versionNumber} />
      <dl>
        <dt>Version</dt>
        <dd>v{data.versionNumber}</dd>
        <dt>Status</dt>
        <dd>{data.status}</dd>
        <dt>Model</dt>
        <dd>{data.model}</dd>
        {data.inputTokens != null && (
          <>
            <dt>Input tokens</dt>
            <dd>{data.inputTokens}</dd>
          </>
        )}
        {data.outputTokens != null && (
          <>
            <dt>Output tokens</dt>
            <dd>{data.outputTokens}</dd>
          </>
        )}
      </dl>

      <section>
        <h2>Variable values</h2>
        {Object.keys(data.variableValues).length === 0 ? (
          <EmptyState>None</EmptyState>
        ) : (
          <SimpleList>
            {Object.entries(data.variableValues).map(([name, value]) => (
              <li key={name}>
                {name}: {value}
              </li>
            ))}
          </SimpleList>
        )}
      </section>

      <section>
        <h2>Rendered prompt</h2>
        <pre>{data.renderedPrompt}</pre>
      </section>

      {data.response != null && (
        <section>
          <h2>Response</h2>
          <pre aria-label="response">{data.response}</pre>
        </section>
      )}
      {data.status === 'failed' && data.errorMessage && (
        <ErrorAlert>{data.errorMessage}</ErrorAlert>
      )}
    </>
  )
}
